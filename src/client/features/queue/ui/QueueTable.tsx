'use client'

import { Role } from '@/shared/model/domain'
import { useSession } from '@/client/shared/session/useSession'
import { useCurrentWorkspace } from '@/client/shared/workspace/useCurrentWorkspace'
import { Spinner } from '@/client/shared/ui/Spinner'
import { EmptyState, ErrorState, SkeletonRows } from '@/client/shared/ui/states'

import { useItemActions } from '../hooks/useItemActions'
import { useQueue } from '../hooks/useQueue'
import { NotificationHealth } from './NotificationHealth'
import { QueueNotice } from './QueueNotice'
import { QueueRow } from './QueueRow'
import { QueueToolbar } from './QueueToolbar'

export function QueueTable() {
  const queue = useQueue()
  const { user } = useSession()
  const { current } = useCurrentWorkspace()
  const actions = useItemActions()

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <QueueToolbar total={queue.total} loaded={queue.items.length} />
      <NotificationHealth workspaceId={current?.id ?? null} />
      <QueueNotice />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body />
      </div>
    </section>
  )

  function Body() {
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
            isPending={actions.isPending(item.id)}
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
}
