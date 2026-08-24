'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ItemStatus } from '@/shared/model/domain'
import type { QueueCursor } from '@/shared/model/queue'
import { useCurrentWorkspaceStore } from '@/client/shared/workspace/store'

import { fetchQueuePage } from '../api/queue'
import { useQueueView } from '../store/queueView'
import { QUEUE_SYNC_OPTIONS } from './useQueueSync'

export const queueKeys = {
  list: (workspaceId: string | null, status: ItemStatus | null) =>
    ['queue', workspaceId, status] as const,
}

export function useQueue() {
  const workspaceId = useCurrentWorkspaceStore((s) => s.workspaceId)
  const status = useQueueView((s) => s.status)

  const query = useInfiniteQuery({
    queryKey: queueKeys.list(workspaceId, status),
    queryFn: ({ pageParam }) =>
      fetchQueuePage(workspaceId as string, { status, cursor: pageParam }),
    initialPageParam: null as QueueCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(workspaceId),
    /**
     * Every poll tick flips isFetching true and then false. Neither is shown
     * anywhere, but both would re-render the table and, before the rows were
     * memoised, every row with it. Subscribing only to what this hook returns
     * cuts two full renders per tick.
     */
    notifyOnChangeProps: ['data', 'isLoading', 'isError', 'hasNextPage', 'isFetchingNextPage'],
    ...QUEUE_SYNC_OPTIONS,
  })

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )

  return {
    items,
    // Total matching the filter, not the number loaded — the UI must not imply
    // the page is the set.
    total: query.data?.pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  }
}
