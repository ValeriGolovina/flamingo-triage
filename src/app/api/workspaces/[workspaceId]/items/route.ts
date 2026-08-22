import { toErrorResponse } from '@/server/lib/errors'
import { parseSearchParams } from '@/server/lib/validate'
import { queueQuerySchema } from '@/server/queue/model/queries'
import { getQueuePage } from '@/server/queue/service/queueService'
import { requireWorkspaceContext } from '@/server/workspace/service/workspaceContext'
import { Role } from '@/shared/model/domain'

/**
 * The queue.
 *
 * `workspaceId` is a path parameter rather than an "active workspace" cookie so
 * the guard receives both halves of the question explicitly, and so a second
 * tab switching workspaces cannot change what this request means.
 *
 * Reading requires Viewer — the lowest role — which is what makes a viewer a
 * viewer rather than a stranger.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params
    const ctx = await requireWorkspaceContext(workspaceId, Role.Viewer)
    const query = parseSearchParams(request, queueQuerySchema)

    return Response.json(await getQueuePage(ctx, query))
  } catch (error) {
    return toErrorResponse(error)
  }
}
