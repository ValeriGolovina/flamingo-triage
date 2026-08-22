import 'server-only'

import type { SystemContext } from '@/server/lib/system'

import { countStaleClaims, sweepStaleClaims } from '../repository/itemRepository'

/**
 * A claim older than this is treated as abandoned. Thirty minutes comes from
 * the brief; the number lives here rather than inline so the sweep and the
 * copy that explains it cannot drift apart.
 */
export const STALE_AFTER_MINUTES = 30

/** Bounded so one run cannot turn into an unbounded write on a bad day. */
const SWEEP_LIMIT = 500

export type SweepReport = {
  released: number
  workspaces: number
  /** Still expired after this run. Non-zero means the batch limit was the binding constraint. */
  outstanding: number
}

export async function sweepExpiredClaims(system: SystemContext): Promise<SweepReport> {
  const swept = await sweepStaleClaims(system, STALE_AFTER_MINUTES, SWEEP_LIMIT)
  const outstanding = await countStaleClaims(system, STALE_AFTER_MINUTES)

  if (outstanding > 0) {
    // Falling behind must be visible, not inferred. A run that hits the limit
    // and says nothing looks identical to one that had nothing left to do.
    console.warn(
      `[sweep] released ${swept.length} (limit ${SWEEP_LIMIT}), ${outstanding} still expired`,
    )
  }

  return {
    released: swept.length,
    workspaces: new Set(swept.map((row) => row.workspace_id)).size,
    outstanding,
  }
}
