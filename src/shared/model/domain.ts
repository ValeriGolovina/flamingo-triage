/**
 * Value sets that cross a boundary (the wire, or the database) are enums, so
 * there is one source of truth for them.
 *
 * These are declared here rather than re-exported from the generated Prisma
 * client on purpose: `src/shared` is imported by client code, and pulling the
 * Prisma client into the browser bundle would break the client/server split.
 * `src/server/lib/enumsInSync.ts` fails the build if the two ever drift.
 */

export enum Role {
  Owner = 'owner',
  Member = 'member',
  Viewer = 'viewer',
}

export enum ItemStatus {
  Open = 'open',
  Claimed = 'claimed',
  Resolved = 'resolved',
}

/** Ordered from least to most privileged. Index = rank. */
const ROLE_RANK: readonly Role[] = [Role.Viewer, Role.Member, Role.Owner]

export function roleAtLeast(actual: Role, required: Role): boolean {
  return ROLE_RANK.indexOf(actual) >= ROLE_RANK.indexOf(required)
}

/**
 * Losing a race is a normal result, not an exception. The response carries the
 * fresh row, so the UI can name who won instead of showing a generic conflict —
 * and so the loser learns the truth from their own request rather than waiting
 * for the next poll.
 */
export enum ActionOutcome {
  Applied = 'applied',
  Rejected = 'rejected',
}

export enum RejectionReason {
  /** Someone else got there first. `item.claimedBy` says who. */
  AlreadyClaimed = 'already_claimed',
  /** You are not the holder — released or swept out from under you. */
  NotHeldByYou = 'not_held_by_you',
  /** Already resolved; there is nothing left to do. */
  AlreadyResolved = 'already_resolved',
}

/** Every code the API can put on the wire. Clients read the body, not the status. */
export enum ErrorCode {
  Unauthorized = 'unauthorized',
  Forbidden = 'forbidden',
  NotFound = 'not_found',
  InvalidRequest = 'invalid_request',
  Unknown = 'unknown',
}
