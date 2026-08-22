import 'server-only'

import type { SystemContext } from '@/server/lib/system'
import type { WorkspaceContext } from '@/server/workspace/model/context'

import {
  MAX_ATTEMPTS,
  notificationJobRepository,
  type DueJob,
} from '../repository/notificationJobRepository'
import { notify } from './notify'

export type DrainReport = { attempted: number; sent: number; failed: number; dead: number }

async function deliver(jobs: DueJob[]): Promise<DrainReport> {
  const report: DrainReport = { attempted: jobs.length, sent: 0, failed: 0, dead: 0 }

  await Promise.all(
    jobs.map(async (job) => {
      try {
        await notify({ itemId: job.item_id, workspaceId: job.workspace_id })
        await notificationJobRepository.markSent(job.id)
        report.sent++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // `job.attempts` is the post-increment value returned when the job was
        // claimed, so reaching MAX_ATTEMPTS means this attempt was the last one.
        if (job.attempts >= MAX_ATTEMPTS) {
          await notificationJobRepository.markDead(job.id, message)
          report.dead++
        } else {
          await notificationJobRepository.recordFailure(job.id, message)
          report.failed++
        }
        // Logged, not swallowed: an outbox that fails quietly is the failure
        // mode R3 is written against.
        console.warn(`[outbox] job ${job.id} attempt ${job.attempts} failed: ${message}`)
      }
    }),
  )

  return report
}

/**
 * Everything the outbox owes, across every workspace. This is the guarantee
 * behind R3 — it is what makes delivery eventually happen whether or not anyone
 * is using the app — and it is why it demands system proof: the query is
 * deliberately unscoped.
 */
export async function drainOutbox(system: SystemContext, limit = 50): Promise<DrainReport> {
  return deliver(await notificationJobRepository.claimDue(system, limit))
}

/**
 * The fast path, run after a resolve so the user does not wait on a call that
 * sleeps a second and fails one time in five.
 *
 * Scoped to the caller's workspace. It could reach across all of them and
 * deliver more, but then one member's resolve would be doing unrelated
 * workspaces' work on their request — and it would be an unscoped query with no
 * proof behind it, which is the thing SystemContext exists to prevent.
 *
 * Nothing depends on this running: it dies with the function, and the row is
 * still there and still due.
 */
export async function drainWorkspaceOutbox(
  ctx: WorkspaceContext,
  limit = 10,
): Promise<DrainReport> {
  return deliver(await notificationJobRepository.claimDueForWorkspace(ctx, limit))
}
