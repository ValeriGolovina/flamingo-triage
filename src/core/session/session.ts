import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

import { env } from '@/core/config/env'

/**
 * Not real authentication — the brief asks for a dropdown of seeded users and
 * a signed cookie, and that is exactly what this is.
 *
 * The signature is what matters: the cookie carries a user id in the clear, so
 * without an HMAC anyone could become anyone by editing it. Verification is
 * constant-time so the check cannot be probed byte by byte.
 */
const COOKIE_NAME = 'triage_session'

export type Session = { userId: string }

function sign(userId: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(userId).digest('base64url')
}

function signaturesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  // timingSafeEqual throws on a length mismatch, so check length first —
  // length is not a secret here, the signature is.
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value
  if (!raw) return null

  const separator = raw.lastIndexOf('.')
  if (separator <= 0) return null

  const userId = raw.slice(0, separator)
  if (!signaturesMatch(raw.slice(separator + 1), sign(userId))) return null

  return { userId }
}

export async function setSession(userId: string): Promise<void> {
  ;(await cookies()).set(COOKIE_NAME, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearSession(): Promise<void> {
  ;(await cookies()).delete(COOKIE_NAME)
}
