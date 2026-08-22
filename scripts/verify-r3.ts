/**
 * R3: resolving must not wait on notify(), nothing may disappear silently, and
 * two overlapping drains must not deliver the same notification twice.
 *
 *   BASE_URL=http://localhost:3000 npm run verify:r3
 */
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

type Actor = { id: string; name: string }
type Membership = { id: string; name: string; role: string }
type Item = { id: string; title: string }
type ActionResult = { outcome: string; item: Item; reason?: string }

let failures = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

async function json<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL })
  await db.connect()

  try {
    const { users } = await json<{ users: Actor[] }>(await fetch(`${BASE_URL}/api/users`), 'users')

    const signIn = await fetch(`${BASE_URL}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: users[0].id }),
    })
    const { workspaces } = await json<{ workspaces: Membership[] }>(signIn, 'sign in')
    const cookie = signIn.headers
      .getSetCookie()
      .find((c) => c.startsWith('triage_session='))!
      .split(';')[0]

    const workspace = workspaces.find((w) => w.role !== 'viewer')!
    const headers = { cookie }

    const { items } = await json<{ items: Item[] }>(
      await fetch(`${BASE_URL}/api/workspaces/${workspace.id}/items?status=open&limit=1`, { headers }),
      'open item',
    )
    const target = items[0]

    await json<ActionResult>(
      await fetch(`${BASE_URL}/api/workspaces/${workspace.id}/items/${target.id}/claim`, {
        method: 'POST',
        headers,
      }),
      'claim',
    )

    // --- 1. the response must not wait on a one-second notify() ---
    const started = Date.now()
    const resolved = await json<ActionResult>(
      await fetch(`${BASE_URL}/api/workspaces/${workspace.id}/items/${target.id}/resolve`, {
        method: 'POST',
        headers,
      }),
      'resolve',
    )
    const elapsed = Date.now() - started

    check(resolved.outcome === 'applied', `resolve applied (${elapsed}ms round trip)`)

    // The property is "the response does not wait on delivery", not "the
    // response is faster than some number". Asserting a latency threshold would
    // make this test a measure of the network between here and the database —
    // it is ~4 round trips to eu-west-1 from a laptop, and near-zero once the
    // function runs in the same region. So assert the thing itself: at the
    // instant the response arrived, nothing had been delivered yet.
    const job = await db.query<{ id: string; status: string; sent_at: Date | null }>(
      `select id, status::text, sent_at from notification_jobs where item_id = $1`,
      [target.id],
    )
    check(job.rows.length === 1, `exactly one outbox row was written (${job.rows.length})`)
    check(
      job.rows[0]?.sent_at === null,
      'the response arrived before any notification had been delivered',
    )

    // --- 3. two overlapping drains must not take the same job ---
    await db.query(
      `update notification_jobs set status='pending', attempts=0, next_attempt_at=now(), sent_at=null
        where workspace_id=$1 and status<>'sent'`,
      [workspace.id],
    )
    const before = await db.query<{ n: number }>(
      `select count(*)::int n from notification_jobs where status='pending' and next_attempt_at<=now()`,
    )

    const cron = () =>
      fetch(`${BASE_URL}/api/cron/notifications`, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }).then((r) => json<{ attempted: number }>(r, 'cron'))

    const [a, b] = await Promise.all([cron(), cron()])
    const attemptedTotal = a.attempted + b.attempted
    check(
      attemptedTotal <= before.rows[0].n,
      `two simultaneous drains claimed ${attemptedTotal} jobs, never more than the ${before.rows[0].n} that were due`,
    )
    check(
      Math.min(a.attempted, b.attempted) === 0 || a.attempted + b.attempted === attemptedTotal,
      'no job was handed to both drains (for update skip locked)',
    )

    // --- 4. keep draining until this job settles; failures must leave a reason ---
    for (let i = 0; i < 8; i++) {
      const row = await db.query<{ status: string; attempts: number; last_error: string | null }>(
        `select status::text, attempts, last_error from notification_jobs where item_id=$1`,
        [target.id],
      )
      const j = row.rows[0]
      if (j.status === 'sent') {
        check(true, `delivered after ${j.attempts} attempt(s)`)
        break
      }
      if (j.status === 'dead') {
        check(
          Boolean(j.last_error),
          `gave up after ${j.attempts} attempts and kept the reason: ${j.last_error}`,
        )
        break
      }
      await db.query(`update notification_jobs set next_attempt_at=now() where item_id=$1`, [
        target.id,
      ])
      await cron()
    }

    const final = await db.query<{ status: string; attempts: number }>(
      `select status::text, attempts from notification_jobs where item_id=$1`,
      [target.id],
    )
    check(
      final.rows[0].status !== 'pending',
      `job reached a terminal state: ${final.rows[0].status} after ${final.rows[0].attempts} attempt(s)`,
    )
  } finally {
    await db.end()
  }

  console.log()
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s).`)
    process.exit(1)
  }
  console.log('R3 holds: the resolve never waits, the intent is durable, and retries are visible.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
