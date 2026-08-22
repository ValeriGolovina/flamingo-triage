'use client'

import { useSession } from '@/client/shared/session/useSession'
import { UserPicker } from '@/client/features/auth/ui/UserPicker'
import { QueueTable } from '@/client/features/queue/ui/QueueTable'
import { WorkspaceSwitcher } from '@/client/features/workspace/ui/WorkspaceSwitcher'
import { EmptyState } from '@/client/shared/ui/states'

/**
 * Composition lives at the page level: features never import one another, so
 * the screen is where the queue, the workspace switcher and the user picker
 * are put side by side.
 */
export default function TriagePage() {
  const { user, workspaces, isLoading } = useSession()

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">Triage</h1>
          {user ? <WorkspaceSwitcher /> : null}
        </div>
        <UserPicker />
      </header>

      {isLoading ? null : !user ? (
        <EmptyState
          title="Pick a user to start"
          hint="There is no password — the picker sets a signed cookie, which is what the brief asks for instead of OAuth."
        />
      ) : workspaces.length === 0 ? (
        <EmptyState title="No workspaces" hint="This account is not a member of any workspace." />
      ) : (
        <QueueTable />
      )}
    </main>
  )
}
