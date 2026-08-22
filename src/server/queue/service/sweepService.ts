import 'server-only'

import type { SystemContext } from '@/server/lib/system'

import { sweepStaleClaims } from '../repository/itemRepository'

/**
 * A claim older than this is treated as abandoned. Thirty minutes comes from
 * the brief; the number lives here rather than inline so the sweep and the
 * copy that explains it cannot drift apart.
 */
export const STALE_AFTER_MINUTES = 30

/** Bounded so one run cannot turn into an unbounded write on a bad day. */
const SWEEP_LIMIT = 500

export type SweepReport = { released: number; workspaces: number }

export async function sweepExpiredClaims(system: SystemContext): Promise<SweepReport> {
  const swept = await sweepStaleClaims(system, STALE_AFTER_MINUTES, SWEEP_LIMIT)

  return {
    released: swept.length,
    workspaces: new Set(swept.map((row) => row.workspace_id)).size,
  }
}
