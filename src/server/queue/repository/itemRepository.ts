import 'server-only'

import { prisma } from '@/core/db/prisma'
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
