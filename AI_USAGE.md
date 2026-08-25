# AI usage

## Where I used it

Throughout, and for the whole scaffold. I worked with Claude the way I would
work with a fast pair: I made the architectural calls, it wrote the code, and I
pushed back when the reasoning did not hold.

The split in practice:

- Design, before any code. Most of the time went into a long discussion of
  the five requirements — where the authorization check belongs and why, whether
  the claim race can be closed at all, what guarantee the notifications actually
  have. `CLAUDE.md` is the output of that discussion, written before the first
  line of implementation, and the decisions in `DECISIONS.md` were argued there
  rather than reconstructed afterwards.
- Implementation. Schema, migration, seed, routes, hooks, components,
  verification scripts. Nearly all of it typed by the assistant.
- Verification. Every requirement has a runnable check, and I asked for those
  before I trusted any claim about the code.

Not scored, and I did not spend care there: the `create-next-app` scaffold,
Tailwind setup, the shape of the components.

---

## Two places I disagreed, and what I did instead

### 1. It wanted the claim to be optimistic. It cannot be.

The assistant's first UI proposal applied an optimistic update to `claim`: paint
the row as yours on click, roll back if the server disagrees. Standard practice,
and it is what React Query is good at.

I did not accept it, because of a case it had not considered: **a user can close
the tab in the moment between the click and the response.** If the UI has already
drawn "claimed by you", that person leaves believing they own an item they may
have lost. The interface lied, and there is no later render in which to correct
it.

Its first counter-argument was that a faster channel would shrink the window. It
does not — the tab is gone, so no websocket delivers anything either. The
problem was never the transport; it was rendering an outcome that had not
happened yet.

What we did instead: claim shows a pending state that asserts nothing — the
button spins, the status badge does not change — and the response settles it.
Release and resolve stay uncontended, so their outcome is genuinely known in
advance.

