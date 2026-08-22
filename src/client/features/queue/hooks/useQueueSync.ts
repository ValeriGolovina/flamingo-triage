'use client'

import type { InfiniteData, Query } from '@tanstack/react-query'

import type { QueueCursor, QueuePage } from '@/shared/model/queue'

/**
 * The single point that decides how this client learns about other people's
 * changes. Nothing else in the app may poll, subscribe, or set an interval.
 *
 * Correctness does not depend on any of this. A losing claim learns the truth
 * from the response to its own request, which carries the fresh row. This
 * channel only controls how often someone clicks a row that is already stale.
 *
 * Currently polling. Swapping in a Supabase Broadcast *signal* (an empty
 * message that triggers invalidation, never a payload — data keeps flowing
 * through our API so the R2 guard re-runs on every fetch) happens here and
 * changes no component. Polling stays regardless: it is also the fallback, and
 * a dropped socket without one turns "2s stale" into "frozen forever".
 */

const BASE_INTERVAL_MS = 2_000

/**
 * An infinite query refetches every loaded page on each tick, sequentially — so
 * a naive fixed interval makes request rate grow linearly with how far someone
 * has scrolled. Scaling the interval by page count keeps requests-per-second
 * flat instead: one page every 2s, five pages every 10s.
 *
 * The alternative, `maxPages`, is wrong for this list: it is a "Load more" list
 * rather than a virtualised one, so evicting a page would remove rows that are
 * still on screen.
 */
type QueueQuery = Query<
  QueuePage,
  Error,
  InfiniteData<QueuePage, QueueCursor | null>,
  readonly unknown[]
>

function queueRefetchInterval(query: QueueQuery): number {
  return BASE_INTERVAL_MS * Math.max(1, query.state.data?.pages.length ?? 1)
}

export const QUEUE_SYNC_OPTIONS = {
  refetchInterval: queueRefetchInterval,
  /**
   * React Query's default, pinned explicitly because it is a decision: a hidden
   * tab generates no traffic at all, so a page left open overnight costs nothing.
   */
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const
