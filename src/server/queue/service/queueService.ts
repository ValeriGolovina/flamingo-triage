import 'server-only'

import type { WorkspaceContext } from '@/server/workspace/model/context'
import type { QueuePage } from '@/shared/model/queue'

import type { QueueQuery } from '../model/queries'
import { itemRepository } from '../repository/itemRepository'

export async function getQueuePage(ctx: WorkspaceContext, query: QueueQuery): Promise<QueuePage> {
  const cursor =
    query.cursorCreatedAt && query.cursorId
      ? { createdAt: query.cursorCreatedAt, id: query.cursorId }
      : undefined

  // The count is a second query on purpose. It is cheap at 10k rows and it is
  // what lets the UI say "50 of 1,284" instead of implying the page is the set.
  const [page, total] = await Promise.all([
    itemRepository.listPage(ctx, { status: query.status, cursor, limit: query.limit }),
    itemRepository.countMatching(ctx, query.status),
  ])

  const last = page.items.at(-1)

  return {
    items: page.items,
    total,
    nextCursor:
      page.hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}
