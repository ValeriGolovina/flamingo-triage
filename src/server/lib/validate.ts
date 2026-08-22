import 'server-only'

import type { z } from 'zod'

import { InvalidRequestError } from './errors'

/** Validation happens at the boundary and nowhere else. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new InvalidRequestError()
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new InvalidRequestError()
  return parsed.data
}

export function parseSearchParams<T extends z.ZodType>(request: Request, schema: T): z.infer<T> {
  const url = new URL(request.url)
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) throw new InvalidRequestError()
  return parsed.data
}
