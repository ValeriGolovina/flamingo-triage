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
  /** Transient message after an action — "Dmytro claimed this a moment before you". */
  notice: string | null
  setWorkspaceId: (id: string | null) => void
  setStatus: (status: ItemStatus | null) => void
  setNotice: (notice: string | null) => void
}

export const useQueueFilters = create<QueueFiltersState>((set) => ({
  workspaceId: null,
  status: null,
  notice: null,
  setWorkspaceId: (workspaceId) => set({ workspaceId, notice: null }),
  setStatus: (status) => set({ status, notice: null }),
  setNotice: (notice) => set({ notice }),
}))
