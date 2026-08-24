'use client'

import { memo } from 'react'

import { ItemStatus, Role } from '@/shared/model/domain'
import type { Actor, QueueItem } from '@/shared/model/queue'
import { Spinner } from '@/client/shared/ui/Spinner'

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
 * Declared at module scope, not inside QueueRow.
 *
 * A component defined inside another component gets a new identity on every
 * render, so React unmounts and remounts it rather than updating it. On a list
 * that polls every couple of seconds that means the buttons are destroyed and
 * rebuilt continuously — anyone who had tabbed to Resolve loses focus, and
 * hover state resets, twice a second.
 */
function RowAction({
  item,
  isMine,
  canAct,
  isPending,
  onClaim,
  onRelease,
  onResolve,
}: {
  item: QueueItem
  isMine: boolean
  canAct: boolean
  isPending: boolean
  onClaim: (itemId: string) => void
  onRelease: (itemId: string) => void
  onResolve: (itemId: string) => void
}) {
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
    // Somebody else holds it: say so plainly instead of offering a button that
    // would only fail.
    if (!isMine) {
      return (
        <span className="px-2 py-1 text-xs text-zinc-400" title={`Held by ${item.claimedBy?.name}`}>
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

/**
 * Every row answers "who holds this right now" without a click.
 *
 * Memoised because the list polls: without it every row re-renders on each
 * tick even when the server returned exactly the same rows. Every prop is
 * stable across a tick — `item` is React Query's cached reference, the handlers
 * are TanStack mutate functions, and `isPending` is a plain boolean — so the
 * comparison is cheap and almost always says "nothing to do".
 */
function QueueRowInner({
  item,
  currentUserId,
  role,
  isPending,
  onClaim,
  onRelease,
  onResolve,
}: Props) {
  const holder: Actor | null =
    item.status === ItemStatus.Resolved ? item.resolvedBy : item.claimedBy
  const isMine = item.claimedBy?.id === currentUserId

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

      {/* The raw timestamp, not toLocaleString(): Intl formatting is one of the
          most expensive things in the browser, and this is a tooltip nobody
          sees unless they hover. */}
      <p
        className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-400"
        title={item.createdAt}
      >
        {formatAge(item.createdAt)}
      </p>

      <div className="flex w-40 shrink-0 justify-end gap-1">
        <RowAction
          item={item}
          isMine={isMine}
          canAct={role !== Role.Viewer}
          isPending={isPending}
          onClaim={onClaim}
          onRelease={onRelease}
          onResolve={onResolve}
        />
      </div>
    </div>
  )
}

export const QueueRow = memo(QueueRowInner)
