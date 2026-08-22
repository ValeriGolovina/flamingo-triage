'use client'

import { useEffect } from 'react'

import { useSession } from '@/features/auth/hooks/useSession'
import { useQueueFilters } from '@/features/queue/store/queueFilters'

/**
 * Keeps the selected workspace pointing at something the current user can
 * actually see. Switching identity is the case that matters: Anya's workspace
 * must not stay selected after signing in as Dmytro, or the first request of
 * the new session is a 404 the user did not ask for.
 */
export function useCurrentWorkspace() {
  const { workspaces } = useSession()
  const workspaceId = useQueueFilters((s) => s.workspaceId)
  const setWorkspaceId = useQueueFilters((s) => s.setWorkspaceId)

  const isValid = workspaces.some((w) => w.id === workspaceId)

  useEffect(() => {
    if (isValid) return
    setWorkspaceId(workspaces[0]?.id ?? null)
  }, [isValid, workspaces, setWorkspaceId])

  const current = workspaces.find((w) => w.id === workspaceId) ?? null

  return { workspaces, current, setWorkspaceId }
}
