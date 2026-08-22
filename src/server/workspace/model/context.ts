import 'server-only'

import type { Role } from '@/shared/model/domain'

declare const workspaceContextBrand: unique symbol

/**
 * Proof that the caller's access to this workspace has been checked.
 *
 * The brand cannot be produced by writing an object literal, so no repository
 * call can be made without going through `requireWorkspaceContext` first —
 * forgetting the check is a compile error rather than a review miss.
 *
 * To be precise about what this does and does not buy: it prevents the mistake,
 * not the malice. A deliberate `as WorkspaceContext` cast would still compile —
 * but there is exactly one such cast in the codebase, inside the guard, and a
 * second one would be glaring in a diff.
 */
export type WorkspaceContext = {
  readonly userId: string
  readonly workspaceId: string
  readonly role: Role
  readonly [workspaceContextBrand]: true
}
