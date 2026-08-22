import { apiFetch } from '@/shared/api/http'
import type { ActionResult } from '@/shared/model/queue'

type Verb = 'claim' | 'release' | 'resolve'

const action = (workspaceId: string, itemId: string, verb: Verb) =>
  apiFetch<ActionResult>(`/api/workspaces/${workspaceId}/items/${itemId}/${verb}`, {
    method: 'POST',
  })

export const claimItem = (workspaceId: string, itemId: string) =>
  action(workspaceId, itemId, 'claim')

export const releaseItem = (workspaceId: string, itemId: string) =>
  action(workspaceId, itemId, 'release')

export const resolveItem = (workspaceId: string, itemId: string) =>
  action(workspaceId, itemId, 'resolve')

export type NotificationSummary = { pending: number; dead: number }

export const fetchNotificationSummary = (workspaceId: string) =>
  apiFetch<NotificationSummary>(`/api/workspaces/${workspaceId}/notifications`)
