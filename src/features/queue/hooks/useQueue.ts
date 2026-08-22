'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ItemStatus } from '@/shared/model/domain'
import type { QueueCursor } from '@/shared/model/queue'
import { useCurrentWorkspaceStore } from '@/shared/workspace/store'

import { fetchQueuePage } from '../api/queue'
import { useQueueFilters } from '../store/queueFilters'
import { QUEUE_SYNC_OPTIONS } from './useQueueSync'

export const queueKeys = {
  all: ['queue'] as const,
  list: (workspaceId: string | null, status: ItemStatus | null) =>
    ['queue', workspaceId, status] as const,
}

export function useQueue() {
  const workspaceId = useCurrentWorkspaceStore((s) => s.workspaceId)
  const status = useQueueFilters((s) => s.status)

  const query = useInfiniteQuery({
    queryKey: queueKeys.list(workspaceId, status),
    queryFn: ({ pageParam }) =>
      fetchQueuePage(workspaceId as string, { status, cursor: pageParam }),
    initialPageParam: null as QueueCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(workspaceId),
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
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  }
}
