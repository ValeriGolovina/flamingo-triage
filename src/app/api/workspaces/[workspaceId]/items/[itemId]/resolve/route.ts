import { after } from 'next/server'

import { toErrorResponse } from '@/server/lib/errors'
import { drainOutbox } from '@/server/notifications/service/outbox'
import { resolveItem } from '@/server/queue/service/claimService'
import { requireWorkspaceContext } from '@/server/workspace/service/workspaceContext'
import { ActionOutcome, Role } from '@/shared/model/domain'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; itemId: string }> },
) {
  try {
    const { workspaceId, itemId } = await params
    const ctx = await requireWorkspaceContext(workspaceId, Role.Member)
    const result = await resolveItem(ctx, itemId)

    if (result.outcome === ActionOutcome.Applied) {
      /**
       * The fast path, and only that. `after` runs once the response has been
       * sent, so the user never waits on a one-second call that fails one time
       * in five — but it is bounded by the function's max duration and dies
       * with it, so nothing here is the guarantee.
       *
       * It drains a batch rather than only the job just written: every resolve
       * therefore also retries whatever else is due, which is what keeps
       * delivery moving between cron runs.
       */
      after(async () => {
        try {
          await drainOutbox(10)
        } catch (error) {
          console.error('[outbox] fast-path drain failed', error)
        }
      })
    }

    return Response.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}
