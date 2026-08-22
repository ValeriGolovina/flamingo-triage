'use client'

import { create } from 'zustand'

/**
 * Which workspace is on screen. One store, read by the switcher, the queue and
 * the action hooks — so the query key and the cache-patch key can never be
 * computed from two different sources and disagree for a render.
 */
type CurrentWorkspaceState = {
  workspaceId: string | null
  setWorkspaceId: (id: string | null) => void
}

export const useCurrentWorkspaceStore = create<CurrentWorkspaceState>((set) => ({
  workspaceId: null,
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
}))
