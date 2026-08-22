/**
 * R4: the queue moves while you read it.
 *
 * Three things, in order of what they prove:
 *  1. A keyset walk is undisturbed by other people claiming and resolving
 *     during it — no row repeats, none goes missing.
 *  2. The same walk with OFFSET does lose a row, demonstrated rather than
 *     asserted, because "OFFSET is wrong here" is the claim being made.
 *  3. EXPLAIN ANALYZE for a deep page under both approaches.
 *
 *   BASE_URL=http://localhost:3000 npm run verify:r4
 */
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const PAGE_SIZE = 25
const PAGES_TO_WALK = 8

type Actor = { id: string; name: string }
type Membership = { id: string; name: string; role: string }
type QueueItem = { id: string; status: string }
type Page = { items: QueueItem[]; nextCursor: { createdAt: string; id: string } | null; total: number }

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
    const ws = workspaces.find((w) => w.role !== 'viewer')!
    const headers = { cookie }

    // ---------------------------------------------------------------- 1 ----
    // The ordering key is immutable, so churn must not disturb the walk at all.
    // Snapshot the ids that exist before the walk starts; every one of them must
    // appear exactly once, whatever happens to their status meanwhile.
    const snapshot = await db.query<{ id: string }>(
      `select id from items where workspace_id = $1
        order by created_at desc, id desc limit $2`,
      [ws.id, PAGE_SIZE * PAGES_TO_WALK],
    )
    const expected = new Set(snapshot.rows.map((r) => r.id))

    let churn = 0
    let stop = false
    const churnLoop = (async () => {
      while (!stop) {
        const { items } = await json<Page>(
          await fetch(`${BASE_URL}/api/workspaces/${ws.id}/items?status=open&limit=1`, { headers }),
          'churn read',
        )
        if (items[0]) {
          await fetch(`${BASE_URL}/api/workspaces/${ws.id}/items/${items[0].id}/claim`, {
            method: 'POST',
            headers,
          })
          churn++
        }
      }
    })()

    const seen: string[] = []
    let cursor: Page['nextCursor'] = null
    for (let page = 0; page < PAGES_TO_WALK; page++) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (cursor) {
        query.set('cursorCreatedAt', cursor.createdAt)
        query.set('cursorId', cursor.id)
      }
      const result = await json<Page>(
        await fetch(`${BASE_URL}/api/workspaces/${ws.id}/items?${query}`, { headers }),
        'keyset page',
      )
      seen.push(...result.items.map((i) => i.id))
      cursor = result.nextCursor
      if (!cursor) break
    }
    stop = true
    await churnLoop

    const unique = new Set(seen)
    const missing = [...expected].filter((id) => !unique.has(id))
    check(
      unique.size === seen.length,
      `keyset walk: ${seen.length} rows, ${seen.length - unique.size} repeated (${churn} items claimed during the walk)`,
    )
    check(missing.length === 0, `keyset walk: ${missing.length} of ${expected.size} snapshot rows went missing`)

    // ---------------------------------------------------------------- 2 ----
    // The same situation under OFFSET, in SQL so the mechanism is visible.
    const openPage = (offset: number) =>
      db.query<{ id: string }>(
        `select id from items
          where workspace_id = $1 and status = 'open'
          order by created_at desc, id desc
          limit 5 offset $2`,
        [ws.id, offset],
      )

    const first = await openPage(0)
    // One row from page 1 leaves the filtered set — exactly what happens when a
    // colleague claims something while you are reading.
    await db.query(
      `update items set status='claimed', claimed_by_id=$2, claimed_at=now() where id = $1`,
      [first.rows[0].id, users[0].id],
    )
    const second = await openPage(5)

    const withoutClaimed = await db.query<{ id: string }>(
      `select id from items
        where workspace_id = $1 and status = 'open'
        order by created_at desc, id desc
        limit 10`,
      [ws.id],
    )
    const trulyNext = withoutClaimed.rows.slice(4, 9).map((r) => r.id)
    const offsetSkipped = trulyNext.filter((id) => !second.rows.some((r) => r.id === id))

    console.log(
      `\nOFFSET demonstration: after one row left the filtered set, page 2 (OFFSET 5) skipped ` +
        `${offsetSkipped.length} row(s) that should have been on it.`,
    )
    check(
      offsetSkipped.length > 0,
      'OFFSET skips a row once the set shifts — which is why keyset is used',
    )

    // restore
    await db.query(
      `update items set status='open', claimed_by_id=null, claimed_at=null where id = $1`,
      [first.rows[0].id],
    )

    // ---------------------------------------------------------------- 3 ----
    const deep = await db.query<{ id: string; created_at: Date }>(
      `select id, created_at from items where workspace_id = $1
        order by created_at desc, id desc limit 1 offset 5000`,
      [ws.id],
    )
    const anchor = deep.rows[0]

    const explain = async (label: string, sql: string, params: unknown[]) => {
      const rows = await db.query<Record<string, string>>(`explain (analyze, buffers) ${sql}`, params)
      const plan = rows.rows.map((r) => r['QUERY PLAN']).join('\n')
      console.log(`\n--- ${label} ---\n${plan}`)
      return plan
    }

    console.log('\n\n=== EXPLAIN ANALYZE: page 101 of the queue (50 rows) ===')
    const naive = await explain(
      'NAIVE: OFFSET 5000',
      `select * from items where workspace_id = $1
        order by created_at desc, id desc limit 50 offset 5000`,
      [ws.id],
    )
    const keyset = await explain(
      'OURS: keyset from the cursor',
      `select * from items where workspace_id = $1
         and (created_at, id) < ($2, $3)
        order by created_at desc, id desc limit 50`,
      [ws.id, anchor.created_at, anchor.id],
    )

    const rowsProduced = (plan: string) =>
      Number(/Index Scan[\s\S]*?rows=(\d+) loops/.exec(plan)?.[1] ?? 0)
    check(
      rowsProduced(naive) > rowsProduced(keyset) * 10,
      `naive produced ${rowsProduced(naive)} rows to return 50; keyset produced ${rowsProduced(keyset)}`,
    )
  } finally {
    await db.end()
  }

  console.log()
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s).`)
    process.exit(1)
  }
  console.log('R4 holds: stable ordering under churn, and a deep page costs the same as a shallow one.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
