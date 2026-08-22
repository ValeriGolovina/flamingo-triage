import 'server-only'

import { prisma } from '@/core/db/prisma'
import type { Executor } from '@/server/lib/db'
import type { SystemContext } from '@/server/lib/system'
import { Prisma } from '@/generated/prisma/client'
import type { WorkspaceContext } from '@/server/workspace/model/context'
import type { ItemStatus } from '@/shared/model/domain'
import type { QueueCursor, QueueItem } from '@/shared/model/queue'

/**
 * The only module that talks to the items table.
 *
 * Every function takes a `WorkspaceContext` and no function takes a bare item
 * id — that is what makes R2 impossible to bypass rather than merely easy to
 * remember. Raw SQL lives here for the same reason: `(created_at, id) < (…)`
 * is the form Postgres can serve straight from the composite index, and
 * Prisma's OR-expansion of the same condition is not reliably index-friendly.
 */

type ItemRow = {
  id: string
  title: string
  status: ItemStatus
  created_at: Date
  claimed_at: Date | null
  resolved_at: Date | null
  claimed_by_id: string | null
  claimed_by_name: string | null
  resolved_by_id: string | null
  resolved_by_name: string | null
}

function toQueueItem(row: ItemRow): QueueItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    claimedBy:
      row.claimed_by_id && row.claimed_by_name
        ? { id: row.claimed_by_id, name: row.claimed_by_name }
        : null,
    claimedAt: row.claimed_at?.toISOString() ?? null,
    resolvedBy:
      row.resolved_by_id && row.resolved_by_name
        ? { id: row.resolved_by_id, name: row.resolved_by_name }
        : null,
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }
}

const SELECT_COLUMNS = Prisma.sql`
  i.id, i.title, i.status, i.created_at, i.claimed_at, i.resolved_at,
  cu.id as claimed_by_id, cu.name as claimed_by_name,
  ru.id as resolved_by_id, ru.name as resolved_by_name
`

const JOIN_ACTORS = Prisma.sql`
  left join users cu on cu.id = i.claimed_by_id
  left join users ru on ru.id = i.resolved_by_id
`

