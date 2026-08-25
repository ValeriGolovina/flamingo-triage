'use client'

import { Role } from '@/shared/model/domain'
import { useSession } from '@/client/shared/session/useSession'
import { Spinner } from '@/client/shared/ui/Spinner'
import { EmptyState, ErrorState, SkeletonRows } from '@/client/shared/ui/states'
import { useCurrentWorkspace } from '@/client/shared/workspace/useCurrentWorkspace'

import { useItemActions } from '../hooks/useItemActions'
import { useQueue } from '../hooks/useQueue'
import { useAgeTick } from '../hooks/useQueueSync'
import { NotificationHealth } from './NotificationHealth'
import { QueueNotice } from './QueueNotice'
import { QueueRow } from './QueueRow'
import { QueueToolbar } from './QueueToolbar'

export function QueueTable() {
  const queue = useQueue()
  const { user } = useSession()
  const { current } = useCurrentWorkspace()
  const actions = useItemActions()
  // One clock for the whole table: rows are memoised, so without a prop that
  // moves, the age column would keep printing whatever it printed first.
  const now = useAgeTick()

  /**
   * The body is a plain function call, not `<Body />`.
   *
   * A component declared inside another component has a new identity on every
   * render, so React unmounts and remounts the whole subtree instead of
   * updating it. On a list that polls, that destroyed and rebuilt every row a
   * few times a second — which is what threw the scroll position back to the
   * top: the container's scrollHeight briefly drops to zero and the browser
   * resets scrollTop before the new rows are inserted.
   */
  const body = () => {
    if (queue.isLoading) return <SkeletonRows />

    if (queue.isError) {
      return (
        <ErrorState
          title="Could not load the queue"
          hint="The request failed. Nothing has changed."
          onRetry={() => void queue.refetch()}
        />
      )
    }

    if (queue.items.length === 0) {
      return <EmptyState title="Nothing here" hint="No items match this filter." />
    }

    return (
      <>
        {queue.items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            currentUserId={user?.id ?? ''}
            role={current?.role ?? Role.Viewer}
            isPending={actions.pendingIds.has(item.id)}
            now={now}
            onClaim={actions.claim}
            onRelease={actions.release}
            onResolve={actions.resolve}
          />
        ))}

        <div className="px-4 py-4 text-center">
          {queue.hasNextPage ? (
            <button
              type="button"
              onClick={() => void queue.fetchNextPage()}
              disabled={queue.isFetchingNextPage}
              className="inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
            >
              {queue.isFetchingNextPage ? <Spinner /> : null}
              Load more
            </button>
          ) : (
            <p className="text-xs text-zinc-400">End of the queue</p>
          )}
        </div>
      </>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <QueueToolbar total={queue.total} loaded={queue.items.length} />
      <NotificationHealth workspaceId={current?.id ?? null} />
      <QueueNotice />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </section>
  )
}
