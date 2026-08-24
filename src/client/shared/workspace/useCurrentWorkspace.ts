'use client'

import { useEffect } from 'react'

import { useSession } from '@/client/shared/session/useSession'

import { useCurrentWorkspaceStore } from './store'

/**
 * Reads the selected workspace. Pure — no effect, no writes.
 *
 * Two components need this at once, and an effect inside a hook runs once per
 * caller. Both instances would then write the fallback on mount, and if they
 * ever computed it from different data for one render, the second write would
 * quietly overwrite the first with a stale value.
 */
export function useCurrentWorkspace() {
  const { workspaces } = useSession()
  const workspaceId = useCurrentWorkspaceStore((s) => s.workspaceId)
  const setWorkspaceId = useCurrentWorkspaceStore((s) => s.setWorkspaceId)

  return {
    workspaces,
    current: workspaces.find((w) => w.id === workspaceId) ?? null,
    setWorkspaceId,
  }
}

/**
 * Keeps the selection pointing at something the current user can actually see.
 * Call this exactly once, at the page level.
 *
 * Switching identity is the case that matters: Anya's workspace must not stay
 * selected after signing in as Dmytro, or the first request of the new session
 * is a 404 nobody asked for.
 */
export function useKeepWorkspaceValid() {
  const { workspaces } = useSession()
  const workspaceId = useCurrentWorkspaceStore((s) => s.workspaceId)
  const setWorkspaceId = useCurrentWorkspaceStore((s) => s.setWorkspaceId)

  const isValid = workspaces.some((w) => w.id === workspaceId)
  const fallbackId = workspaces[0]?.id ?? null

  useEffect(() => {
    if (isValid) return
    setWorkspaceId(fallbackId)
  }, [isValid, fallbackId, setWorkspaceId])
}
