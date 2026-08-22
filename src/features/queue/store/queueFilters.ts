'use client'

import { create } from 'zustand'

import type { ItemStatus } from '@/shared/model/domain'

/**
 * This feature's slice. It holds only what the browser owns — which workspace
 * is on screen, which status tab is active, which row is highlighted.
 *
 * No server data lives here. The queue itself belongs to React Query, which
 * owns fetching, caching and invalidation; mirroring rows into a store would
 * mean reimplementing all three by hand.
 */
type QueueFiltersState = {
  workspaceId: string | null
  status: ItemStatus | null
  setWorkspaceId: (id: string | null) => void
  setStatus: (status: ItemStatus | null) => void
}

export const useQueueFilters = create<QueueFiltersState>((set) => ({
  workspaceId: null,
  status: null,
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setStatus: (status) => set({ status }),
}))
