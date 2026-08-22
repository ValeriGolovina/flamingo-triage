import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { cookies } from 'next/headers'

import { env } from '@/server/lib/env'

/**
 * Not real authentication — the brief asks for a dropdown of seeded users and
 * a signed cookie, and that is exactly what this is.
 *
 * Two things still matter. The signature: the cookie carries a user id in the
 * clear, so without an HMAC anyone could become anyone by editing it, and it is
 * compared in constant time so it cannot be probed byte by byte. And the issue
 * time, which is signed alongside the id and checked here: without it a cookie
 * captured once would authenticate forever, and the browser-side `maxAge` is a
 * hint the server never sees.
 */
const COOKIE_NAME = 'triage_session'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type Session = { userId: string }

function sign(payload: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url')
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

  // `userId.issuedAt.signature` — the id is a UUID and the signature is
  // base64url, so neither contains a dot; splitting from the right is exact.
  const signatureAt = raw.lastIndexOf('.')
  if (signatureAt <= 0) return null

  const payload = raw.slice(0, signatureAt)
  if (!signaturesMatch(raw.slice(signatureAt + 1), sign(payload))) return null

  const issuedAtAt = payload.lastIndexOf('.')
  if (issuedAtAt <= 0) return null

  const issuedAt = Number(payload.slice(issuedAtAt + 1))
  if (!Number.isFinite(issuedAt)) return null
  // A signed but expired cookie is not a session. Signed in the future is not
  // one either — that is a clock problem or a forged payload, not a login.
  if (Date.now() - issuedAt > MAX_AGE_MS || issuedAt > Date.now()) return null

  return { userId: payload.slice(0, issuedAtAt) }
}

export async function setSession(userId: string): Promise<void> {
  const payload = `${userId}.${Date.now()}`
  ;(await cookies()).set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_MS / 1000,
  })
}

export async function clearSession(): Promise<void> {
  ;(await cookies()).delete(COOKIE_NAME)
}
