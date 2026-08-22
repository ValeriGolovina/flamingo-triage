'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchNotificationSummary } from '../api/actions'

/**
 * Makes "nothing disappears silently" visible. Polled slowly — this is a health
 * indicator, not the queue, and it should not add meaningfully to the traffic
 * the queue already generates.
 */
export function useNotificationSummary(workspaceId: string | null) {
  const query = useQuery({
    queryKey: ['notifications', workspaceId],
    queryFn: () => fetchNotificationSummary(workspaceId as string),
    enabled: Boolean(workspaceId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })

  return query.data ?? { pending: 0, dead: 0 }
}
