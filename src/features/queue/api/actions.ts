import { apiFetch } from '@/shared/api/http'
import type { ActionResult } from '@/shared/model/queue'

const action = (workspaceId: string, itemId: string, verb: 'claim' | 'release') =>
  apiFetch<ActionResult>(`/api/workspaces/${workspaceId}/items/${itemId}/${verb}`, {
    method: 'POST',
  })

export const claimItem = (workspaceId: string, itemId: string) =>
  action(workspaceId, itemId, 'claim')

export const releaseItem = (workspaceId: string, itemId: string) =>
  action(workspaceId, itemId, 'release')
