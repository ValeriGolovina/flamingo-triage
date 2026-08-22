'use client'

import { useCurrentWorkspace } from '@/shared/workspace/useCurrentWorkspace'

export function WorkspaceSwitcher() {
  const { workspaces, current, setWorkspaceId } = useCurrentWorkspace()

  if (workspaces.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="workspace-switcher">
        Workspace
      </label>
      <select
        id="workspace-switcher"
        value={current?.id ?? ''}
        onChange={(event) => setWorkspaceId(event.target.value)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {/* The role is shown, not hidden: it explains why actions are disabled. */}
      {current ? (
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">
          {current.role}
        </span>
      ) : null}
    </div>
  )
}
