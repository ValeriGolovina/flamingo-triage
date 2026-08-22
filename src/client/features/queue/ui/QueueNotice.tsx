'use client'

import { useEffect } from 'react'

import { useQueueView } from '../store/queueView'

/**
 * Says what happened when an action did not do what the click implied — losing
 * a race is the main case. The brief asks for "a clear result, or a button that
 * silently does nothing"; this is the clear result.
 */
export function QueueNotice() {
  const notice = useQueueView((s) => s.notice)
  const setNotice = useQueueView((s) => s.setNotice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 5_000)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  if (!notice) return null

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <span>{notice}</span>
      <button
        type="button"
        onClick={() => setNotice(null)}
        className="rounded px-1.5 text-amber-700 hover:bg-amber-100"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
