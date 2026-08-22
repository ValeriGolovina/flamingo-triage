import 'server-only'

import { NotFoundError } from '@/server/lib/errors'
import type { WorkspaceContext } from '@/server/workspace/model/context'
import { ActionOutcome, ItemStatus, RejectionReason } from '@/shared/model/domain'
import type { ActionResult } from '@/shared/model/queue'

import { itemMutations, itemRepository } from '../repository/itemRepository'

/**
 * R1. Exactly one caller wins, and the other learns who has it.
 *
 * The winner is decided entirely by the conditional UPDATE. The follow-up read
 * happens only on the losing path, and only to answer "why" — a zero-row update
 * is ambiguous between "somebody else was first", "already resolved" and "no
 * such item here", and the interface has to say something different for each.
 * Reading afterwards cannot reintroduce the race: the decision is already made
 * and durable by then.
 */
export async function claimItem(ctx: WorkspaceContext, itemId: string): Promise<ActionResult> {
  const claimed = await itemMutations.claim(ctx, itemId)
  if (claimed) return { outcome: ActionOutcome.Applied, item: claimed }

  const current = await itemRepository.findById(ctx, itemId)
  // Scoped read: a foreign or missing item is indistinguishable, and both are 404.
  if (!current) throw new NotFoundError()

  return {
    outcome: ActionOutcome.Rejected,
    item: current,
    reason:
      current.status === ItemStatus.Resolved
        ? RejectionReason.AlreadyResolved
        : RejectionReason.AlreadyClaimed,
  }
}

/** Only the holder may release. Anything else is a rejection carrying the truth. */
export async function releaseItem(ctx: WorkspaceContext, itemId: string): Promise<ActionResult> {
  const released = await itemMutations.release(ctx, itemId)
  if (released) return { outcome: ActionOutcome.Applied, item: released }

  const current = await itemRepository.findById(ctx, itemId)
  if (!current) throw new NotFoundError()

  return {
    outcome: ActionOutcome.Rejected,
    item: current,
    reason:
      current.status === ItemStatus.Resolved
        ? RejectionReason.AlreadyResolved
        : RejectionReason.NotHeldByYou,
  }
}
