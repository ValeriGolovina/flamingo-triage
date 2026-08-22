import 'server-only'

import { ErrorCode } from '@/shared/model/domain'

/**
 * Errors carry the wire code they become, so a route never has to guess a
 * status from an exception type.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
  ) {
    super(code)
    this.name = new.target.name
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super(ErrorCode.Unauthorized, 401)
  }
}

/**
 * Used for a resource in another workspace as well as one that does not exist.
 *
 * That is deliberate: answering 403 for a foreign item would confirm the item
 * exists, which is itself a leak. 403 is reserved for the case where existence
 * is already known to the caller — a viewer acting inside their own workspace.
 */
export class NotFoundError extends AppError {
  constructor() {
    super(ErrorCode.NotFound, 404)
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super(ErrorCode.Forbidden, 403)
  }
}

export class InvalidRequestError extends AppError {
  constructor() {
    super(ErrorCode.InvalidRequest, 400)
  }
}

/** The single place an exception becomes an HTTP response. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.code }, { status: error.status })
  }

  // An unexpected failure is ours, not the caller's. Log it — the only other
  // symptom is a toast on somebody's screen.
  console.error('[api] unhandled error', error)
  return Response.json({ error: ErrorCode.Unknown }, { status: 500 })
}
