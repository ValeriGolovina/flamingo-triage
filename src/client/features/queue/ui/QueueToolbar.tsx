'use client'

import { ItemStatus } from '@/shared/model/domain'

import { useQueueView } from '../store/queueView'

const TABS: Array<{ value: ItemStatus | null; label: string }> = [
  { value: null, label: 'All' },
  { value: ItemStatus.Open, label: 'Open' },
  { value: ItemStatus.Claimed, label: 'Claimed' },
  { value: ItemStatus.Resolved, label: 'Resolved' },
]

export function QueueToolbar({ total, loaded }: { total: number; loaded: number }) {
  const status = useQueueView((s) => s.status)
  const setStatus = useQueueView((s) => s.setStatus)

  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-2">
      <div className="flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setStatus(tab.value)}
            aria-pressed={status === tab.value}
            className={`rounded px-2.5 py-1 text-sm font-medium ${
              status === tab.value
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Says how much of the set is on screen — never implies the page is the set. */}
      <p className="text-sm tabular-nums text-zinc-500">
        {loaded.toLocaleString('en-US')} of {total.toLocaleString('en-US')}
      </p>
    </div>
  )
}
