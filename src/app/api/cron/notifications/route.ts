import { cronErrorResponse, requireCronRequest } from '@/server/lib/system'
import { drainOutbox } from '@/server/notifications/service/outbox'

/**
 * The guarantee behind R3. The fast path after a resolve is best-effort; this
 * is what makes delivery eventually happen regardless of whether anyone is
 * using the app.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
 */
export async function GET(request: Request) {
  try {
    requireCronRequest(request)
    const report = await drainOutbox(50)
    console.info('[cron] outbox drained', report)
    return Response.json(report)
  } catch (error) {
    const denied = cronErrorResponse(error)
    if (denied) return denied
    console.error('[cron] drain failed', error)
    return Response.json({ error: 'unknown' }, { status: 500 })
  }
}
