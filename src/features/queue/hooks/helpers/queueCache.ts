import type { InfiniteData } from '@tanstack/react-query'

import type { ItemStatus } from '@/shared/model/domain'
import type { QueueCursor, QueueItem, QueuePage } from '@/shared/model/queue'

export type QueueData = InfiniteData<QueuePage, QueueCursor | null>

/**
 * Writes a server-confirmed row back into the cached pages.
 *
 * If a status filter is active and the row no longer matches it, the row is
 * removed rather than updated: leaving a Claimed item visible under the "Open"
 * tab would be the interface stating something untrue, which costs more here
 * than a momentarily stale count.
 *
 * A full invalidation would also be correct, but it refetches every loaded page
 * to learn one fact the response already told us.
 */
export function applyItemToCache(
  data: QueueData | undefined,
  item: QueueItem,
  activeStatus: ItemStatus | null,
): QueueData | undefined {
  if (!data) return data

  const stillMatches = activeStatus === null || item.status === activeStatus
  let removed = 0

  const pages = data.pages.map((page) => {
    if (!page.items.some((existing) => existing.id === item.id)) return page

    if (stillMatches) {
      return {
        ...page,
        items: page.items.map((existing) => (existing.id === item.id ? item : existing)),
      }
    }

    removed++
    return { ...page, items: page.items.filter((existing) => existing.id !== item.id) }
  })

  if (removed === 0) return { ...data, pages }

  // Keep the "N of M" counter honest until the next fetch corrects it.
  return {
    ...data,
    pages: pages.map((page, index) =>
      index === 0 ? { ...page, total: Math.max(0, page.total - removed) } : page,
    ),
  }
}
