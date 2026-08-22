'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { ActionOutcome, RejectionReason } from '@/shared/model/domain'
import type { ActionResult } from '@/shared/model/queue'
import { useCurrentWorkspaceStore } from '@/client/shared/workspace/store'

import { claimItem, releaseItem, resolveItem } from '../api/actions'
import { useQueueFilters } from '../store/queueFilters'
import { applyItemToCache, type QueueData } from './helpers/queueCache'
import { queueKeys } from './useQueue'

/** What the user is told when the world moved before their click landed. */
function noticeFor(result: ActionResult): string | null {
  if (result.outcome === ActionOutcome.Applied) {
    // R5: the claim had lapsed and the sweep put the item back, but the work was
    // done — say so rather than letting it look like the ordinary path.
    return result.resolvedWithoutClaim
      ? 'Resolved — you were not holding this item, so the claim had already expired.'
      : null
  }

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
 * Release and resolve are uncontended (only the holder reaches them) so they
 * could be optimistic; they are kept symmetrical because the round trip is
 * short and two different behaviours on two adjacent buttons is its own lie.
 */
export function useItemActions() {
  const queryClient = useQueryClient()
  const workspaceId = useCurrentWorkspaceStore((s) => s.workspaceId)
  const status = useQueueFilters((s) => s.status)
  const setNotice = useQueueFilters((s) => s.setNotice)

  /**
   * A set, not the mutation's own `variables`: those hold only the most recent
   * call, so clicking a second row would drop the first row's pending state
   * while its request was still in flight — showing an idle button for work
   * that had not finished.
   */
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())

  const begin = useCallback((itemId: string) => {
    setPending((current) => new Set(current).add(itemId))
  }, [])

  const finish = useCallback((itemId: string) => {
    setPending((current) => {
      const next = new Set(current)
      next.delete(itemId)
      return next
    })
  }, [])

  const settle = (result: ActionResult) => {
    queryClient.setQueryData<QueueData>(queueKeys.list(workspaceId, status), (data) =>
      applyItemToCache(data, result.item, status),
    )
    setNotice(noticeFor(result))
  }

  const options = {
    onMutate: begin,
    onSuccess: settle,
    onError: () => setNotice('Could not reach the server. Nothing changed.'),
    onSettled: (_data: unknown, _error: unknown, itemId: string) => finish(itemId),
  }

  const claim = useMutation({
    mutationFn: (itemId: string) => claimItem(workspaceId as string, itemId),
    ...options,
  })
  const release = useMutation({
    mutationFn: (itemId: string) => releaseItem(workspaceId as string, itemId),
    ...options,
  })
  const resolve = useMutation({
    mutationFn: (itemId: string) => resolveItem(workspaceId as string, itemId),
    ...options,
  })

  return {
    claim: claim.mutate,
    release: release.mutate,
    resolve: resolve.mutate,
    isPending: useCallback((itemId: string) => pending.has(itemId), [pending]),
  }
}
