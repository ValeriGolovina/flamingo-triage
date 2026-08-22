'use client'

import { create } from 'zustand'

import type { ItemStatus } from '@/shared/model/domain'

/**
 * What the queue view is currently showing: which status tab is active, and
 * what the last action had to say.
 *
 * This is the whole of the queue's client state, and the only feature slice in
 * the app. That is not an omission — auth's state is "who am I", which is
 * server state and belongs to React Query, and the selected workspace is read
 * by three places so it lives in `shared/workspace`. A slice per feature would
 * mean empty stores or server data mirrored into them, and the second is worse
 * than the first.
 */
type QueueViewState = {
  status: ItemStatus | null
  /** Transient message after an action — "Dmytro claimed this a moment before you". */
  notice: string | null
  setStatus: (status: ItemStatus | null) => void
  setNotice: (notice: string | null) => void
}

export const useQueueView = create<QueueViewState>((set) => ({
  status: null,
  notice: null,
  setStatus: (status) => set({ status, notice: null }),
  setNotice: (notice) => set({ notice }),
}))
