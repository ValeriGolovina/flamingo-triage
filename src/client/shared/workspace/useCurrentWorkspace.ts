'use client'

import { useEffect } from 'react'

import type { WorkspaceMembership } from '@/client/shared/session/api'
import { useSession } from '@/client/shared/session/useSession'

import { useCurrentWorkspaceStore } from './store'

/**
 * Where an identity lands when it has no valid selection of its own.
 *
 * One expression, exported, because two places need the same answer and they
 * must not be able to disagree: the effect below, which repairs a stale
 * selection, and sign-in, which replaces it the moment the identity changes.
 */
export const defaultWorkspaceId = (workspaces: WorkspaceMembership[]): string | null =>
  workspaces[0]?.id ?? null

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
 * This is the safety net, not the mechanism. It runs in an effect, and child
 * effects run before parent ones — so on a switch of identity the queue would
 * already have subscribed with the previous workspace and sent one request into
 * a workspace this session cannot see. Sign-in therefore replaces the selection
 * itself, and this catches everything else: first load, a reseed, a membership
 * revoked while the tab was open.
 */
export function useKeepWorkspaceValid() {
  const { workspaces } = useSession()
  const workspaceId = useCurrentWorkspaceStore((s) => s.workspaceId)
  const setWorkspaceId = useCurrentWorkspaceStore((s) => s.setWorkspaceId)

  const isValid = workspaces.some((w) => w.id === workspaceId)
  const fallbackId = defaultWorkspaceId(workspaces)

  useEffect(() => {
    if (isValid) return
    setWorkspaceId(fallbackId)
  }, [isValid, fallbackId, setWorkspaceId])
}
