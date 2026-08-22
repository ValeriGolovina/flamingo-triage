/**
 * R1 under real concurrency: fires N simultaneous claims at one open item and
 * asserts that exactly one wins and every loser is told who won.
 *
 * This is the thing the brief asks to be able to run. It drives the deployed
 * HTTP API rather than calling the database, because the claim has to hold
 * through the whole stack — not just in the one SQL statement.
 *
 *   npm run verify:r1
 *   BASE_URL=https://your-app.vercel.app npm run verify:r1
 *   CLAIMERS=12 ROUNDS=10 npm run verify:r1
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const CLAIMERS = Number(process.env.CLAIMERS ?? 8)
const ROUNDS = Number(process.env.ROUNDS ?? 5)

type Actor = { id: string; name: string }
type Membership = { id: string; name: string; role: string }
type Item = { id: string; title: string; status: string; claimedBy: Actor | null }
type ActionResult = { outcome: 'applied' | 'rejected'; item: Item; reason?: string }

async function json<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

/** A signed-in identity, reduced to the one cookie header its requests need. */
async function signIn(userId: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  await json(response, 'sign in')

  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('triage_session='))
  if (!cookie) throw new Error('sign in did not return a session cookie')
  return cookie.split(';')[0]
}

async function main() {
  console.log(`Target: ${BASE_URL}`)

  const { users } = await json<{ users: Actor[] }>(
    await fetch(`${BASE_URL}/api/users`),
    'list users',
  )
  if (users.length === 0) throw new Error('No users. Run `npm run seed` first.')

  // Everyone competes inside one workspace where they can all actually claim,
  // so a loss is a genuine race and never an authorization failure in disguise.
  const sessions: Array<{ name: string; cookie: string; workspaces: Membership[] }> = []
  for (const user of users) {
    const cookie = await signIn(user.id)
    const { workspaces } = await json<{ workspaces: Membership[] }>(
      await fetch(`${BASE_URL}/api/session`, { headers: { cookie } }),
      'read session',
    )
    sessions.push({ name: user.name, cookie, workspaces })
  }

  const counts = new Map<string, number>()
  for (const s of sessions) {
    for (const w of s.workspaces) {
      if (w.role !== 'viewer') counts.set(w.id, (counts.get(w.id) ?? 0) + 1)
    }
  }
  const [workspaceId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  if (!workspaceId) throw new Error('No workspace with members who can claim.')

  const contenders = Array.from({ length: CLAIMERS }, (_, i) => {
    const eligible = sessions.filter((s) =>
      s.workspaces.some((w) => w.id === workspaceId && w.role !== 'viewer'),
    )
    return eligible[i % eligible.length]
  })

  console.log(
    `Workspace: ${contenders[0].workspaces.find((w) => w.id === workspaceId)?.name}`,
  )
  console.log(`${CLAIMERS} simultaneous claimers x ${ROUNDS} rounds\n`)

  let failures = 0

  for (let round = 1; round <= ROUNDS; round++) {
    const { items } = await json<{ items: Item[] }>(
      await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items?status=open&limit=1`, {
        headers: { cookie: contenders[0].cookie },
      }),
      'find an open item',
    )
    const target = items[0]
    if (!target) throw new Error('No open items left to contend for.')

    const started = Date.now()
    // No await inside the loop: every request is in flight before any resolves.
    const results = await Promise.all(
      contenders.map(async (session) => {
        const response = await fetch(
          `${BASE_URL}/api/workspaces/${workspaceId}/items/${target.id}/claim`,
          { method: 'POST', headers: { cookie: session.cookie } },
        )
        return { session, result: await json<ActionResult>(response, 'claim') }
      }),
    )
    const elapsed = Date.now() - started

    const won = results.filter((r) => r.result.outcome === 'applied')
    const lost = results.filter((r) => r.result.outcome === 'rejected')

    const winnerName = won[0]?.session.name ?? '—'
    const everyLoserWasTold = lost.every(
      (r) => r.result.item.claimedBy?.name === winnerName && r.result.reason === 'already_claimed',
    )
    const ok = won.length === 1 && everyLoserWasTold

    if (!ok) failures++
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  round ${round}  ${won.length} won / ${lost.length} lost` +
        `  winner: ${winnerName}  (${elapsed}ms)` +
        (everyLoserWasTold ? '  every loser was told who has it' : '  LOSERS WERE NOT TOLD'),
    )

    // Hand the item back so a re-run has open items to contend for. Guarded:
    // the failure this script exists to catch is "nobody won", and dereferencing
    // the winner there would crash instead of reporting it.
    if (won[0]) {
      await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/items/${target.id}/release`, {
        method: 'POST',
        headers: { cookie: won[0].session.cookie },
      })
    }
  }

  console.log()
  if (failures > 0) {
    console.error(`FAILED: ${failures}/${ROUNDS} rounds did not have exactly one winner.`)
    process.exit(1)
  }
  console.log(
    `Exactly one winner in all ${ROUNDS} rounds, and every loser learned who has it.`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
