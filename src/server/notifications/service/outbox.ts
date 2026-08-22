import 'server-only'

import {
  MAX_ATTEMPTS,
  notificationJobRepository,
} from '../repository/notificationJobRepository'
import { notify } from './notify'

export type DrainReport = { attempted: number; sent: number; failed: number; dead: number }

/**
 * Delivers what the outbox owes.
 *
 * Called from two places, and the difference between them is the whole
 * guarantee: the cron route is what makes delivery eventually happen, and the
 * call right after a resolve is only a fast path. If the fast path dies with
 * the function, nothing is lost — the row is still there and still due.
 */
export async function drainOutbox(limit = 10): Promise<DrainReport> {
  const jobs = await notificationJobRepository.claimDue(limit)
  const report: DrainReport = { attempted: jobs.length, sent: 0, failed: 0, dead: 0 }

  await Promise.all(
    jobs.map(async (job) => {
      try {
        await notify({ itemId: job.item_id, workspaceId: job.workspace_id })
        await notificationJobRepository.markSent(job.id)
        report.sent++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await notificationJobRepository.markFailed(job.id, job.attempts, message)
        if (job.attempts >= MAX_ATTEMPTS) report.dead++
        else report.failed++
        // Logged, not swallowed: an outbox that fails quietly is the failure
        // mode R3 is written against.
        console.warn(`[outbox] job ${job.id} attempt ${job.attempts} failed: ${message}`)
      }
    }),
  )

  return report
}
