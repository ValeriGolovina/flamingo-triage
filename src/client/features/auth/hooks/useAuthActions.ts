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
      // so everything from the previous one goes. Clearing wholesale rather
      // than naming the queue's cache key keeps this feature from having to
      // know another feature's keys — and cannot miss one that is added later.
      queryClient.clear()
      queryClient.setQueryData(sessionKeys.session, session)
    },
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: signOut, onSuccess: () => queryClient.clear() })
}
