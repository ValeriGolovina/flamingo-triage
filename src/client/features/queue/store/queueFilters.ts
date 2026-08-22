'use client'

import { create } from 'zustand'

import type { ItemStatus } from '@/shared/model/domain'

/**
 * This feature's slice. It holds only what the browser owns and only what
 * belongs to the queue — the active status tab and a transient notice.
 *
 * The selected workspace is not here: three features read it, so it lives in
 * `shared/workspace`. No server data lives here either; the queue itself
 * belongs to React Query, which owns fetching, caching and invalidation.
 */
type QueueFiltersState = {
  status: ItemStatus | null
  /** Transient message after an action — "Dmytro claimed this a moment before you". */
  notice: string | null
  setStatus: (status: ItemStatus | null) => void
  setNotice: (notice: string | null) => void
}

export const useQueueFilters = create<QueueFiltersState>((set) => ({
  status: null,
  notice: null,
  setStatus: (status) => set({ status, notice: null }),
  setNotice: (notice) => set({ notice }),
}))
