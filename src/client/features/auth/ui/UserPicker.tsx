'use client'

import { useSession } from '@/client/shared/session/useSession'

import { useSignIn, useSignOut, useUsers } from '../hooks/useAuthActions'

/**
 * Stands in for a login screen: the brief asks for a dropdown of seeded users
 * and a signed cookie rather than real OAuth, so switching identity here is the
 * whole authentication flow.
 *
 * A failure has to say so. Without the message below, a failed sign-in just
 * snaps the select back to its previous value and reports nothing — the
 * control appears to do nothing at all, which is the failure mode the brief
 * calls out by name.
 */
export function UserPicker() {
  const { user } = useSession()
  const users = useUsers()
  const signIn = useSignIn()
  const signOut = useSignOut()

  const busy = signIn.isPending || signOut.isPending
  const failed = signIn.isError || signOut.isError

  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <span role="status" className="text-xs text-red-700">
          Could not reach the server — you are still signed in as before.
        </span>
      ) : null}

      <label className="sr-only" htmlFor="user-picker">
        Signed in as
      </label>
      <select
        id="user-picker"
        value={user?.id ?? ''}
        disabled={busy || users.length === 0}
        onChange={(event) => signIn.mutate(event.target.value)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
      >
        <option value="" disabled>
          Sign in as…
        </option>
        {users.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>

      {user ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => signOut.mutate()}
          className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
        >
          Sign out
        </button>
      ) : null}
    </div>
  )
}
