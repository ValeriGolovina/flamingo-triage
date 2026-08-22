# Triage — project rules

Flamingo home assignment. Read this file before writing any code.

---

## 1. Project overview

Triage — a team works through a shared queue. A member claims an item so
nobody duplicates the work, then resolves it or releases it back. That is the
whole product. The interesting part is what happens when several people do this
at once.

What is actually graded (from the brief):

- Five requirements (R1–R3 required, R4–R5 optional). Each has an obvious
  implementation that is wrong in a way that matters.
- Incremental commit history. A single squashed commit is not a valid submission,
  and the required three land before the optional two.
- `README.md`, `DECISIONS.md`, `AI_USAGE.md`.
- The UI — not as decoration, but as "whether it tells the truth about state".
- **Overclaiming costs more than a missing guarantee.** Never document a
  guarantee the code does not provide. Naming a limitation honestly scores.
- **Noticing beats building.** Flagging a race we had no time to fix is worth
  more than quietly shipping one.

Three requirements solved well beats five solved shallowly.

---

## 2. Tech stack

Fixed by the brief — do not substitute:

- Next.js 16 (App Router) + TypeScript strict + Tailwind 4
- Prisma 7 against Supabase Postgres (Supabase is our database, not our backend)
- React Query (server state) + Zustand (client state)
- Deployed on Vercel. Node 20+.

Two version facts that break code written from memory:

- Next 16 renamed `middleware.ts` to `proxy.ts`, and route `params` is a
  Promise.
- Prisma 7 requires a driver adapter (`@prisma/adapter-pg`), moved the
  datasource URL into `prisma.config.ts`, and removed `directUrl`. Migrations
  take the direct URL from the config; the runtime takes the pooled URL from the
  adapter.

### Do NOT use

| Not this | Why |
|---|---|
| Real OAuth / NextAuth | the brief wants a dropdown of seeded users + a signed cookie |
| Supabase Auth | we have our own signed-cookie session |
| Supabase Realtime as a data channel | it connects the browser straight to the database, past the authorization guard |
| Postgres RLS as the authorization model | see `DECISIONS.md` — rejected deliberately, not forgotten |
| Long-lived connections (websocket server, SSE) | serverless: no process survives the response |
| Component libraries, design systems, animation | explicitly out of scope |
| Anything that costs money | free tiers only |

---

## 3. Architecture

### 3.1 Client and server are split physically

Three roots, and each one answers the same question: **who runs this?**

- `src/client/*` — **browser only**. Never imports Prisma, `src/server/*`, or a secret.
- `src/server/*` — **server only**. Owns the database. Every module starts with
  `import 'server-only'`, so a leak is a build error rather than a bundle surprise.
- `src/shared/*` — the only thing both sides touch: wire contracts. It
  imports from neither side, and it contains no behaviour, only shapes.
- The only bridge at runtime is HTTP: `app/api/*/route.ts`.

There is no `core/` folder. "Is a singleton" is a real property — the Prisma
client and the QueryClient are both one-per-app — but it cuts across the
client/server split rather than along it, and grouping by it put the database
client outside `src/server`. Singletons now live on their own side; the folder
simply stops advertising the lesser property.

Likewise `shared/` means one thing only. It used to hold the http client, the ui
kit and the session hook, none of which the server ever imported — that is
shared between client features, which is client code, and it lives in
`src/client/shared/`.

"Which side does this run on?" is answered by the folder, never guessed.

### 3.2 The flow is always the same

```
ui → hook → api → fetch → app/api/*/route.ts → server/<feature>/service
                                              → repository → Prisma → Postgres
```

- **`ui/` must not import `api/`.** Only hooks. A component calling `fetch` is an
  architecture bug.
- **`service/` must not import Prisma.** Only `repository/`, plus
  `server/lib/db.ts` when it needs a transaction boundary.
- `route.ts` is thin: resolve context → parse input (zod) → call service →
  map result to a status. No business logic.

### 3.3 Folder structure

