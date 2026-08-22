'use client'

import { useNotificationSummary } from '../hooks/useNotificationSummary'

/**
 * R3 asks that nothing disappear silently. The outbox row is the record; this
 * is the part of it a person can actually see.
 */
export function NotificationHealth({ workspaceId }: { workspaceId: string | null }) {
  const { pending, dead } = useNotificationSummary(workspaceId)

  if (pending === 0 && dead === 0) return null

  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs text-zinc-600">
      <span className="font-medium">Notifications</span>
      {pending > 0 ? <span>{pending} waiting to be delivered</span> : null}
      {dead > 0 ? (
        <span className="text-red-700">
          {dead} gave up after repeated failures — the record is kept
        </span>
      ) : null}
    </div>
  )
}
