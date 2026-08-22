'use client'

import { Spinner } from '@/shared/ui/Spinner'
import { ItemStatus, Role } from '@/shared/model/domain'
import type { QueueItem } from '@/shared/model/queue'

import { formatAge } from './helpers/formatAge'
import { StatusBadge } from './StatusBadge'

type Props = {
  item: QueueItem
  currentUserId: string
  role: Role
  isPending: boolean
  onClaim: (itemId: string) => void
  onRelease: (itemId: string) => void
  onResolve: (itemId: string) => void
}

/**
 * Every row answers "who holds this right now" without a click, and the action
 * area never shows a control that silently does nothing.
 */
export function QueueRow({
  item,
  currentUserId,
  role,
  isPending,
  onClaim,
  onRelease,
  onResolve,
}: Props) {
  const holder = item.status === ItemStatus.Resolved ? item.resolvedBy : item.claimedBy
  const isMine = item.claimedBy?.id === currentUserId
  const canAct = role !== Role.Viewer

  return (
    <div className="flex items-center gap-4 border-b border-zinc-100 px-4 py-2 hover:bg-zinc-50">
      <p className="min-w-0 flex-1 truncate text-sm text-zinc-800">{item.title}</p>

      <div className="w-20 shrink-0">
        <StatusBadge status={item.status} />
      </div>

      <p className="w-36 shrink-0 truncate text-sm text-zinc-600">
        {holder ? (
          <>
            {holder.name}
            {isMine && item.status === ItemStatus.Claimed ? (
              <span className="text-zinc-400"> (you)</span>
            ) : null}
          </>
        ) : (
          <span className="text-zinc-300" aria-label="Nobody">
            —
          </span>
        )}
      </p>

      <p
        className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-400"
        title={new Date(item.createdAt).toLocaleString()}
      >
        {formatAge(item.createdAt)}
      </p>

      <div className="flex w-40 shrink-0 justify-end gap-1">
        <Action />
      </div>
    </div>
  )

  function Action() {
    if (isPending) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-500">
          <Spinner />
          Working…
        </span>
      )
    }

    if (item.status === ItemStatus.Resolved) {
      return <span className="px-2 py-1 text-xs text-zinc-400">Done</span>
    }

    if (item.status === ItemStatus.Claimed) {
      // Somebody else holds it: state that plainly instead of offering a
      // button that would only fail.
      if (!isMine) {
        return (
          <span className="px-2 py-1 text-xs text-zinc-400" title={`Held by ${holder?.name}`}>
            Held
          </span>
        )
      }
      return (
        <>
          <button
            type="button"
            onClick={() => onRelease(item.id)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-white"
          >
            Release
          </button>
          <button
            type="button"
            onClick={() => onResolve(item.id)}
            className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
          >
            Resolve
          </button>
        </>
      )
    }

    // Open. A viewer sees the control disabled with the reason, rather than a
    // hidden one that makes the page look different for no visible cause.
    return (
      <button
        type="button"
        disabled={!canAct}
        title={canAct ? undefined : 'Viewers can read the queue but cannot claim'}
        onClick={() => onClaim(item.id)}
        className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        Claim
      </button>
    )
  }
}
