'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { sessionKeys } from '@/shared/session/useSession'

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
      queryClient.setQueryData(sessionKeys.session, session)
      // Switching identity changes what every other query is allowed to see.
      queryClient.removeQueries({ queryKey: ['queue'] })
    },
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: signOut, onSuccess: () => queryClient.clear() })
}
