/**
 * R5: a claim older than 30 minutes returns to the queue, and a resolve that
 * arrives after that is handled deliberately rather than by accident.
 *
 *   BASE_URL=http://localhost:3000 npm run verify:r5
 */
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

type Actor = { id: string; name: string }
type Membership = { id: string; name: string; role: string }
type Item = { id: string }
type ActionResult = { outcome: string; reason?: string; resolvedWithoutClaim?: boolean }

let failures = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

async function json<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

async function signIn(userId: string) {
  const response = await fetch(`${BASE_URL}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  const { workspaces } = await json<{ workspaces: Membership[] }>(response, 'sign in')
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith('triage_session='))!
    .split(';')[0]
  return { cookie, workspaces }
}

const sweep = (secret = CRON_SECRET) =>
  fetch(`${BASE_URL}/api/cron/stale-claims`, {
    headers: { authorization: `Bearer ${secret}` },
  })

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL })
  await db.connect()

  try {
    const { users } = await json<{ users: Actor[] }>(await fetch(`${BASE_URL}/api/users`), 'users')

    // Two identities that can both act in the same workspace.
    const sessions = await Promise.all(users.map((u) => signIn(u.id).then((s) => ({ ...s, u }))))
    const counts = new Map<string, typeof sessions>()
    for (const s of sessions) {
      for (const w of s.workspaces) {
        if (w.role === 'viewer') continue
        counts.set(w.id, [...(counts.get(w.id) ?? []), s])
      }
    }
    const [workspaceId, members] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    const [alice, bob] = members
    check(Boolean(alice && bob), `two members share a workspace (${members.length})`)

    const claimOne = async (session: (typeof sessions)[number]) => {
      const { items } = await json<{ items: Item[] }>(
        await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items?status=open&limit=1`, {
          headers: { cookie: session.cookie },
        }),
        'open item',
      )
      const id = items[0].id
      await json<ActionResult>(
        await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items/${id}/claim`, {
          method: 'POST',
          headers: { cookie: session.cookie },
        }),
        'claim',
      )
      return id
    }

    /**
     * Backdated well past the window rather than just over it. The sweep takes
     * the oldest claims first and is batched, and a live queue accumulates
     * plenty of stale ones — a claim that is merely 31 minutes old is the
     * youngest stale row and would not be in the first batch.
     */
    const makeStale = (id: string) =>
      db.query(`update items set claimed_at = now() - interval '100 days' where id = $1`, [id])

    // --- the sweep itself ---
    // Self-contained: a previous run may already have cleared the seeded
    // backlog, and a test that only passes against a particular database state
    // is a test that reports the state rather than the behaviour.
    const doomed = await claimOne(alice)
    await makeStale(doomed)

    const stale = await db.query<{ n: number }>(
      `select count(*)::int n from items where status='claimed' and claimed_at < now() - interval '30 minutes'`,
    )
    const report = await json<{ released: number; outstanding: number }>(await sweep(), 'sweep')
    check(
      report.released > 0,
      `sweep released ${report.released} of ${stale.rows[0].n} stale claims (${report.outstanding} left)`,
    )
    const doomedNow = await db.query<{ status: string; last_claimed_by_id: string | null }>(
      `select status::text, last_claimed_by_id from items where id = $1`,
      [doomed],
    )
    check(doomedNow.rows[0].status === 'open', 'the backdated claim specifically was released')
    check(
      doomedNow.rows[0].last_claimed_by_id !== null,
      'the sweep preserved who last held it, so they can still resolve their work',
    )

    const contradictory = await db.query<{ n: number }>(
      `select count(*)::int n from items where status='open' and (claimed_by_id is not null or claimed_at is not null)`,
    )
    check(
      contradictory.rows[0].n === 0,
      'no swept row was left open while still naming a holder',
    )

    const unauthorized = await sweep('wrong-secret')
    check(unauthorized.status === 401, `sweep without the cron secret is ${unauthorized.status}`)

    // --- a resolve that arrives after the claim expired, item still free ---
    const abandoned = await claimOne(alice)
    await makeStale(abandoned)
    await sweep()
    const late = await json<ActionResult>(
      await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items/${abandoned}/resolve`, {
        method: 'POST',
        headers: { cookie: alice.cookie },
      }),
      'late resolve',
    )
    check(
      late.outcome === 'applied' && late.resolvedWithoutClaim === true,
      'late resolve is accepted when the item is still free, and flagged as unclaimed',
    )

    // --- a member must not resolve an item they never held ---
    // Before the review this branch read `or status = 'open'`, which let anyone
    // resolve any unclaimed item by curl. It is now scoped to last_claimed_by_id.
    // Chosen by last claimer, not by "first open item in the list". The sweep
    // deliberately preserves last_claimed_by_id, so plenty of open items are
    // ones this user may legitimately resolve — picking blindly makes the test
    // depend on which of them happens to sort first.
    const virgin = await db.query<{ id: string }>(
      `select id from items
        where workspace_id = $1 and status = 'open' and last_claimed_by_id is null
        limit 1`,
      [workspaceId],
    )
    const neverHeld = await json<ActionResult>(
      await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items/${virgin.rows[0].id}/resolve`, {
        method: 'POST',
        headers: { cookie: bob.cookie },
      }),
      'resolve without ever claiming',
    )
    check(
      neverHeld.outcome === 'rejected',
      'a member cannot resolve an open item they never claimed',
    )

    // --- the same, but somebody else claimed it in the meantime ---
    const stolen = await claimOne(alice)
    await makeStale(stolen)
    await sweep()
    await json<ActionResult>(
      await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items/${stolen}/claim`, {
        method: 'POST',
        headers: { cookie: bob.cookie },
      }),
      'reclaim',
    )
    const contested = await json<ActionResult>(
      await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items/${stolen}/resolve`, {
        method: 'POST',
        headers: { cookie: alice.cookie },
      }),
      'contested late resolve',
    )
    check(
      contested.outcome === 'rejected' && contested.reason === 'not_held_by_you',
      'late resolve is refused once somebody else holds the item',
    )
  } finally {
    await db.end()
  }

  console.log()
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s).`)
    process.exit(1)
  }
  console.log('R5 holds: abandoned claims come back, and a late resolve never erases somebody else.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
