import { cronRoute } from '@/server/lib/system'
import { sweepExpiredClaims } from '@/server/queue/service/sweepService'

/**
 * R5. There is no daemon on Vercel, so the scheduler runs the sweep.
 *
 * Anyone holding the cron secret can also run it by hand, which is how it is
 * demonstrated locally:
 *   curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/stale-claims
 */
export const GET = cronRoute('stale claims swept', sweepExpiredClaims)