→ [`useItemActions` — useItemActions.ts:50](src/client/features/queue/hooks/useItemActions.ts#L50)

The rule that came out of it is now in `CLAUDE.md`: optimistic updates are
honest only where the outcome is predetermined. Re-reading the brief afterwards,
it draws the same line — it asks for "a clear result" about claiming and asks
whether resolving "feels immediate".

### 2. It said polling was fine. I asked what it costs, twice.

The assistant recommended polling every 2 seconds and moved on. I pushed twice:
first on how much data that shifts, then on the principle — we are building
something that should scale, and re-sending 50 identical rows every 2 seconds to
learn that nothing changed is not that.

Being pushed produced three things it had not volunteered:

1. Actual numbers: ~3.5 KB per tick including headers, ~4 MB across a full
   review session — and the correction that its own earlier suggestion (polling a
   tiny `max(updated_at)` endpoint instead) saves far less than implied, because
   at that payload size HTTP headers dominate, not the body.
2. A real fix rather than a smaller poll. An infinite query refetches every
   loaded page per tick, sequentially, so request rate grows with how far you
   scroll. The interval now scales with page count, keeping requests-per-second
   flat. `maxPages` is the obvious fix and is wrong here: this is a "Load more"
   list rather than a virtualised one, so evicting a page would remove rows still
   visible on screen. It was specified in the draft of `CLAUDE.md` that the
   scaffold copy silently overwrote — restored in `a8d514a`, which is why the
   rejection is visible in the code and the commit rather than in that file's
   history.
3. A stated breaking point instead of a reassurance: polling fails on
   billing, not capability, at roughly 50 concurrent readers per workspace.

→ [`QUEUE_SYNC_OPTIONS` — useQueueSync.ts:48](src/client/features/queue/hooks/useQueueSync.ts#L48)

### A third, worth recording

I questioned whether Supabase was in the brief at all. It is — three times — but
only ever as *"Prisma against Supabase Postgres"*. Forcing that re-read produced
the distinction the whole realtime decision turns on: **Supabase is our database,
not our backend.** Which is why Supabase Realtime would bypass the authorization
layer, and why the Data API had to be switched off at project creation.

---

## How I verified its output

"I read it carefully" distinguishes nobody. These are the checks that were
actually run, and two of them changed the answer.

Against the real database, not in principle.

- The `CHECK` constraint: four contradictory item states inserted and rejected
  with SQLSTATE `23514`, two valid ones accepted — inside a transaction that was
  rolled back, then confirmed the table was left empty.
- Platform isolation: `SET LOCAL ROLE anon`, then attempt a read. Result
  `permission denied (42501)` for both `anon` and `authenticated`.
- This check changed a conclusion. I first looked at
  `information_schema.role_table_grants`, saw 36 grants to those roles, and
  concluded there was a leak. There was not — the grants were `REFERENCES`,
  `TRIGGER`, `TRUNCATE`, none of which read data. **Counting grants is not
  evidence; attempting the read is.**

Against the running API, as a reviewer would.

- R2, eight curl cases: member `200`, viewer read `200`, non-member `404`,
  unknown workspace `404` (deliberately indistinguishable), malformed id `404`
  rather than a 500, no cookie `401`, forged cookie signature `401`, half a
  cursor `400`.
- R1, `npm run verify:r1`: 8 simultaneous claims on one item, 5 rounds. Exactly
  one winner each round, and every loser's response named the winner.
- R3, `npm run verify:r3`: asserts `sent_at IS NULL` at the instant the resolve
  response arrives, one outbox row per resolve, two simultaneous drains never
  claiming the same job, and every job reaching a terminal state with its last
  error kept.
- This check also changed. The first version asserted the response took under
  900ms — it passed by 23ms, which meant it was measuring the network between my
  laptop and `eu-west-1`, not the property. Replaced with a direct assertion that
  nothing had been delivered when the response arrived.
- R4, `npm run verify:r4`: an 8-page keyset walk while another session claimed
  items — 200 rows, 0 repeats, 0 omissions — plus a demonstration of `OFFSET`
  skipping a row, and `EXPLAIN ANALYZE` for a deep page both ways. The plans are
  read for `rows=` and `Buffers:`, not just the timing: 5,050 rows and 5,073
  buffers against 50 and 51.
- R5, `npm run verify:r5`: the sweep releases stale claims, leaves no row that is
  open while still naming a holder, returns 401 without the secret, and a late
  resolve is accepted only when nobody else has taken over.

Reading the docs instead of trusting its training.

Both major dependencies shipped breaking changes the assistant would have
written around from memory. Next 16 renames `middleware.ts` to `proxy.ts`, and
Prisma 7 requires a driver adapter and has removed `directUrl` entirely. I
had it read `node_modules/next/dist/docs/` and the Prisma type definitions first.
Written from memory, the connection layer would simply not have worked — and the
Next docs turned out to contain the sentence that supports our R2 decision:
proxy "should not be used as a full session management or authorization
solution."

A full review pass at the end, against the code rather than the intent.

Reading back over finished work found things that writing it had not, and two
were mine to own:

- The project rules file had been silently destroyed. `create-next-app`
  generates its own `CLAUDE.md` — an eleven-byte `@AGENTS.md` pointer — and the
  scaffold copy overwrote the authored one before the first commit, so the rules
  existed in no commit and could not be recovered from history. Nothing failed;
  `rsync` does not warn, and I never re-read the file. It compounded: a later
  scripted edit to that file used a plain string replace with no assertion, so it
  matched nothing and did nothing, and reported success. Both fixes are now
  rules: never copy a scaffold over the project root without excluding it, and
  assert the anchor matched before writing.
- A check that could not fail. An early quality gate was written as
  `tsc --noEmit | tail && echo clean`, which reports the exit status of `tail`
  and so always printed "clean". A second one, in a verification script I wrote
  during the review itself, was `check(status !== 'claimed' || true, …)`. A green
  check that cannot go red is worse than no check, and I found the second one by
  applying the lesson from the first.

The same pass found real defects in the code: any member could resolve any
unclaimed item by curl because the condition was wider than the documented
intent; the row count was recomputed for every page but read only from the first;
the notification health summary — polled by every client — had no index; four
imports crossed between features against the project's own rule; and the R1
verification script would have crashed instead of reporting the one failure it
exists to detect. All are fixed, and R2 gained the runnable proof it had been
missing while every other requirement had one.

Standard gates on every change. `npx tsc --noEmit`, `npm run lint`,
`npm test` — clean before each commit. One of my own instructions had a bug worth
noting: an early gate was written as `tsc --noEmit | tail && echo clean`, which
reports the exit status of `tail` and therefore always printed "clean". Caught
and fixed; a green check that cannot go red is worse than no check.
