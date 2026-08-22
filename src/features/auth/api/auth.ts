import { apiFetch } from '@/shared/api/http'
import type { Actor, SessionState } from '@/shared/session/api'

export const fetchUsers = () => apiFetch<{ users: Actor[] }>('/api/users')

export const signIn = (userId: string) =>
  apiFetch<SessionState>('/api/session', { method: 'POST', body: JSON.stringify({ userId }) })

export const signOut = () => apiFetch<void>('/api/session', { method: 'DELETE' })