```
src/
  app/                          # Next routing + page composition only
    api/**/route.ts             # the thin HTTP bridge

  server/                       # runs on the server, nowhere else
    lib/                        # infrastructure with no single owner
      prisma.ts  env.ts  errors.ts  validate.ts  db.ts  system.ts
    <feature>/                  # auth · workspace · queue · notifications
      model/  repository/  service/        (+ helpers/)

  client/                       # runs in the browser, nowhere else
    features/<feature>/         # auth · workspace · queue
      model/  api/  hooks/  store/  ui/    (+ helpers/)
    shared/                     # shared BETWEEN client features
      api/  ui/  session/  workspace/  query/

  shared/                       # shared BETWEEN client and server
    model/                      # wire contracts (DTO) and cross-boundary enums
```

### 3.4 Dependency direction — down, never up, never sideways

```
app  →  client/features  →  client/shared  →  shared
app  →  server/<feature> →  server/lib     →  shared
```

- `shared` knows nothing about either side; that is what makes it shared.
- `client/shared` knows nothing about features.
- **A feature never imports another feature.** Lift shared code into `shared/`.
  This rule is not bureaucracy: `queue` and `workspace` and `auth` all want each
  other, and that is exactly where a layered architecture quietly collapses.
  Session identity and the selected workspace live in `shared/` for this reason.
- The one allowed exception is composition in `app/` — a page may combine
  `<QueueTable>` with `<WorkspaceSwitcher>`. Gluing features together lives at
  the page level, never inside a feature.

These boundaries are checked, not hoped for:

```
npm run check:arch
```

It fails on a feature importing another feature, the client reaching into the
server, the server reaching into the client, shared depending on either side, or
an empty layer folder. It exists because the first of those was violated and a
review caught it rather than the build — a rule nothing checks is a rule that
decays.

### 3.5 State: React Query and Zustand, hard boundary

| | React Query | Zustand slice |
|---|---|---|
| Holds | server state: queue, session | client state: status tab, notice, selected workspace |
| Source of truth | the server | the browser |
| Invalidation | yes | no such concept |

**Rule: if the data can be fetched from the backend, it lives in React Query.
Never mirror server data into Zustand.**

### 3.6 Queue synchronization is behind one hook

All "how does this client learn about other people's changes" logic lives in
`features/queue/hooks/useQueueSync.ts`. Nothing else may poll, subscribe, or set
an interval.

```
refetchInterval: scales with loaded page count (2s × pages)
refetchIntervalInBackground: false   // React Query's default, pinned because it is a decision
refetchOnWindowFocus: true
```

An infinite query refetches every loaded page per tick, sequentially, so a
fixed interval makes request rate grow with how far someone scrolled. Scaling the
interval keeps requests-per-second flat. `maxPages` is the obvious fix and is
wrong here — this is a "Load more" list, not a virtualised one, so evicting a
page removes rows that are still on screen.

**After a mutation the client patches the changed row into the cache from the
response; it does not invalidate the list.** The response already carries the
fresh row, so a refetch would re-fetch every loaded page to learn one fact we
have. The patch is filter-aware: if a status filter is active and the row no
longer matches, the row is removed — leaving a Claimed item under the "Open"
tab would be the interface stating something untrue.

Correctness does not depend on this channel. A losing claim learns the truth
from the response to its own request. The channel only controls how often someone
clicks a row that is already stale.

Not built: a Supabase Broadcast signal (empty payload, data still refetched
through our API so the guard re-runs). Never `postgres_changes` — it always ships
the row, straight to the browser, past the guard.

---

## 4. The five requirements and the decisions taken

### R1 — Claim once (required)

- One conditional statement, never read-then-write:
  `UPDATE … WHERE id=$1 AND workspace_id=$2 AND status='open' RETURNING …`.
  Zero rows is an answer, not a failure.
- The losing path does one scoped read to say why — zero rows is ambiguous
  between "somebody was first", "already resolved" and "not here".
