import { ErrorCode } from '@/shared/model/domain'

/** A failed request, carrying the code the server put in the body. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

const ERROR_CODES = new Set<string>(Object.values(ErrorCode))

/**
 * Errors are read from the body, never inferred from the status: a route can
 * add a code and get it rendered with no client change.
 *
 * The `catch` is not enough on its own — a literal `null` body makes
 * `res.json()` *resolve*, and indexing null throws a TypeError that would read
 * as an ordinary failure somewhere else entirely.
 */
export async function readErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const code =
    body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined

  return typeof code === 'string' && ERROR_CODES.has(code) ? (code as ErrorCode) : ErrorCode.Unknown
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
  })

  if (!response.ok) throw new ApiError(await readErrorCode(response), response.status)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
