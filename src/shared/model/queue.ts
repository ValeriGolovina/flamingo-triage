import type { ClaimOutcome, ItemStatus } from './domain'

/** Wire shape of a queue row. Dates are ISO strings — JSON has no Date. */
export type QueueItem = {
  id: string
  title: string
  status: ItemStatus
  claimedBy: Actor | null
  claimedAt: string | null
  resolvedBy: Actor | null
  resolvedAt: string | null
  createdAt: string
}

export type Actor = {
  id: string
  name: string
}

/**
 * The cursor is the sort key of the last row on the page, not an offset.
 * Both halves are required: created_at is not unique after a bulk seed, and a
 * tie is exactly what makes keyset pagination skip or repeat rows.
 */
export type QueueCursor = {
  createdAt: string
  id: string
}

export type QueuePage = {
  items: QueueItem[]
  nextCursor: QueueCursor | null
  /** Total matching the current filter. A separate COUNT — see DECISIONS.md. */
  total: number
}

/**
 * The result of a claim attempt. `Lost` is not an error: the request was valid,
 * somebody else was simply first, and `item` carries the fresh row so the UI
 * can reconcile without waiting for the next poll.
 */
export type ClaimResult =
  | { outcome: ClaimOutcome.Won; item: QueueItem }
  | { outcome: ClaimOutcome.Lost; item: QueueItem }