- Losing is a domain result, not an exception, and returns 200: the body
  carries the outcome and the fresh row naming the holder.
- **Claim is NOT optimistically updated.** It is contended, so rendering it as
  fact before the server answers is a lie somebody can walk away with. Pending
  state that asserts nothing; the response settles it.
- `npm run verify:r1` fires N simultaneous claims and asserts exactly one wins.

### R2 — Sealed workspaces (required)

- The check lives in `requireWorkspaceContext(workspaceId, minRole)` and returns
  a branded `WorkspaceContext`.
- **No repository function accepts a bare id.** The only signature is
  `(ctx, itemId)`, always filtered by `ctx.workspaceId`. Forgetting the check is
  a compile error. This prevents the mistake, not the malice — there is exactly
  one `as WorkspaceContext` cast in the codebase, inside the guard, and a second
  one must be visible in a diff.
- Why there: it is the only layer that knows both the caller and the database.
  `proxy.ts` cannot know which workspace an item belongs to without a query, and
  Next's own docs say proxy "should not be used as a full session management or
  authorization solution".
- The attack it exists for is the **confused deputy**: a legitimate `workspaceId`
  paired with a foreign `itemId`.
- `workspaceId` always comes from the URL, never an "active workspace" cookie.
- **A foreign workspace returns 404, never 403.** 403 confirms existence, and is
  reserved for a viewer inside their own workspace.
- Cron routes need to work across all workspaces, which is the same shape R2
  forbids — so they demand a branded `SystemContext` that only the
  cron-secret check can produce. No unscoped query without proof of who is asking.
- Raw SQL is the hole types cannot close: **raw SQL lives only in `repository/`,
  and every statement carries `workspace_id`** (or a `SystemContext`).

### R3 — Resolving notifies (required)

- **Transactional outbox**: the resolve and the `notification_jobs` row are
  written in one transaction. The response goes out without waiting.
- The guarantee is **at-least-once with a visible record**. Say those words; do
  not imply exactly-once.
- Fire-and-forget satisfies "must not wait" and fails "nothing disappears
  silently" — that is the trap.
- Attempts and the next backoff are written before the attempt, so a process
  that dies mid-delivery leaves a job that retries.
- Two overlapping drains are R1's race elsewhere: `for update skip locked`.
- `after()` on the resolve route is a fast path, not the guarantee; the cron
  route is.

### R4 — The queue moves while you read it (optional)

- **Keyset pagination**, never `OFFSET`. `OFFSET` counts positions and positions
  shift.
- **Sort by an immutable key: `created_at DESC, id DESC`.** Never by status —
  claiming would move the row between pages. Status is a filter.
- `id` is a mandatory tiebreaker: `created_at` is not unique after a bulk seed.
- Failure mode to state: no jump to an arbitrary page, no page count, and the
  set can change under a filter even though rows never skip or repeat.
- The count runs for the first page only — the client reads it from there.

### R5 — Claims go stale (optional)

- Claims older than `STALE_AFTER_MINUTES` return to the queue via a cron route.
- A sweep must clear `claimed_by_id` and `claimed_at`, not only flip status — the
  CHECK constraint enforces it.
- `last_claimed_by_id` survives the sweep, so a resolve arriving after the
  claim expired is accepted only from the person who did the work. Widening
  the condition to any `open` item would let any member resolve anything by curl.
- Release clears it: releasing says "not mine", and gives up that right.
- A sweep that hits its batch limit must report what is still outstanding —
  falling behind has to be visible, not inferred.

---

## 5. Database rules

- The schema is designed for all five requirements up front. Migrating a
  seeded 10k-row database mid-flight is the cost being avoided.
- `claimed_by_id` lives on `items`, not in a separate `claims` table — R1's
  atomicity is then trivially correct on one row. Cost: no claim history.
- A `CHECK` constraint makes contradictory states unwritable. Prisma cannot
  express `CHECK` or partial indexes — hand-write them in the migration and never
  regenerate that file; add a new migration instead.
