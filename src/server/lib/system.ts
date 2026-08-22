import 'server-only'

import { env } from '@/server/lib/env'

declare const systemContextBrand: unique symbol

/**
 * Proof that a request came from the scheduler and not from a person.
 *
 * The sweep in R5 and the outbox drain in R3 both have to work across every
 * workspace, which is exactly the shape R2 spends its effort forbidding. Rather
 * than letting those queries take no context at all — a quiet hole beside a
 * carefully guarded door — they take this one, and it can only be produced by
 * checking the cron secret. The invariant stays intact: no unscoped query
 * without proof of who is asking.
 */
export type SystemContext = {
  readonly [systemContextBrand]: true
}

export class CronUnauthorizedError extends Error {}

export function requireCronRequest(request: Request): SystemContext {
  const expected = `Bearer ${env.CRON_SECRET}`
  if (request.headers.get('authorization') !== expected) throw new CronUnauthorizedError()
  return {} as SystemContext
}

export function cronErrorResponse(error: unknown): Response | null {
  if (error instanceof CronUnauthorizedError) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}
