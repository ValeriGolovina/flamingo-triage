# Triage

A shared work queue. A member claims an item so nobody duplicates the work, then
resolves it or releases it back. The interesting part is what happens when
several people do this at once.

Live: **https://flamingo-triage-ten.vercel.app**

---

## Run it

Assumes Node 20. Nothing here costs money — free tiers throughout.

### 1. Create the Supabase project

Two settings on the creation screen matter, and neither is the default — both
have to be chosen now, not afterwards:

- Uncheck "Automatically expose new tables." Supabase runs a PostgREST API
  over the `public` schema, reachable from any browser with the publishable
  anon key. We never use it — Prisma connects from the server — but if the
  tables are exposed, that API serves them straight past the authorization
  layer this project is built around.
- Check "Enable automatic RLS." Prisma connects as the owner of the tables it
  creates, and owners bypass RLS, so this changes nothing for the app. It is a
  second barrier on the one channel we do not use. It is not the
  authorization model — see `DECISIONS.md`.

### 2. Install and configure

```bash
nvm use 20          # .nvmrc pins it; anything below 20.19 fails in the test runner
npm install         # postinstall runs `prisma generate`
cp .env.example .env.local
```

Fill in `.env.local`. Both database URLs come from the Supabase dashboard under
Get connected → ORM → Prisma:

| Variable | Where from | Why both |
|---|---|---|
| `DATABASE_URL` | Transaction pooler, port 6543, `?pgbouncer=true` | the runtime connection |
| `DIRECT_URL` | Direct connection, port 5432 | migrations need a real session; the transaction pooler cannot serve them |
| `SESSION_SECRET` | `openssl rand -base64 32` | signs the session cookie |
| `CRON_SECRET` | `openssl rand -base64 32` | guards the two cron routes |

### 3. Migrate, seed, run

```bash
npx prisma migrate deploy   # schema, CHECK constraint, partial indexes
npm run seed                # ~10,000 items, 3 workspaces, 5 users
npm run dev
```

`npm run seed` refuses to run against a database that already holds items. Pass
`--reset` to wipe and reseed:

```bash
npm run seed -- --reset
```

---

## Sign in

There is no password and no OAuth: a dropdown picks one of the seeded users and
sets a signed cookie, which is what the brief asks for.

Sign in as Anya Kovalenko — her memberships cover every authorization
outcome in one account:

| Workspace | Her role | What she can do |
|---|---|---|
| Acme Support | member | read, claim, release, resolve |
| Globex Support | viewer | read only — actions are visible but disabled, with the reason |
| Initech Ops | not a member | 404 through every route |

---

## Verify R1

The claim race is the thing worth checking, so it ships as something you can run:

```bash
npm run verify:r1
```

It signs in as several seeded users, fires **8 simultaneous claims at one open
item**, and asserts that exactly one wins and that every loser's response names
the winner. Five rounds by default:

```
PASS  round 1  1 won / 7 lost  winner: Oleh Tkachenko  (504ms)  every loser was told who has it
...
Exactly one winner in all 5 rounds, and every loser learned who has it.
```

It drives the HTTP API, not the database, because the guarantee has to hold
through the whole stack. Point it anywhere:

```bash
BASE_URL=https://your-app.vercel.app npm run verify:r1
CLAIMERS=16 ROUNDS=10 npm run verify:r1
```

### The others

| Command | Checks |
|---|---|
| `npm run verify:r2` | cross-workspace reads and writes, the confused-deputy shape (own workspace id + foreign item id), a viewer trying to act, and cookies that are absent, forged, expired, or issued in the future |
| `npm run verify:r3` | the resolve never waits on `notify()`, exactly one outbox row per resolve, two simultaneous drains never take the same job, every job reaches a terminal state keeping its last error |
| `npm run verify:r4` | an 8-page keyset walk under concurrent claiming — no repeats, no omissions; demonstrates `OFFSET` skipping a row; prints `EXPLAIN ANALYZE` for a deep page both ways |
| `npm run verify:r5` | stale claims return to the queue, the sweep leaves no contradictory row, it is 401 without the secret, and a late resolve is accepted only when nobody else has taken over |

They need the dev server running and a seeded database. Two checks need
neither:

```bash
npm test              # pure logic + row behaviour — 24 tests
npm run check:arch    # the client/server boundaries the layout depends on
```

`check:arch` fails on a feature importing another feature, the client reaching
into the server, the server reaching into the client, `shared` depending on
either side, or an empty layer folder.

### Cron routes by hand

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/notifications
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/stale-claims
```

---

## Where each requirement lives

| | Where |
|---|---|
| R1 claim once | `src/server/queue/repository/itemRepository.ts` (the conditional UPDATE), `src/server/queue/service/claimService.ts`, `src/client/features/queue/hooks/useItemActions.ts` |
| R2 sealed workspaces | `src/server/workspace/service/workspaceContext.ts`, `src/server/workspace/model/context.ts` |
| R3 resolving notifies | `src/server/notifications/`, `src/app/api/cron/notifications/route.ts` |
| R4 pagination | `itemRepository.listPage`, `src/client/features/queue/hooks/useQueue.ts` |
| R5 stale claims | `src/server/queue/service/sweepService.ts`, `src/app/api/cron/stale-claims/route.ts` |

Layout: three roots, each answering who runs it. `src/client/*` is browser-only,
`src/server/*` is server-only, and `src/shared/*` is the one thing both touch —
wire contracts, no behaviour. The only bridge at runtime is `src/app/api/*`.
`CLAUDE.md` states the rules and the four greps that check them.

---

## Deploying

1. Import the repo into Vercel.
2. Set `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `CRON_SECRET`.
3. Set the function region to match the database. The seeded project lives in
   `eu-west-1` (Dublin), so functions belong in `dub1`. A resolve is a
   transaction — several round trips — and running it across the Atlantic turns
   ~20ms into ~800ms.
4. Run `npx prisma migrate deploy` and `npm run seed` against the production
   database.

`vercel.json` schedules both cron routes hourly. **On Vercel's Hobby plan cron
granularity is limited**, so retries are slower there than the code allows — a
plan constraint, not a design decision. Delivery does not depend on it alone:
every resolve also drains a batch of whatever else is due, so activity keeps the
outbox moving between scheduled runs.

---

## How long it took

About 10 hours.