- Indexes exist per real query, not "just in case":
  `(workspace_id, created_at DESC, id DESC)`,
  `(workspace_id, status, created_at DESC, id DESC)`,
  partial `(claimed_at) WHERE status='claimed'`,
  partial `(next_attempt_at) WHERE status='pending'`,
  `(workspace_id, status)` on `notification_jobs` for the polled health summary.
- Tables and columns are snake_case (`@map`/`@@map`): R1, R4 and R5 are
  hand-written SQL, and unquoted identifiers beat quoted `"camelCase"`.
- Seed ~10,000 items, 2–3 workspaces, ~5 users, uneven status spread.

---

## 6. Coding conventions

### Principles

Stated in terms of this codebase, not as slogans:

- DRY — one implementation per rule. Authorization is
  `requireWorkspaceContext` and nothing else. Polling cadence is `useQueueSync`
  and nothing else. The stale window is `STALE_AFTER_MINUTES`, so the sweep and
  the copy explaining it cannot drift. The selected workspace has one store, so
  a query key and a cache-patch key cannot be computed from two sources. A second
  copy of a rule is a second thing that can be wrong.
- SOLID — one responsibility per layer, enforced by what each layer may
  import. `repository/` owns SQL; `service/` owns invariants and transaction
  boundaries and may not touch Prisma; `ui/` renders and may not fetch. The
  layering is not decoration — it is what makes R2 impossible to bypass.
- KISS — verbose-but-clear beats clever-but-opaque. A hand-written SQL
  statement a reviewer can paste into `EXPLAIN ANALYZE` beats a query-builder
  expression with an unpredictable plan.
- YAGNI — do not build for scale this does not have. Ship the simple thing,
  measure where it breaks, and name that in `DECISIONS.md`. Polling is the worked
  example: chosen deliberately, with the breaking point stated, rather than
  pre-solved with a websocket layer nothing asked for. The brief agrees — it asks
  "what makes it wrong later", which presupposes shipping something that will.

Where two principles pull against each other, say which won and why in the commit
message.

### Rules

- TypeScript strict. **No `any`.** Inferred types where readable.
- No dead code, unused imports, or `console.log`. Deliberate `console.error` /
  `warn` / `info` on the server is wanted — an outage whose only symptom is a
  toast on somebody's phone is not observable.
- Enums for value sets that cross a boundary (wire or DB): `Role`,
  `ItemStatus`, `JobStatus`, `ActionOutcome`, `RejectionReason`, `ErrorCode`.
  Local UI state stays a plain union.
  Shared enums are declared independently of the generated Prisma client so no
  client bundle pulls it in; `server/lib/enumsInSync.ts` fails the build on drift.
- Validate only at boundaries — API bodies and query strings via zod, env at
  startup. Trust internal code. The database is not internal code.
- Errors travel as `{ error: ErrorCode }` and are read from the body, never
  inferred from the status.
- React: function components + hooks. Composition over prop drilling. Memoize
  only when measured.
- Comments explain why, never what.

---

## 7. File placement rules

- A new artifact goes into the layer matching its kind, inside the feature
  that owns it. Types → `model/`. Backend calls → `api/`. React logic →
  `hooks/`. Pure functions → the layer's `helpers/`. Rendering → `ui/`.
- A segment folder exists only when the feature needs it. Do not scaffold empty
  layers.
- Prefer editing an existing file over creating one. One responsibility per file,
  but do not split a 30-line module into three.
- Used by two client features → `client/shared/`. Never feature-to-feature.
- Needed by both the client and the server → `shared/model/`, and it must be a
  shape, not behaviour.
- Exactly one instance per app → wherever its side lives, not a `core/`
  folder: `server/lib/` or `client/shared/`.

---

## 8. Testing and quality bar

The brief does not want exhaustive coverage: *"test where it bought you something
and say so in a sentence."*

