import { toErrorResponse } from '@/server/lib/errors'
import { releaseItem } from '@/server/queue/service/claimService'
import { requireWorkspaceContext } from '@/server/workspace/service/workspaceContext'
import { Role } from '@/shared/model/domain'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; itemId: string }> },
) {
  try {
    const { workspaceId, itemId } = await params
    const ctx = await requireWorkspaceContext(workspaceId, Role.Member)
    return Response.json(await releaseItem(ctx, itemId))
  } catch (error) {
    return toErrorResponse(error)
  }
}
