# Decisions

Four that shaped everything else, then what was deliberately left out.

---

## 1. Authorization is a branded context in the service layer

**Context.** Every route takes an id from outside. Items belong to workspaces,
roles are owner / member / viewer, and the brief says to assume someone is
pasting an item id into curl. Something has to make cross-workspace access
impossible, and "impossible" has to survive the next twenty routes somebody adds.

**Chosen.** `requireWorkspaceContext(workspaceId, minRole)`
([`requireWorkspaceContext` — workspaceContext.ts:26](src/server/workspace/service/workspaceContext.ts#L26))
returns a branded `WorkspaceContext`
([`WorkspaceContext` — context.ts:19](src/server/workspace/model/context.ts#L19)), and **no repository
function accepts a bare id** — the only signature is `(ctx, itemId)`, and every
query filters on `ctx.workspaceId`. The brand cannot be produced by writing an
object literal, so a query that skips the check does not compile.

It sits in the service layer because that is the only layer that knows both who
the caller is and how to reach the database. Putting it in `proxy.ts` (Next 16's
renamed middleware) is impossible in principle: nothing outside the database
knows which workspace an item id belongs to. Next's own documentation agrees —
proxy "should not be used as a full session management or authorization
solution."

The attack this exists for is the **confused deputy**: a caller's own legitimate
`workspaceId` paired with a foreign `itemId`. A membership check passes, a
`findUnique({ id })` returns the foreign row, and both lines are individually
correct. That is not a forgotten check — it is a missing relationship between two
correct ones, and no amount of care fixes it. Making the wrong query
unformulatable does.

Two smaller choices follow from it. A foreign workspace answers **404, never
403**, because 403 confirms the resource exists; 403 is reserved for a viewer
inside their own workspace, where existence is not a secret. And a malformed id
is 404 rather than a database error surfacing as a 500.

**Strongest alternative rejected: Postgres RLS.** It is the stronger guarantee —
it protects the data, not merely the application.

What ruled it out is that here, its most likely outcome is policies that look
correct and never run. Prisma creates the tables and connects as their owner,
and owners bypass RLS unless `FORCE ROW LEVEL SECURITY` is set. The app behaves
identically with and without the policies, so there is no symptom until somebody
tries the attack.

Doing it properly means a separate non-owner role, grants re-applied after every
migration, and `SET LOCAL` inside an explicit transaction on every query,
because the connection pooler runs in transaction mode.

It also fights two other requirements. RLS can only make rows invisible, so
R1's "0 rows updated" stops distinguishing "somebody was first" from "wrong
workspace" and "you are a viewer" — three cases the interface must word
differently. And the extra membership subquery muddies the very plans R4 asks us
to paste.

A guarantee that cannot be pointed at is worse than an absent one.

**Costs.** Raw SQL is the hole types cannot close: R1's conditional update and
R4's keyset query are hand-written, and `$queryRaw` does not see the brand. That
is held by a rule — raw SQL lives only in `repository/`, and every statement
carries `workspace_id` — not by the compiler. And the database itself remains
open to anything that reaches it outside the app.

**Wrong later.** At ten engineers, or the first background worker that talks to
the database directly, the rule stops being enough and RLS becomes worth its
price as a second barrier. The moment to add it is when a second writer appears,
not when traffic grows.

---

## 2. The claim race is decided by one statement, and the UI does not pretend otherwise

**Context.** Two members claim the same item simultaneously. Exactly one must
win, the other must learn who has it, and the UI must reconcile without a manual
refresh — under real concurrency, not just when clicks arrive in order.

**Chosen.** One conditional statement
([`itemMutations.claim` — itemRepository.ts:130](src/server/queue/repository/itemRepository.ts#L130)):

```sql
update items set status = 'claimed', claimed_by_id = $me, claimed_at = now()
 where id = $item and workspace_id = $ws and status = 'open'
returning *
```

Postgres locks the row, the second writer re-evaluates `status = 'open'` against
the updated value, and gets nothing back. Zero rows is an answer, not a
failure. The service then does one scoped read — on the losing path only — to
say why, because zero rows is ambiguous between "somebody was first",
"already resolved" and "no such item here". That read cannot reintroduce the
race: the decision is already durable.

Losing returns 200, not 409. The request was valid and authorized; the body
carries the outcome and the fresh row. Statuses describe what happened to the
request; the body describes what happened in the world.

The interface half matters as much. Claim is deliberately not optimistic
([`useItemActions` — useItemActions.ts:50](src/client/features/queue/hooks/useItemActions.ts#L50)). It is a
contended action — its outcome is unknown at click time — so drawing it as
"yours" before the server answers states something that is not yet true, and
anybody who closes the tab in that instant walks away believing it. The button
shows a pending state that asserts nothing, and the response settles it. The
brief asks two different questions about these two moments, and the difference is
the point: about claiming it asks for "a clear result", about resolving it asks
whether it "feels immediate".

**Strongest alternative rejected: read the row, check it, then write.** It is the
obvious shape and it reads better. What ruled it out is that the gap between the
read and the write is exactly where the race lives — under real concurrency both
callers read `open` and both write. A transaction with `SELECT … FOR UPDATE`
would also be correct, but it is two statements and a longer lock to buy what one
statement already guarantees.

**Costs.** The losing path costs a second query. Holder state lives on the item
row rather than in a `claims` table, so there is no claim history — the
current holder is known, but not who held it before or how often it bounced.

**Wrong later.** The first requirement resembling "show me how many times this
item was reopened", or any audit need, forces an append-only claim-events table.
At that point the conditional update stays and gains an insert beside it, in the
same transaction, exactly as the outbox does today.

---

## 3. Notifications go through a transactional outbox: at-least-once, with a visible record

**Context.** `notify()` sleeps about a second and throws on roughly one call in
five, and making it reliable is not allowed. Resolving must not wait on it,
nothing may disappear silently, and on serverless no process survives the
response.

**Chosen.** The resolve and a `notification_jobs` row are written in **one
transaction** ([`resolveItem` — claimService.ts:72](src/server/queue/service/claimService.ts#L72)),
so the intent to notify becomes durable at the same instant the resolve does, or
neither happened. The response then goes out. Delivery happens elsewhere, with
two triggers and only one of them a guarantee: `after()` on the resolve route is
a fast path that runs once the response is sent and dies with the function, and
the cron route is what makes delivery eventually happen regardless of whether
anyone is using the app.

The guarantee is **at-least-once with a visible record**. Not exactly-once: if
`notify()` succeeds and the process dies before the row is marked sent, the next
drain sends it again. Attempts and the next backoff are written before the
attempt ([`claimDueWhere` — notificationJobRepository.ts:20](src/server/notifications/repository/notificationJobRepository.ts#L20)),
so a process that dies mid-delivery leaves a job that retries rather than one
stuck in flight — at-least-once chosen over at-most-once, deliberately. After
five failures a job is marked dead and keeps its last error, and
`/api/workspaces/:id/notifications` surfaces both counts, so "nothing disappears
silently" is something a person can see rather than a row nobody can read.

Two overlapping drains are the same race as R1 in another place, and get the same
treatment: `for update skip locked` inside the claiming statement.

**Strongest alternative rejected: call `notify()` without awaiting it.** One
line, no table, and the resolve returns immediately. What ruled it out is that it
satisfies half the requirement and silently fails the other half — a rejected
promise on a serverless function that is already shutting down tells nobody
anything, and there is no record that the notification was ever owed.

**A note on the resolve that arrives late.** A claim that expired returns its
item to the queue, and the resolve that follows should still count — the work was
done. The first implementation allowed it by widening the condition to
`or status = 'open'`, which a review caught: that let any member resolve any
unclaimed item by curl, without ever holding it, quietly undoing the rule that a
claim is how work is not duplicated. `last_claimed_by_id` now survives the sweep,
so the late resolve is accepted only from the person who did the work — and
`release` clears it, because releasing says "not mine".

**Costs.** A table, a cron route and a retry state machine for what looks like a
fire-and-forget call. Duplicate notifications are possible and accepted. On
Vercel's Hobby plan, cron granularity is limited, so scheduled retries are slower
than the backoff allows — mitigated by every resolve draining a batch of whatever
else is due, which means retries track activity rather than the clock.

**Wrong later.** At 100× the volume, one hourly drain of 50 jobs stops keeping
up, and this becomes a real queue — the outbox row stays exactly as it is, and
the drain becomes a worker reading it continuously. The table also needs a
retention policy long before that; sent rows currently accumulate forever.

---

## 4. Pagination is keyset, ordered by a key that cannot change

**Context.** ~10k rows with filters, and other people claiming and resolving
while somebody pages through. Ordering must stay stable, pages must not skip or
repeat, and the list must not be fetched whole.

**Chosen.** Keyset (cursor) pagination on `(created_at DESC, id DESC)`
([itemRepository.listPage](src/server/queue/repository/itemRepository.ts)). The
cursor is the sort key of the last row on the page; the next page asks for what
sorts strictly after it.

The decision underneath is the sort key is immutable. Sorting a queue by
status is the obvious choice and the wrong one: claiming an item would move it
between pages, so the list reshuffles under the reader and keyset breaks exactly
as `OFFSET` does. Status is a filter instead, with its own index. And `id` in the
cursor is not decoration — `created_at` is not unique after a bulk insert, and
with tied values Postgres may order them differently between two queries, which
is precisely what makes a row appear twice or never.

Measured on the seeded 10k, page 101 (50 rows), both plans from
`npm run verify:r4`:

```
--- NAIVE: OFFSET 5000 ---
Limit  (cost=296.76..299.73 rows=50) (actual time=2.934..2.963 rows=50 loops=1)
  Buffers: shared hit=5073
  ->  Index Scan using items_ws_created_id_idx on items  (actual time=0.016..2.682 rows=5050 loops=1)
        Index Cond: (workspace_id = '…'::uuid)
        Buffers: shared hit=5073
Execution Time: 3.002 ms

--- OURS: keyset from the cursor ---
Limit  (cost=0.29..10.78 rows=50) (actual time=0.016..0.070 rows=50 loops=1)
  Buffers: shared hit=51
  ->  Index Scan using items_ws_created_id_idx on items  (actual time=0.015..0.064 rows=50 loops=1)
        Index Cond: ((workspace_id = '…'::uuid) AND (ROW(created_at, id) < ROW('2026-06-08 13:30:19.606+00'::timestamptz, '…'::uuid)))
        Buffers: shared hit=51
Execution Time: 0.118 ms
```

Both use the same index. `OFFSET` does not lose because it misses the index — it
loses because it must produce all 5,000 skipped rows and discard them, 5,073
buffers against 51. In the keyset plan the tuple comparison lands in `Index
Cond`, not `Filter`, so it is served by the index rather than filtered after
reading. The cost of `OFFSET` grows with depth; keyset's does not.

**Strongest alternative rejected: `LIMIT/OFFSET`.** It is trivial, supports
jumping to an arbitrary page, and gives a page count. What ruled it out is that
it counts positions, and positions shift the moment the set changes underneath
— `verify:r4` demonstrates a row being skipped entirely after one item leaves the
filtered set, which is the brief's "pages don't skip or repeat rows" failing in
one step.

**Costs — the failure mode, stated plainly.** No jump to an arbitrary page and no
page count; only "next". Going backwards needs a second query with the comparison
reversed. And keyset guarantees no skips and no repeats — it does not
guarantee the set stays the same: under a status filter, rows legitimately leave
while you read, so a later page can hold fewer rows than expected. That is the
queue being alive, and the UI shows each row's status rather than hiding it.

**Wrong later.** The first request for "go to page 47" or "sort by who has it"
breaks the model rather than bending it: the first needs a counted index, the
second needs a mutable sort key and therefore a different strategy — most likely
a stable snapshot id per browsing session.

---

## Three things deliberately not done

**1. Realtime push.** A Supabase Broadcast signal — an empty message that
triggers invalidation while the data keeps flowing through our API, so the
authorization guard re-runs — would cut the staleness window from ~2s to ~50ms.

It is not built because correctness does not depend on it: a losing claim learns
the truth from the response to its own request. One file would change
([`QUEUE_SYNC_OPTIONS` — useQueueSync.ts:48](src/client/features/queue/hooks/useQueueSync.ts#L48)).
Polling has to exist anyway as the fallback — a dropped socket without one turns
"2 seconds stale" into "frozen forever", which is the worse lie.

What polling costs is measurable: ~3.5 KB per tick including headers, only while
a tab is focused, ~4 MB across a full review session. It breaks on billing
rather than capability — roughly 50 concurrent readers per workspace is ~2.2M
function invocations a day, which Postgres would not notice and the invoice
would.

Subscribing to `postgres_changes` instead would be the wrong shape at any scale:
it always ships the row, straight to the browser, past the guard.

The signal is the safer shape, but calling it free would be overclaiming, and
the reason is worth stating because it is not obvious. Sending no payload
protects the data — a listener still has to come through the API to learn
anything, and gets a 404 there. It does not protect the *channel*. A browser
subscribes to `workspace:{id}` directly, with the publishable key, and that
subscription never reaches `requireWorkspaceContext`; nothing would stop
somebody listening to a workspace they have no part in. What leaks is not rows
but rhythm — when a queue is busy, when a team starts work, when it stops.
Small, but R2 says no cross-workspace reads, and a timing channel is a read of
one bit.

Supabase's answer to that is private channels, gated by RLS on the realtime
messages table. Which closes the loop: the same RLS this project rejected in
decision 1 is what the realtime upgrade would need to be genuinely safe. So the
"one file would change" above is true of the client code and false of the work —
doing it properly means taking on the mechanism we declined, and that is the
honest reason it sits here rather than in the built column.

**2. RLS as a second barrier.** Rejected as the primary mechanism above, and not
added underneath either — half-configured RLS is worse than none, and doing it
properly is a day of work plus a permanent maintenance obligation. What is on
is Supabase's automatic RLS with no policies, purely so the auto-generated Data
API cannot serve anything to the anon key. That is a barrier on a channel we do
not use, not our authorization model, and calling it otherwise would be the exact
overclaiming the brief warns about.

**3. Backwards pagination and a page count.** Both are real gaps in the list, and
both are consequences of the pagination decision rather than oversights. A triage
queue is scrolled, not jumped through, so neither has been missed in use.

---

## What I would refactor first

`claimService.ts` holds claim, release and resolve, and resolve reaches
directly into the notifications repository to enqueue a job — one file with two
responsibilities and a hard dependency between two features. I would split it and
have the resolve emit a domain event the notifications side subscribes to. It is
still here because there is exactly one consumer of that event today, and
inventing an event bus for one consumer is the abstraction that makes the next
person's job harder, not easier — but the second consumer is the moment to do it.