- Requirement-level behaviour is proved by runnable scripts against the real
  API, because these guarantees have to hold through the whole stack:
  `verify:r1` (N simultaneous claims, exactly one winner),
  `verify:r2` (cross-workspace access, confused deputy, viewer, cookie forgery
  and expiry), `verify:r3` (the resolve never waits, one outbox row, no double
  drain), `verify:r4` (keyset walk under churn + `EXPLAIN ANALYZE` both ways),
  `verify:r5` (sweep and the late resolve, both branches).
- `npm test` covers what needs no infrastructure — the pure logic where a
  wrong answer is invisible until it reaches a person: `roleAtLeast`,
  `applyItemToCache`, `readErrorCode`.
- No UI snapshot tests. No e2e unless everything else is done.
- Before calling anything done: `npx tsc --noEmit`, `npm run lint`,
  `npm run check:arch`, `npm test` — and `npm run build` before a deploy.

---

## 9. UI rules

Graded on **whether it tells the truth about state**, not on polish. Density
beats polish; Tailwind defaults are fine.

- Every row answers "who holds this right now" without a click.
- A contended action shows a pending state, never a premature success — and
  every in-flight action does, not just the most recent one.
- Losing a race produces a clear result: the row reconciles and a message
  names the winner. Never a button that silently does nothing.
- `resolve` feels immediate while the notification is still in flight.
- Loading, empty and error are real states with real markup.
- A viewer sees disabled actions with a reason, not hidden ones that fail on click.
- **A plain interface that never lies beats a beautiful one that does.**

Out of scope by the brief: mobile, dark mode, i18n, accessibility, animation.

---

## 10. Content and copy

- **All user-facing copy is in English** — the reviewers read the deployed UI.
  (This differs from other projects in this workspace.)
- Plain language, short. "Dmytro claimed this a second before you", not
  "Conflict: resource already locked (409)".
- Error copy says what happened and what to do, never a code.
- Code, comments, commits, PRs and all three markdown deliverables: English.

---

## 11. Commands

```
npm run dev                  # local dev
npm run build                # production build
npm run lint
npx tsc --noEmit
npm test                     # vitest, no infrastructure needed
npm run check:arch           # the boundaries in section 3, as a command
npx prisma migrate dev       # apply migrations locally
npm run seed                 # ~10k items; refuses a non-empty DB without --reset
npm run verify:r1            # …and verify:r2 / r3 / r4 / r5
```

---

## 12. Safe-change rules

Do not touch these casually:

- Applied migrations. Never edit one — add a new migration. The hand-written
  SQL (CHECK, partial indexes, backfills) must survive any regeneration.
- The seed. Idempotent or explicitly destructive with a flag, never
  accidentally destructive.
- `.env.local` / Vercel env. Secrets are never committed, logged, or printed.
- `requireWorkspaceContext` and repository signatures. An overload taking a
  bare id defeats R2 entirely. If a call site "needs" one, the call site is wrong.
- The R1 conditional UPDATE. Do not refactor it into read-then-write for
  readability. The guarantee is the single statement.
- `CRON_SECRET` checks on the sweep and outbox routes.
- This file. `create-next-app` generates its own `CLAUDE.md` (an
  `@AGENTS.md` pointer) — it once overwrote this one during a scaffold copy, and
  because the copy was silent the loss went unnoticed until a review. Never copy
  a scaffold over the project root without excluding `CLAUDE.md`, and when
  editing it by script, assert the anchor text matched before writing.

---

## 13. Working agreement

- **Never auto-commit or push.** Make the change, report, wait for approval.
- Commits are incremental and imperative, one meaningful step each — the history
  is read as part of the submission, and the required requirements land before the
  optional ones.
- **`DECISIONS.md` is written alongside the code, in the same commit as the
  decision** — not reconstructed at the end. Each entry: context that forced a
  choice / what was chosen / the strongest alternative rejected and what ruled it
  out / what it costs / what makes it wrong later.
- Say what is being simplified or hardcoded, even when minor.
- Where the spec is underdetermined: close the gap, record the assumption in
  `DECISIONS.md`, move on.
