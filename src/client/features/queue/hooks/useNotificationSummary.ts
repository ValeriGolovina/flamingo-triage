'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchNotificationSummary } from '../api/actions'

/**
 * Makes "nothing disappears silently" visible.
 *
 * `isError` is returned rather than folded into zeroes. This is the one
 * indicator whose entire job is to prove failures are not hidden — reporting
 * "nothing outstanding" when the check itself could not run would be the same
 * lie it exists to prevent.
 *
 * Polled slowly: a health indicator, not the queue, and it should not add
 * meaningfully to the traffic the queue already generates.
 */
export function useNotificationSummary(workspaceId: string | null) {
  const query = useQuery({
    queryKey: ['notifications', workspaceId],
    queryFn: () => fetchNotificationSummary(workspaceId as string),
    enabled: Boolean(workspaceId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })

  return {
    pending: query.data?.pending ?? 0,
    dead: query.data?.dead ?? 0,
    isError: query.isError,
  }
}
