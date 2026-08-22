import { env } from '@/core/config/env'
import { drainOutbox } from '@/server/notifications/service/outbox'

/**
 * The guarantee behind R3. The fast path after a resolve is best-effort; this
 * is what makes delivery eventually happen regardless of whether anyone is
 * using the app.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
 * The route is otherwise public, so the secret is the entire authentication —
 * a timing-safe compare is not warranted for a constant-length bearer token
 * compared once per invocation, but rejecting early is.
 */
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const report = await drainOutbox(50)
  console.info('[cron] outbox drained', report)
  return Response.json(report)
}
