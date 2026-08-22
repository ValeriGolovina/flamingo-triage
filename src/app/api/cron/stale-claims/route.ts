import { cronErrorResponse, requireCronRequest } from '@/server/lib/system'
import { sweepExpiredClaims } from '@/server/queue/service/sweepService'

/**
 * R5. There is no daemon on Vercel, so the scheduler runs the sweep.
 *
 * Anyone holding the cron secret can also run it by hand, which is how it is
 * demonstrated locally:
 *   curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/stale-claims
 */
export async function GET(request: Request) {
  try {
    const system = requireCronRequest(request)
    const report = await sweepExpiredClaims(system)
    console.info('[cron] stale claims swept', report)
    return Response.json(report)
  } catch (error) {
    const denied = cronErrorResponse(error)
    if (denied) return denied
    console.error('[cron] sweep failed', error)
    return Response.json({ error: 'unknown' }, { status: 500 })
  }
}
