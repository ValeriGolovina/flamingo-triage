import { toErrorResponse } from '@/server/lib/errors'
import { claimItem } from '@/server/queue/service/claimService'
import { requireWorkspaceContext } from '@/server/workspace/service/workspaceContext'
import { Role } from '@/shared/model/domain'

/**
 * Losing the race is a 200, not a 409: the request was valid and authorized,
 * and the body carries the outcome plus the fresh row. Statuses describe what
 * happened to the request; the body describes what happened in the world.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; itemId: string }> },
) {
  try {
    const { workspaceId, itemId } = await params
    // Member, not Viewer — a viewer reads but cannot claim.
    const ctx = await requireWorkspaceContext(workspaceId, Role.Member)
    return Response.json(await claimItem(ctx, itemId))
  } catch (error) {
    return toErrorResponse(error)
  }
}
