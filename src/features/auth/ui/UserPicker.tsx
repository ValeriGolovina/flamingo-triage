'use client'

import { useSession, useSignIn, useSignOut, useUsers } from '../hooks/useSession'

/**
 * Stands in for a login screen. The brief asks for a dropdown of seeded users
 * and a signed cookie rather than real OAuth, so switching identity here is
 * the whole authentication flow.
 */
export function UserPicker() {
  const { user } = useSession()
  const users = useUsers()
  const signIn = useSignIn()
  const signOut = useSignOut()

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="user-picker">
        Signed in as
      </label>
      <select
        id="user-picker"
        value={user?.id ?? ''}
        disabled={signIn.isPending || users.length === 0}
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
          onClick={() => signOut.mutate()}
          className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        >
          Sign out
        </button>
      ) : null}
    </div>
  )
}
