/**
 * R2: no cross-workspace read or write through any route, and a viewer reads
 * but cannot act. Written as the reviewer would probe it — with a session
 * cookie and ids pasted in from elsewhere.
 *
 *   BASE_URL=http://localhost:3000 npm run verify:r2
 */
import { createHmac } from 'node:crypto'

import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

type Actor = { id: string; name: string }
type Membership = { id: string; name: string; role: string }

let failures = 0
const check = (ok: boolean, label: string) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

const sign = (payload: string) =>
  createHmac('sha256', process.env.SESSION_SECRET ?? '').update(payload).digest('base64url')

async function probe(label: string, url: string, expected: number, headers: HeadersInit = {}) {
  const response = await fetch(url, { headers })
  const body = await response.text()
  check(
    response.status === expected,
    `${label.padEnd(44)} ${response.status} (want ${expected}) ${body.slice(0, 40)}`,
  )
}

async function main() {
  const db = new Client({ connectionString: process.env.DIRECT_URL })
  await db.connect()

  try {
    const { users } = (await (await fetch(`${BASE_URL}/api/users`)).json()) as { users: Actor[] }

    // Anya is seeded as member of one workspace, viewer in another, and absent
    // from a third — one identity that reaches all three outcomes.
    const anya = users.find((u) => u.name.startsWith('Anya'))!
    const signInResponse = await fetch(`${BASE_URL}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: anya.id }),
    })
    const { workspaces } = (await signInResponse.json()) as { workspaces: Membership[] }
    const cookie = signInResponse.headers
      .getSetCookie()
      .find((c) => c.startsWith('triage_session='))!
      .split(';')[0]
    const headers = { cookie }

    const member = workspaces.find((w) => w.role === 'member')!
    const viewer = workspaces.find((w) => w.role === 'viewer')!
    const foreign = (
      await db.query<{ id: string }>(
        `select id from workspaces where id <> all($1::uuid[]) limit 1`,
        [workspaces.map((w) => w.id)],
      )
    ).rows[0]
    const foreignItem = (
      await db.query<{ id: string }>(`select id from items where workspace_id = $1 limit 1`, [
        foreign.id,
      ])
    ).rows[0]
    const viewerItem = (
      await db.query<{ id: string }>(
        `select id from items where workspace_id = $1 and status = 'open' limit 1`,
        [viewer.id],
      )
    ).rows[0]

    const items = (ws: string) => `${BASE_URL}/api/workspaces/${ws}/items`

    console.log('\n— reading —')
    await probe('own workspace, member', `${items(member.id)}?limit=1`, 200, headers)
    await probe('own workspace, viewer', `${items(viewer.id)}?limit=1`, 200, headers)
    await probe('workspace she is not in', `${items(foreign.id)}?limit=1`, 404, headers)
    await probe(
      'workspace that does not exist',
      `${items('00000000-0000-4000-8000-000000000000')}`,
      404,
      headers,
    )
    await probe('malformed workspace id', `${items('garbage')}`, 404, headers)

    console.log('\n— confused deputy: her workspace, a foreign item —')
    const statusOf = async (id: string) =>
      (await db.query<{ status: string }>(`select status::text from items where id = $1`, [id]))
        .rows[0].status

    const before = await statusOf(foreignItem.id)
    const deputy = await fetch(`${items(member.id)}/${foreignItem.id}/claim`, {
      method: 'POST',
      headers,
    })
    check(deputy.status === 404, `claim a foreign item through her own workspace  ${deputy.status} (want 404)`)
    const after = await statusOf(foreignItem.id)
    check(after === before, `the foreign item is unchanged (${before} → ${after})`)

    console.log('\n— a viewer may read but not act —')
    const viewerClaim = await fetch(`${items(viewer.id)}/${viewerItem.id}/claim`, {
      method: 'POST',
      headers,
    })
    check(viewerClaim.status === 403, `viewer claiming in her own workspace  ${viewerClaim.status} (want 403)`)

    console.log('\n— the cookie itself —')
    await probe('no cookie at all', `${items(member.id)}`, 401)
    await probe('forged signature', `${items(member.id)}`, 401, {
      cookie: `triage_session=${anya.id}.${Date.now()}.notarealsignature`,
    })
    const stalePayload = `${anya.id}.${Date.now() - 31 * 24 * 60 * 60 * 1000}`
    await probe('correctly signed but expired', `${items(member.id)}`, 401, {
      cookie: `triage_session=${stalePayload}.${sign(stalePayload)}`,
    })
    const futurePayload = `${anya.id}.${Date.now() + 60 * 60 * 1000}`
    await probe('correctly signed but issued in the future', `${items(member.id)}`, 401, {
      cookie: `triage_session=${futurePayload}.${sign(futurePayload)}`,
    })
    await probe('half a cursor', `${items(member.id)}?cursorId=${foreignItem.id}`, 400, headers)
  } finally {
    await db.end()
  }

  console.log()
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s).`)
    process.exit(1)
  }
  console.log('R2 holds: no cross-workspace access, viewers cannot act, and a cookie cannot be forged or reused forever.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
