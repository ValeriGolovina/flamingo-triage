import { apiFetch } from '@/client/shared/api/http'
import type { Role } from '@/shared/model/domain'

export type Actor = { id: string; name: string }
export type WorkspaceMembership = { id: string; name: string; role: Role }
export type SessionState = { user: Actor | null; workspaces: WorkspaceMembership[] }

export const fetchSession = () => apiFetch<SessionState>('/api/session')
