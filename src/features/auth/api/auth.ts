import { apiFetch } from '@/shared/api/http'
import type { Role } from '@/shared/model/domain'

export type Actor = { id: string; name: string }
export type WorkspaceMembership = { id: string; name: string; role: Role }
export type SessionState = { user: Actor | null; workspaces: WorkspaceMembership[] }

export const fetchSession = () => apiFetch<SessionState>('/api/session')

export const fetchUsers = () => apiFetch<{ users: Actor[] }>('/api/users')

export const signIn = (userId: string) =>
  apiFetch<SessionState>('/api/session', { method: 'POST', body: JSON.stringify({ userId }) })

export const signOut = () => apiFetch<void>('/api/session', { method: 'DELETE' })
