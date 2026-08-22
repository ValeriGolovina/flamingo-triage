'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sessionKeys } from '@/client/shared/session/useSession'

import { fetchUsers, signIn, signOut } from '../api/auth'

const usersKey = ['users'] as const

/** The seeded users behind the picker that stands in for a login screen. */
export function useUsers() {
  const query = useQuery({ queryKey: usersKey, queryFn: fetchUsers, staleTime: Infinity })
  return query.data?.users ?? []
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signIn,
    onSuccess: (session) => {
      // Switching identity changes what every cached query is allowed to see,
      // so everything belonging to the previous one goes.
      //
      // Order matters. Writing the new session first and then removing
      // everything else leaves the session query untouched — `clear()` would
      // drop it too, and the two components observing it re-subscribe on
      // separate commits, so the header can say "signed in as Anya" while the
      // body still says "pick a user". A frame of that is still the interface
      // contradicting itself.
      //
      // The predicate excludes this feature's own key rather than naming the
      // queue's, so nothing here has to know another feature's cache keys and
      // a cache added later is dropped without anyone remembering to add it.
      queryClient.setQueryData(sessionKeys.session, session)
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== sessionKeys.session[0],
      })
    },
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: signOut, onSuccess: () => queryClient.clear() })
}
