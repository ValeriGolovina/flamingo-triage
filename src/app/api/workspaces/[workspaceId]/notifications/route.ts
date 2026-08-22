import { toErrorResponse } from '@/server/lib/errors'
import { notificationJobRepository } from '@/server/notifications/repository/notificationJobRepository'
import { requireWorkspaceContext } from '@/server/workspace/service/workspaceContext'
import { Role } from '@/shared/model/domain'

/**
 * What the outbox still owes, and what it gave up on.
 *
 * This exists so "nothing disappears silently" is something a user can see, not
 * just a row in a table they have no access to.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params
    const ctx = await requireWorkspaceContext(workspaceId, Role.Viewer)
    return Response.json(await notificationJobRepository.summarize(ctx.workspaceId))
  } catch (error) {
    return toErrorResponse(error)
  }
}
