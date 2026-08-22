import 'server-only'

import { z } from 'zod'

/**
 * Validated once, at the boundary. Everything downstream can trust it.
 * A missing secret fails the build rather than the first request that needs it.
 */
const schema = z.object({
  /** Pooled (pgbouncer, 6543) — the runtime connection. */
  DATABASE_URL: z.string().min(1),
  /** Signs the session cookie. */
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  /** Guards the cron routes. */
  CRON_SECRET: z.string().min(1),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid environment:\n${missing.join('\n')}\n\nSee .env.example.`)
}

export const env = parsed.data
