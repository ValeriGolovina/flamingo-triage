# Triage — project rules

Flamingo home assignment. Read this before writing code. It states the rules;
`DECISIONS.md` states why, and is the place to argue with them.

---

## 1. What this is

A shared work queue. A member claims an item so nobody duplicates the work,
then resolves it or releases it back. The interesting part is what happens when
several people do this at once.

Graded on: five requirements (R1–R3 required, R4–R5 optional), incremental
commit history with the required three landing first, three markdown
deliverables, and whether the UI tells the truth about state.

Two rules from the brief that outrank convenience:

- Overclaiming costs more than a missing guarantee. Never document a guarantee
  the code does not provide.
- Noticing beats building. Flagging a race you had no time to fix is worth more
  than quietly shipping one.

## 2. Stack

Fixed by the brief: Next.js 16 App Router, TypeScript strict, Tailwind 4,
Prisma 7 against Supabase Postgres, React Query + Zustand, Vercel, Node 20.

Two version facts that break code written from memory: Next 16 renamed
`middleware.ts` to `proxy.ts` and route `params` is a Promise; Prisma 7 requires
a driver adapter, moved the datasource URL into `prisma.config.ts`, and removed
`directUrl` (migrations take the direct URL from the config, the runtime takes
the pooled URL from the adapter).

Do not use: real OAuth, Supabase Auth, Supabase Realtime as a data channel,
RLS as the authorization model, long-lived connections, component libraries,
anything that costs money.

## 3. Architecture

Three roots, each answering one question — who runs this?

```
src/
  app/       Next routing, page composition, and api/**/route.ts — the HTTP bridge
  server/    server only          lib/ + <feature>/{model,repository,service}
  client/    browser only         features/<feature>/{model,api,hooks,store,ui}
                                  shared/{api,ui,session,workspace,query}
  shared/    both sides           model/ — wire contracts, shapes not behaviour
```

Flow is always `ui → hook → api → route.ts → service → repository → Prisma`.

Rules:

- `ui/` must not import `api/`. Only hooks.
- `service/` must not import Prisma. Only `repository/`, plus `server/lib/db.ts`
  for a transaction boundary.
- `route.ts` is thin: resolve context, parse input, call service, map to a status.
- A feature never imports another feature. Lift shared code into
  `client/shared/`. The one exception is composition in `app/`.
- Every module under `server/` starts with `import 'server-only'`.
- There is no `core/` folder. Singletons live on their own side.

These are checked, not hoped for:

```
npm run check:arch
```

It fails on feature-to-feature imports, the client reaching into the server,
the server reaching into the client, `shared` depending on either side, an
empty layer folder, or a documented source link that has drifted.

### State

React Query owns anything that came from the server. Zustand owns what the
browser owns — the active status tab, a transient notice, the selected
workspace. Never mirror server data into Zustand.

### Synchronisation

All polling lives in `client/features/queue/hooks/useQueueSync.ts`. Nothing else
may poll, subscribe, or set an interval. The interval scales with loaded page
count because an infinite query refetches every page per tick.

After a mutation the client patches the changed row into the cache from the
response rather than invalidating. The patch is filter-aware: a row that no
longer matches the active filter is removed, because leaving a Claimed item
under the "Open" tab would be the interface stating something untrue.

Correctness does not depend on this channel. A losing claim learns the truth
from the response to its own request.

## 4. Invariants the five requirements depend on

Do not break these without reading the matching section of `DECISIONS.md`.

**R1 — claim once.** The winner is decided by one conditional statement
(`UPDATE … WHERE status='open' RETURNING`), never read-then-write. Zero rows is
an answer, not a failure. Losing returns 200 with the fresh row, not 409. Claim
is never optimistically updated — it is contended, so rendering it as fact
before the server answers is a lie somebody can walk away with.

**R2 — sealed workspaces.** `requireWorkspaceContext(workspaceId, minRole)`
returns a branded `WorkspaceContext`, and no repository function accepts a bare
id. `workspaceId` always comes from the URL. A foreign workspace returns 404,
never 403. Cron jobs need the parallel `SystemContext`, which only the cron
secret can produce. Raw SQL lives only in `repository/` and always carries a
scope.

**R3 — resolving notifies.** The resolve and the outbox row are written in one
transaction; delivery happens elsewhere. The guarantee is at-least-once with a
visible record — say those words, do not imply exactly-once. Attempts are
written before the attempt. Overlapping drains use `for update skip locked`.

**R4 — pagination.** Keyset, never `OFFSET`. The sort key is immutable
(`created_at DESC, id DESC`); status is a filter. `id` is a mandatory
tiebreaker. The count runs for the first page only.

**R5 — stale claims.** A sweep must clear the holder columns, not only flip
status. `last_claimed_by_id` survives the sweep so a late resolve is accepted
only from whoever did the work. A sweep that hits its batch limit reports what
is still outstanding.

## 5. Database

