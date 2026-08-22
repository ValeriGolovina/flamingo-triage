'use client'

import { ItemStatus } from '@/shared/model/domain'
import type { QueueItem } from '@/shared/model/queue'

import { formatAge } from './helpers/formatAge'
import { StatusBadge } from './StatusBadge'

/**
 * Every row answers "who holds this right now" without a click. That is the
 * question the brief asks of the interface, so it is a column, not a tooltip.
 */
export function QueueRow({ item }: { item: QueueItem }) {
  const holder =
    item.status === ItemStatus.Resolved ? item.resolvedBy : item.claimedBy

  return (
    <div className="flex items-center gap-4 border-b border-zinc-100 px-4 py-2 hover:bg-zinc-50">
      <p className="min-w-0 flex-1 truncate text-sm text-zinc-800">{item.title}</p>

      <div className="w-20 shrink-0">
        <StatusBadge status={item.status} />
      </div>

      <p className="w-36 shrink-0 truncate text-sm text-zinc-600">
        {holder ? (
          holder.name
        ) : (
          <span className="text-zinc-300" aria-label="Nobody">
            —
          </span>
        )}
      </p>

      <p
        className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-400"
        title={new Date(item.createdAt).toLocaleString()}
      >
        {formatAge(item.createdAt)}
      </p>
    </div>
  )
}
