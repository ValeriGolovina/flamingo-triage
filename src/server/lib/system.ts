import 'server-only'

import { env } from '@/server/lib/env'
import { ErrorCode } from '@/shared/model/domain'

declare const systemContextBrand: unique symbol

/**
 * Proof that a request came from the scheduler and not from a person.
 *
 * The stale-claim sweep and the outbox drain both have to work across every
 * workspace, which is exactly the shape R2 spends its effort forbidding. Rather
 * than letting those queries take no context at all — a quiet hole beside a
 * carefully guarded door — they take this one, and it can only be produced by
 * checking the cron secret. The invariant holds either way: no unscoped query
 * without proof of who is asking.
 */
export type SystemContext = {
  readonly [systemContextBrand]: true
}

/**
 * Wraps a scheduled route so the proof arrives as an argument.
 *
 * The workspace guard is impossible to forget because the types demand it; this
 * puts cron routes on the same footing. A handler cannot run without a
 * SystemContext, a SystemContext cannot exist without the secret, and the error
 * mapping is here rather than copied into each route.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
 */
export function cronRoute<T>(
  name: string,
  handler: (system: SystemContext) => Promise<T>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
      return Response.json({ error: ErrorCode.Unauthorized }, { status: 401 })
    }

    try {
      const report = await handler({} as SystemContext)
      console.info(`[cron] ${name}`, report)
      return Response.json(report)
    } catch (error) {
      // The only other symptom of a broken scheduled job is silence.
      console.error(`[cron] ${name} failed`, error)
      return Response.json({ error: ErrorCode.Unknown }, { status: 500 })
    }
  }
}
