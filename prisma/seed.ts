/**
 * Seeds ~10,000 items across 3 workspaces.
 *
 * Raw SQL on purpose: this is a script, not application code, and a bulk
 * INSERT ... SELECT unnest(...) is the right tool for 10k rows. The "raw SQL
 * only inside repository/" rule covers request-path code.
 *
 * Destructive by design, but never accidentally: it refuses to run against a
 * database that already holds items unless --reset is passed.
 *
 *   npm run seed
 *   npm run seed -- --reset
 */
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'

loadEnv({ path: '.env.local', quiet: true })

const TOTAL_ITEMS = 10_000

const USERS = [
  'Anya Kovalenko',
  'Dmytro Bondar',
  'Oleh Tkachenko',
  'Kateryna Shevchuk',
  'Petro Marchuk',
] as const

const WORKSPACES = [
  { name: 'Acme Support', share: 0.6 },
  { name: 'Globex Support', share: 0.3 },
  { name: 'Initech Ops', share: 0.1 },
] as const

/**
 * Deliberately uneven so R2 is demonstrable without editing data by hand:
 * Anya can claim in Acme, can only read in Globex, and does not exist in
 * Initech — one account covers all three outcomes.
 */
const MEMBERSHIPS: Array<[user: number, workspace: number, role: string]> = [
  [0, 0, 'member'],
  [0, 1, 'viewer'],
  [1, 0, 'member'],
  [1, 2, 'owner'],
  [2, 0, 'owner'],
  [2, 1, 'member'],
  [3, 1, 'owner'],
  [3, 2, 'member'],
  [4, 0, 'viewer'],
  [4, 2, 'member'],
]

const SUBJECTS = [
  'Card declined at checkout',
  'Refund not received',
  'Login loop on Safari',
  'Duplicate charge on invoice',
  'Cannot change account email',
  'Export finishes with an empty file',
  'Webhook retries never stop',
  'Two-factor code always rejected',
  'Attachment upload times out',
  'Billing address will not save',
  'Seat count wrong after upgrade',
  'API returns 500 on batch create',
  'Password reset link expired instantly',
  'Notifications arrive twice',
  'Search misses recent records',
  'Timezone off by one hour in reports',
  'Invite email never delivered',
  'Subscription cancelled without request',
  'CSV import drops the last row',
  'Dashboard blank after deploy',
]

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const randomInt = (max: number) => Math.floor(Math.random() * max)
const pick = <T>(xs: readonly T[]) => xs[randomInt(xs.length)]

async function main() {
  const reset = process.argv.includes('--reset')
  const client = new Client({ connectionString: process.env.DIRECT_URL })
  await client.connect()

  try {
    const existing = await client.query<{ n: number }>(
      'select count(*)::int as n from items',
    )
    if (existing.rows[0].n > 0 && !reset) {
      console.error(
        `Refusing to seed: the database already holds ${existing.rows[0].n} items.\n` +
          'Re-run with --reset to wipe and reseed:  npm run seed -- --reset',
      )
      process.exitCode = 1
      return
    }

    console.log('Wiping…')
    // Order matters only for readability — the FKs cascade.
    await client.query(
      'truncate notification_jobs, items, memberships, users, workspaces cascade',
    )

    const userIds: string[] = []
    for (const name of USERS) {
      const { rows } = await client.query<{ id: string }>(
        'insert into users (name) values ($1) returning id',
        [name],
      )
      userIds.push(rows[0].id)
    }

    const workspaceIds: string[] = []
    for (const { name } of WORKSPACES) {
      const { rows } = await client.query<{ id: string }>(
        'insert into workspaces (name) values ($1) returning id',
        [name],
      )
      workspaceIds.push(rows[0].id)
    }

    for (const [user, workspace, role] of MEMBERSHIPS) {
      await client.query(
        'insert into memberships (user_id, workspace_id, role) values ($1, $2, $3::role)',
        [userIds[user], workspaceIds[workspace], role],
      )
    }

    // Only non-viewers can hold or resolve an item, so seeded data must not
    // contradict the rule the app enforces.
    const actorsByWorkspace = workspaceIds.map((_, w) =>
      MEMBERSHIPS.filter(([, ws, role]) => ws === w && role !== 'viewer').map(
        ([u]) => userIds[u],
      ),
    )

    console.log(`Generating ${TOTAL_ITEMS.toLocaleString('en-US')} items…`)
    const now = Date.now()
    const rows = Array.from({ length: TOTAL_ITEMS }, (_, i) => {
      // Uneven across workspaces, and uneven across statuses — an even spread
      // makes every query plan look the same and hides the interesting cases.
      const r = Math.random()
      let w = 0
      let acc = 0
      for (let k = 0; k < WORKSPACES.length; k++) {
        acc += WORKSPACES[k].share
        if (r < acc) {
          w = k
          break
        }
      }

      const createdAt = new Date(now - randomInt(90 * DAY))
      const title = `${pick(SUBJECTS)} (#${1000 + i})`

      const s = Math.random()
      const status = s < 0.6 ? 'open' : s < 0.85 ? 'claimed' : 'resolved'

      if (status === 'open') {
        return [workspaceIds[w], title, status, null, null, null, null, null, createdAt]
      }

      // `last_claimed_by_id` mirrors the holder, matching what a real claim
      // writes — otherwise seeded items would lose the right to a late resolve
      // the moment the R5 sweep released them.
      const actor = pick(actorsByWorkspace[w])

      // Most live claims are fresh; a minority are already past the 30-minute
      // window, so the R5 sweep has real work without wiping the board.
      const age = Math.random() < 0.8 ? randomInt(25 * MINUTE) : 30 * MINUTE + randomInt(8 * HOUR)
      const claimedAt = new Date(Math.max(createdAt.getTime() + MINUTE, now - age))

      if (status === 'claimed') {
        return [workspaceIds[w], title, status, actor, claimedAt, actor, null, null, createdAt]
      }

      const resolvedAt = new Date(
        Math.min(now, claimedAt.getTime() + MINUTE + randomInt(4 * HOUR)),
      )
      return [workspaceIds[w], title, status, actor, claimedAt, actor, actor, resolvedAt, createdAt]
    })

    const BATCH = 2_000
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      await client.query(
        `insert into items
           (workspace_id, title, status, claimed_by_id, claimed_at, last_claimed_by_id,
            resolved_by_id, resolved_at, created_at)
         select * from unnest(
           $1::uuid[], $2::text[], $3::item_status[], $4::uuid[], $5::timestamptz[],
           $6::uuid[], $7::uuid[], $8::timestamptz[], $9::timestamptz[]
         )`,
        [0, 1, 2, 3, 4, 5, 6, 7, 8].map((col) => batch.map((row) => row[col])),
      )
      process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`)
    }
    console.log()

    await client.query('analyze items')

    const summary = await client.query(
      `select w.name, i.status, count(*)::int as n
         from items i join workspaces w on w.id = i.workspace_id
        group by 1, 2 order by 1, 2`,
    )
    console.table(summary.rows)

    const stale = await client.query<{ n: number }>(
      `select count(*)::int as n from items
        where status = 'claimed' and claimed_at < now() - interval '30 minutes'`,
    )
    console.log(`Stale claims waiting for the R5 sweep: ${stale.rows[0].n}`)
    console.log('\nSign in as Anya Kovalenko to see all three R2 outcomes:')
    console.log('  Acme Support = member · Globex Support = viewer · Initech Ops = no access')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
