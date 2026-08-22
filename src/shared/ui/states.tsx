import type { ReactNode } from 'react'

/**
 * Loading, empty and error are real states with real markup, not a spinner
 * thrown over the whole page. The queue keeps its shape while it loads so the
 * layout does not jump when rows arrive.
 */
export function SkeletonRows({ rows = 12 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading queue">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-zinc-100 px-4 py-2.5">
          <div className="h-3.5 flex-1 animate-pulse rounded bg-zinc-100" />
          <div className="h-3.5 w-20 animate-pulse rounded bg-zinc-100" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-zinc-100" />
          <div className="h-6 w-20 animate-pulse rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
    </div>
  )
}

export function ErrorState({ title, hint, onRetry }: { title: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-16 text-center">
      <p className="text-sm font-medium text-red-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
        >
          Try again
        </button>
      ) : null}
    </div>
  )
}
