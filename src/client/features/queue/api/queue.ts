import { apiFetch } from '@/client/shared/api/http'
import type { ItemStatus } from '@/shared/model/domain'
import type { QueueCursor, QueuePage } from '@/shared/model/queue'

export function fetchQueuePage(
  workspaceId: string,
  params: { status: ItemStatus | null; cursor: QueueCursor | null; limit?: number },
): Promise<QueuePage> {
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.limit) search.set('limit', String(params.limit))
  // Both halves or neither — the API rejects half a cursor rather than
  // silently restarting from the top.
  if (params.cursor) {
    search.set('cursorCreatedAt', params.cursor.createdAt)
    search.set('cursorId', params.cursor.id)
  }

  return apiFetch<QueuePage>(`/api/workspaces/${workspaceId}/items?${search}`)
}
