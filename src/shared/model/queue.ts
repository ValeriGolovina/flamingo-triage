import type { ActionOutcome, ItemStatus, RejectionReason } from './domain'

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
 * The result of claim / release / resolve.
 *
 * Rejection is not an error — the request was valid and authorized, the world
 * had simply moved. `item` is always the fresh row, which is what lets the UI
 * reconcile immediately instead of showing a stale row until the next poll.
 */
export type ActionResult = {
  outcome: ActionOutcome
  item: QueueItem
  reason?: RejectionReason
  /**
   * R5: the resolve landed on an item the caller did not hold — the claim had
   * expired and the sweep returned it to the queue, or it was never claimed.
   * Those two are indistinguishable once the sweep has cleared the holder, and
   * both are accepted: the work was done either way. Surfaced so the UI can say
   * so rather than pretending the normal path happened.
   */
  resolvedWithoutClaim?: boolean
}
