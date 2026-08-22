import 'server-only'

import { getSession } from '@/server/auth/service/session'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/server/lib/errors'
import { roleAtLeast, type Role } from '@/shared/model/domain'

import type { WorkspaceContext } from '../model/context'
import { membershipRepository } from '../repository/membershipRepository'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The single authorization choke point (R2).
 *
 * It lives in the service layer because that is the only layer that knows both
 * who the caller is and how to reach the database. Checking earlier — in
 * `proxy.ts` — is impossible in principle: nothing outside the database knows
 * which workspace an item id belongs to. Next's own docs agree that proxy
 * "should not be used as a full session management or authorization solution".
 *
 * The attack this exists for is the confused deputy: a caller's own legitimate
 * workspaceId combined with a foreign itemId. A membership check alone passes
 * that, because the two halves are never compared to each other. Here they
 * arrive together, and every repository call carries both.
 */
export async function requireWorkspaceContext(
  workspaceId: string,
  minRole: Role,
): Promise<WorkspaceContext> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()

  // A malformed id is "not found", not a database error. Without this,
  // `curl /api/workspaces/garbage/items` becomes a 500 with a stack trace.
  if (!UUID.test(workspaceId)) throw new NotFoundError()

  const membership = await membershipRepository.find(session.userId, workspaceId)

  // Not a member: 404, never 403. A 403 would confirm the workspace exists.
  if (!membership) throw new NotFoundError()

  // Inside your own workspace, existence is no longer a secret — so a viewer
  // who cannot act gets 403, which is the honest answer and lets the UI say why.
  if (!roleAtLeast(membership.role as Role, minRole)) throw new ForbiddenError()

  // The one cast in the codebase. Everything above it is the proof it stands for.
  return { userId: session.userId, workspaceId, role: membership.role as Role } as WorkspaceContext
}