Schema is designed for all five requirements up front — migrating a seeded 10k
table mid-flight is the cost being avoided.

- `claimed_by_id` lives on `items`, so R1 is atomic on one row. Cost: no history.
- A `CHECK` constraint makes contradictory states unwritable. Prisma cannot
  express `CHECK` or partial indexes — hand-write them in the migration, never
  edit an applied one, add a new migration instead.
- Indexes exist per real query, not just in case.
- Tables and columns are snake_case: R1, R4 and R5 are hand-written SQL, and
  unquoted identifiers beat quoted `"camelCase"`.

## 6. Conventions

- DRY — one implementation per rule. Authorization is
  `requireWorkspaceContext`. Polling cadence is `useQueueSync`. The stale window
  is `STALE_AFTER_MINUTES`. A second copy of a rule is a second thing that can
  be wrong.
- SOLID — one responsibility per layer, enforced by what each may import. The
  layering is not decoration; it is what makes R2 impossible to bypass.
- KISS — verbose-but-clear over clever-but-opaque. Hand-written SQL a reviewer
  can paste into `EXPLAIN ANALYZE` beats a builder expression with an
  unpredictable plan.
- YAGNI — ship the simple thing, measure where it breaks, name that in
  `DECISIONS.md`. Polling is the worked example.

Plus: TypeScript strict, no `any`. No dead code or `console.log` — deliberate
`console.error`/`warn`/`info` on the server is wanted. Enums for values crossing
a boundary. Validate only at boundaries; the database is not internal code.
Errors read from the body, never inferred from the status. Memoise only when
measured — the queue polls with 300 rows on screen, which is the measurement.
Comments explain why, never what.

## 7. Where things go

The layer matches the artifact's kind, inside the feature that owns it: types →
`model/`, backend calls → `api/`, React logic → `hooks/`, pure functions →
`helpers/`, rendering → `ui/`. A segment folder exists only when the feature
needs it. Used by two client features → `client/shared/`. Needed by both sides →
`shared/model/`, and it must be a shape.

## 8. Quality bar

The brief does not want exhaustive coverage — test where it bought something.

- Requirement behaviour is proved by `npm run verify:r1` … `verify:r5`, which
  drive the real API because these guarantees must hold through the whole stack.
- `npm test` needs no infrastructure and covers two things: the pure logic
  where a wrong answer is invisible until it reaches a person (`roleAtLeast`,
  `applyItemToCache`, `readErrorCode`), and the row behaviour the brief grades —
  who holds an item, what a viewer may do, that a contended action shows a
  pending state asserting nothing, and that no state leaves a control which
  silently does nothing. Component tests use a `@vitest-environment jsdom`
  docblock so only the files that need a DOM pay for one.
- Before calling anything done: `npx tsc --noEmit`, `npm run lint`,
  `npm run check:arch`, `npm test`, and `npm run build` before a deploy.

A check that cannot fail is worse than no check. Break each new one deliberately
and watch it go red — three in this repo silently passed until someone did.

## 9. Interface

Graded on whether it tells the truth about state, not on polish. Density beats
polish, Tailwind defaults are fine.

- Every row answers "who holds this right now" without a click.
- A contended action shows a pending state, and every in-flight action does —
  not just the most recent.
- Losing a race produces a clear result naming the winner, never a button that
  silently does nothing.
- Loading, empty and error are real states with real markup.
- A viewer sees disabled actions with a reason, not hidden ones.
- A plain interface that never lies beats a beautiful one that does.

Out of scope: mobile, dark mode, i18n, accessibility, animation.

All user-facing copy is English — the reviewers read the deployed UI. So are
code, comments, commits and the three deliverables.

## 10. Commands

```
npm run dev · build · lint · test · check:arch
npx tsc --noEmit
npx prisma migrate dev
npm run seed              # refuses a non-empty database without --reset
npm run verify:r1 … r5    # need the dev server and a seeded database
```

## 11. Do not touch casually

- An applied migration. Add a new one; hand-written SQL must survive.
- The seed — destructive only behind `--reset`.
- Secrets. Never committed, logged, or printed.
- `requireWorkspaceContext` and repository signatures. An overload taking a bare
  id defeats R2. If a call site "needs" one, the call site is wrong.
- The R1 conditional UPDATE. The guarantee is the single statement.
- `CRON_SECRET` checks.
- This file. `create-next-app` generates its own `CLAUDE.md` pointing at
  `AGENTS.md`, and it once overwrote this one during a scaffold copy — silently,
  because `rsync` does not warn. Never copy a scaffold over the project root
  without excluding it, and when editing any file by script, assert the anchor
  matched before writing.

## 12. Working agreement

Never auto-commit or push. Commits are incremental and imperative, required
requirements before optional ones. `DECISIONS.md` is written in the same commit
as the decision, not reconstructed at the end. Where the spec is
underdetermined, close the gap, record the assumption, move on.
