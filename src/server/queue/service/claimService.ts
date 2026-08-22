import 'server-only'

import { NotFoundError } from '@/server/lib/errors'
import type { WorkspaceContext } from '@/server/workspace/model/context'
import { ActionOutcome, ItemStatus, RejectionReason } from '@/shared/model/domain'
import type { ActionResult } from '@/shared/model/queue'

import { withTransaction } from '@/server/lib/db'
import { notificationJobRepository } from '@/server/notifications/repository/notificationJobRepository'

import { itemMutations, itemRepository, resolveItemRow } from '../repository/itemRepository'

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

/**
 * R3. Resolving must not wait on notify(), nothing may disappear silently, and
 * no process survives the response — so the resolve and the *intent* to notify
 * are committed together, and delivery happens somewhere else entirely.
 *
 * The guarantee this builds is **at-least-once with a visible record**. Not
 * exactly-once: if notify() succeeds but the process dies before the job is
 * marked sent, the next drain sends it again. That is the honest name for it,
 * and naming it honestly is worth more than pretending otherwise.
 *
 * Firing notify() without awaiting it would satisfy "must not wait" and fail
 * "nothing disappears silently" — a rejected promise on a dying serverless
 * function tells nobody anything.
 */
export async function resolveItem(ctx: WorkspaceContext, itemId: string): Promise<ActionResult> {
  const resolved = await withTransaction(async (tx) => {
    const item = await resolveItemRow(tx, ctx, itemId)
    if (!item) return null

    await notificationJobRepository.enqueue(tx, {
      itemId: item.id,
      workspaceId: ctx.workspaceId,
    })
    return item
  })

  if (resolved) {
    return {
      outcome: ActionOutcome.Applied,
      item: resolved,
      // No claim on the row means it was resolved straight from `open`.
      resolvedWithoutClaim: resolved.claimedAt === null,
    }
  }

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
