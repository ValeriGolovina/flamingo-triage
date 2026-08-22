'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchSession, fetchUsers, signIn, signOut } from '../api/auth'

export const sessionKeys = {
  session: ['session'] as const,
  users: ['users'] as const,
}

export function useSession() {
  const query = useQuery({ queryKey: sessionKeys.session, queryFn: fetchSession })

  return {
    user: query.data?.user ?? null,
    workspaces: query.data?.workspaces ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/** The seeded users behind the picker that stands in for a login screen. */
export function useUsers() {
  const query = useQuery({ queryKey: sessionKeys.users, queryFn: fetchUsers, staleTime: Infinity })
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
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.clear(),
  })
}
