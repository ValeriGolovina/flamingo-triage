import { describe, expect, it } from 'vitest'

import { ErrorCode } from '@/shared/model/domain'

import { readErrorCode } from './http'

const response = (body: string, contentType = 'application/json') =>
  new Response(body, { status: 400, headers: { 'content-type': contentType } })

/**
 * Errors are read from the body rather than inferred from the status, so this
 * is the function that decides what the user is told when something fails.
 * The `null` case is the trap it exists for: `res.json()` resolves on a
 * literal `null` body, so a plain `.catch()` never fires and indexing the
 * result throws a TypeError that surfaces as an unrelated failure.
 */
describe('readErrorCode', () => {
  it('reads a known code from the envelope', async () => {
    expect(await readErrorCode(response('{"error":"not_found"}'))).toBe(ErrorCode.NotFound)
  })

  it('falls back to unknown for a code it does not recognise', async () => {
    expect(await readErrorCode(response('{"error":"teapot"}'))).toBe(ErrorCode.Unknown)
  })

  it('survives a literal null body', async () => {
    expect(await readErrorCode(response('null'))).toBe(ErrorCode.Unknown)
  })

  it('survives a body that is not JSON at all', async () => {
    expect(await readErrorCode(response('<html>502 Bad Gateway</html>', 'text/html'))).toBe(
      ErrorCode.Unknown,
    )
  })

  it('survives an empty body', async () => {
    expect(await readErrorCode(response(''))).toBe(ErrorCode.Unknown)
  })

  it('refuses a non-string error field', async () => {
    expect(await readErrorCode(response('{"error":{"code":"not_found"}}'))).toBe(ErrorCode.Unknown)
  })
})
