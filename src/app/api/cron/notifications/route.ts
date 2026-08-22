import { cronRoute } from '@/server/lib/system'
import { drainOutbox } from '@/server/notifications/service/outbox'

/**
 * The guarantee behind R3. The fast path after a resolve is best-effort; this
 * is what makes delivery eventually happen regardless of whether anyone is
 * using the app.
 */
export const GET = cronRoute('outbox drained', (system) => drainOutbox(system, 50))
