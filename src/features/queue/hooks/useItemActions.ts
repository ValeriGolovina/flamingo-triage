'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { ActionOutcome, RejectionReason } from '@/shared/model/domain'
import type { ActionResult } from '@/shared/model/queue'

import { claimItem, releaseItem } from '../api/actions'
import { useQueueFilters } from '../store/queueFilters'
import { applyItemToCache, type QueueData } from './helpers/queueCache'
import { queueKeys } from './useQueue'

/** What the user is told when the world moved before their click landed. */
function noticeFor(result: ActionResult): string | null {
  if (result.outcome === ActionOutcome.Applied) return null

  switch (result.reason) {
    case RejectionReason.AlreadyClaimed:
      return `${result.item.claimedBy?.name ?? 'Someone else'} claimed this a moment before you.`
    case RejectionReason.NotHeldByYou:
      return 'You no longer hold this item.'
    case RejectionReason.AlreadyResolved:
      return 'This item was already resolved.'
    default:
      return 'Nothing changed — the item had already moved on.'
  }
}

/**
 * Claim is deliberately NOT optimistic.
 *
 * It is a contended action: its outcome is unknown at click time, so drawing it
 * as "yours" before the server answers would state a fact that is not yet true.
 * If the person closed the tab in that instant they would leave believing
 * something false. Instead the button shows a pending state that asserts
 * nothing, and the response — which always carries the fresh row — settles it.
 *
 * Release is uncontended (only the holder can release) so it could be
 * optimistic; it is kept symmetrical here because the round trip is ~100ms and
 * two different behaviours on two adjacent buttons is its own kind of lie.
 */
export function useItemActions(workspaceId: string) {
  const queryClient = useQueryClient()
  const status = useQueueFilters((s) => s.status)
  const setNotice = useQueueFilters((s) => s.setNotice)

  const settle = (result: ActionResult) => {
    queryClient.setQueryData<QueueData>(queueKeys.list(workspaceId, status), (data) =>
      applyItemToCache(data, result.item, status),
    )
    setNotice(noticeFor(result))
  }

  const claim = useMutation({
    mutationFn: (itemId: string) => claimItem(workspaceId, itemId),
    onSuccess: settle,
    onError: () => setNotice('Could not reach the server. Nothing changed.'),
  })

  const release = useMutation({
    mutationFn: (itemId: string) => releaseItem(workspaceId, itemId),
    onSuccess: settle,
    onError: () => setNotice('Could not reach the server. Nothing changed.'),
  })

  return {
    claim,
    release,
    pendingItemId:
      (claim.isPending ? claim.variables : undefined) ??
      (release.isPending ? release.variables : undefined) ??
      null,
  }
}