export const itemRepository = {
  /**
   * One keyset page. Asks for `limit + 1` rows so "is there a next page" is
   * answered without a second query or a count.
   */
  async listPage(
    ctx: WorkspaceContext,
    params: { status?: ItemStatus; cursor?: QueueCursor; limit: number },
  ): Promise<{ items: QueueItem[]; hasMore: boolean }> {
    const statusFilter = params.status
      ? Prisma.sql`and i.status = ${params.status}::item_status`
      : Prisma.empty

    const cursorFilter = params.cursor
      ? Prisma.sql`and (i.created_at, i.id) < (${new Date(params.cursor.createdAt)}::timestamptz, ${params.cursor.id}::uuid)`
      : Prisma.empty

    const rows = await prisma.$queryRaw<ItemRow[]>`
      select ${SELECT_COLUMNS}
        from items i
        ${JOIN_ACTORS}
       where i.workspace_id = ${ctx.workspaceId}::uuid
         ${statusFilter}
         ${cursorFilter}
       order by i.created_at desc, i.id desc
       limit ${params.limit + 1}
    `

    const hasMore = rows.length > params.limit
    return { items: rows.slice(0, params.limit).map(toQueueItem), hasMore }
  },

  /** Only worth running for the first page — see queueService. */
  async countMatching(ctx: WorkspaceContext, status?: ItemStatus): Promise<number> {
    const statusFilter = status ? Prisma.sql`and status = ${status}::item_status` : Prisma.empty
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      select count(*)::int as n
        from items
       where workspace_id = ${ctx.workspaceId}::uuid
         ${statusFilter}
    `
    return rows[0]?.n ?? 0
  },

  async findById(ctx: WorkspaceContext, itemId: string): Promise<QueueItem | null> {
    const rows = await prisma.$queryRaw<ItemRow[]>`
      select ${SELECT_COLUMNS}
        from items i
        ${JOIN_ACTORS}
       where i.id = ${itemId}::uuid
         and i.workspace_id = ${ctx.workspaceId}::uuid
    `
    return rows[0] ? toQueueItem(rows[0]) : null
  },
}

/**
 * Claim and release are single conditional statements, never read-then-write.
 * The gap between a SELECT and an UPDATE is exactly where the race in R1 lives;
 * in one statement there is no gap, because Postgres locks the row and the
 * second writer re-evaluates the WHERE clause against the updated value.
 *
 * A zero-row result is therefore the answer "somebody else was first", not a
 * failure — the caller reads the fresh row to find out who.
 */
export const itemMutations = {
  async claim(ctx: WorkspaceContext, itemId: string): Promise<QueueItem | null> {
    const rows = await prisma.$queryRaw<ItemRow[]>`
      with claimed as (
        update items
           set status = 'claimed',
               claimed_by_id = ${ctx.userId}::uuid,
               claimed_at = now(),
               last_claimed_by_id = ${ctx.userId}::uuid
         where id = ${itemId}::uuid
           and workspace_id = ${ctx.workspaceId}::uuid
           and status = 'open'
        returning *
      )
      select ${SELECT_COLUMNS} from claimed i ${JOIN_ACTORS}
    `
    return rows[0] ? toQueueItem(rows[0]) : null
  },

  /**
   * Only the holder may release. Clearing the claim columns is required by the
   * CHECK constraint; clearing `last_claimed_by_id` is a decision — releasing
   * says "not mine", so it also gives up the right to resolve it later. That is
   * what separates release from the sweep, which keeps it.
   */
  async release(ctx: WorkspaceContext, itemId: string): Promise<QueueItem | null> {
    const rows = await prisma.$queryRaw<ItemRow[]>`
      with released as (
        update items
           set status = 'open',
               claimed_by_id = null,
               claimed_at = null,
               last_claimed_by_id = null
         where id = ${itemId}::uuid
           and workspace_id = ${ctx.workspaceId}::uuid
           and status = 'claimed'
           and claimed_by_id = ${ctx.userId}::uuid
        returning *
      )
      select ${SELECT_COLUMNS} from released i ${JOIN_ACTORS}
    `
    return rows[0] ? toQueueItem(rows[0]) : null
  },
}

/**
 * Resolve accepts an executor so the caller can put it in the same transaction
 * as the outbox write.
 *
 * Two ways in, and the second is narrow on purpose. The ordinary path is "you
 * hold it". The other is R5: your claim expired and the sweep returned the item
 * to the queue, but you did the work — so `last_claimed_by_id`, which the sweep
 * deliberately preserves, still names you.
 *
 * Scoping it that way matters: `or status = 'open'` on its own would let any
 * member resolve any unclaimed item without ever holding it, which is reachable
 * by curl even though the UI never offers it, and it would quietly undo the
 * product rule that a claim is how work is not duplicated.
 */
export async function resolveItemRow(
  db: Executor,
  ctx: WorkspaceContext,
  itemId: string,
): Promise<QueueItem | null> {
  const rows = await db.$queryRaw<ItemRow[]>`
    with resolved as (
      update items
         set status = 'resolved', resolved_by_id = ${ctx.userId}::uuid, resolved_at = now()
       where id = ${itemId}::uuid
         and workspace_id = ${ctx.workspaceId}::uuid
         and (
           (status = 'claimed' and claimed_by_id = ${ctx.userId}::uuid)
           or (status = 'open' and last_claimed_by_id = ${ctx.userId}::uuid)
         )
      returning *
    )
    select ${SELECT_COLUMNS} from resolved i ${JOIN_ACTORS}
  `
  return rows[0] ? toQueueItem(rows[0]) : null
}

export type SweptClaim = { id: string; workspace_id: string }

/**
 * R5. Returns claims older than the window to the queue.
 *
 * Deliberately unscoped by workspace — the scheduler has no user and no
 * workspace — which is why it demands a `SystemContext` instead of just taking
 * no context at all.
 *
 * One conditional UPDATE again, for the same reason as R1: the row must not be
 * read, judged, and then written. Somebody may resolve or release an item in
 * the middle of a sweep, and the WHERE clause is what makes that safe.
 *
 * Clearing the holder columns is not optional — the CHECK constraint rejects an
 * `open` row that still names a holder, which is precisely the bug this kind of
 * bulk update tends to ship with.
 */
export async function countStaleClaims(
  _system: SystemContext,
  staleAfterMinutes: number,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: number }>>`
    select count(*)::int as n
      from items
     where status = 'claimed'
       and claimed_at < now() - (interval '1 minute' * ${staleAfterMinutes})
  `
  return rows[0]?.n ?? 0
}

export async function sweepStaleClaims(
  _system: SystemContext,
  staleAfterMinutes: number,
  limit: number,
): Promise<SweptClaim[]> {
  return prisma.$queryRaw<SweptClaim[]>`
    with stale as (
      select id
        from items
       where status = 'claimed'
         and claimed_at < now() - (interval '1 minute' * ${staleAfterMinutes})
       order by claimed_at
       limit ${limit}
         for update skip locked
    )
    update items i
       set status = 'open', claimed_by_id = null, claimed_at = null
      from stale
     where i.id = stale.id
    returning i.id, i.workspace_id
  `
}
