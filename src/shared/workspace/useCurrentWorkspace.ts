'use client'

import { useEffect } from 'react'

import { useSession } from '@/shared/session/useSession'

import { useCurrentWorkspaceStore } from './store'

/**
 * Keeps the selected workspace pointing at something the current user can
 * actually see. Switching identity is the case that matters: Anya's workspace
 * must not stay selected after signing in as Dmytro, or the first request of
 * the new session is a 404 nobody asked for.
 */
export function useCurrentWorkspace() {
  const { workspaces } = useSession()
  const workspaceId = useCurrentWorkspaceStore((s) => s.workspaceId)
  const setWorkspaceId = useCurrentWorkspaceStore((s) => s.setWorkspaceId)

  const isValid = workspaces.some((w) => w.id === workspaceId)
  const fallbackId = workspaces[0]?.id ?? null

  useEffect(() => {
    if (isValid) return
    setWorkspaceId(fallbackId)
  }, [isValid, fallbackId, setWorkspaceId])

  return {
    workspaces,
    current: workspaces.find((w) => w.id === workspaceId) ?? null,
    setWorkspaceId,
  }
}
