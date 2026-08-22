import { ItemStatus } from '@/shared/model/domain'

const STYLES: Record<ItemStatus, { label: string; className: string }> = {
  [ItemStatus.Open]: { label: 'Open', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  [ItemStatus.Claimed]: { label: 'Claimed', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  [ItemStatus.Resolved]: { label: 'Resolved', className: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20' },
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  const { label, className } = STYLES[status]
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  )
}
