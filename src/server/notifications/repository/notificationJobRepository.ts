import 'server-only'

import { prisma } from '@/server/lib/prisma'
import type { Executor } from '@/server/lib/db'

export type DueJob = {
  id: string
  item_id: string
  workspace_id: string
  attempts: number
}

/** Give up after this many failed deliveries and leave a visible dead record. */
export const MAX_ATTEMPTS = 5

export const notificationJobRepository = {
  /**
   * Written inside the caller's transaction, alongside the resolve. That is the
   * whole point of the outbox: the intent to notify becomes durable at the same
   * instant the resolve does, or neither happens.
   */
  async enqueue(db: Executor, job: { itemId: string; workspaceId: string }): Promise<void> {
    await db.$executeRaw`
      insert into notification_jobs (item_id, workspace_id)
      values (${job.itemId}::uuid, ${job.workspaceId}::uuid)
    `
  },

  /**
   * Takes ownership of up to `limit` due jobs.
   *
   * `for update skip locked` is what makes two overlapping drains safe — the
   * same race as R1, in a different place: without it, two cron runs (or a cron
   * run overlapping the fast path) would both pick up the same job and notify
   * twice for no reason.
   *
   * Attempts and the next backoff are written *before* the delivery is tried.
   * If the process dies mid-attempt the job comes back later instead of being
   * stuck as in-flight forever — which is the deliberate choice of at-least-once
   * over at-most-once.
   */
  async claimDue(limit: number): Promise<DueJob[]> {
    return prisma.$queryRaw<DueJob[]>`
      with due as (
        select id, attempts
          from notification_jobs
         where status = 'pending'
           and next_attempt_at <= now()
         order by next_attempt_at
         limit ${limit}
           for update skip locked
      )
      update notification_jobs j
         set attempts = due.attempts + 1,
             next_attempt_at = now() + (interval '1 minute' * power(2, due.attempts))
        from due
       where j.id = due.id
      returning j.id, j.item_id, j.workspace_id, j.attempts
    `
  },

  async markSent(jobId: string): Promise<void> {
    await prisma.$executeRaw`
      update notification_jobs
         set status = 'sent', sent_at = now(), last_error = null
       where id = ${jobId}::uuid
    `
  },

  /**
   * A failure with attempts left. Only the reason changes — the job is already
   * pending and its next attempt time was set when it was claimed.
   */
  async recordFailure(jobId: string, error: string): Promise<void> {
    await prisma.$executeRaw`
      update notification_jobs
         set last_error = ${error.slice(0, 500)}
       where id = ${jobId}::uuid
    `
  },

  /** Out of attempts. Keeps the reason — a dead job that says nothing is a silent failure. */
  async markDead(jobId: string, error: string): Promise<void> {
    await prisma.$executeRaw`
      update notification_jobs
         set status = 'dead', last_error = ${error.slice(0, 500)}
       where id = ${jobId}::uuid
    `
  },

  /** Counts for the workspace, so failures are visible instead of buried. */
  async summarize(workspaceId: string): Promise<{ pending: number; dead: number }> {
    const rows = await prisma.$queryRaw<Array<{ status: string; n: number }>>`
      select status::text, count(*)::int as n
        from notification_jobs
       where workspace_id = ${workspaceId}::uuid
         and status <> 'sent'
       group by status
    `
    return {
      pending: rows.find((r) => r.status === 'pending')?.n ?? 0,
      dead: rows.find((r) => r.status === 'dead')?.n ?? 0,
    }
  },
}
