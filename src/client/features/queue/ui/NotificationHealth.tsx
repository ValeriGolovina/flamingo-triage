'use client'

import { useNotificationSummary } from '../hooks/useNotificationSummary'

/**
 * R3 asks that nothing disappear silently. The outbox row is the record; this
 * is the part of it a person can actually see.
 */
export function NotificationHealth({ workspaceId }: { workspaceId: string | null }) {
  const { pending, dead, isError } = useNotificationSummary(workspaceId)

  if (isError) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
        Could not check notification delivery — this strip is not saying
        everything is fine, it is saying it does not know.
      </div>
    )
  }

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
