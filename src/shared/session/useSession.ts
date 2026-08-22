'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchSession } from './api'

/**
 * Who is signed in and which workspaces they can see.
 *
 * This lives in `shared` rather than in the auth feature because three
 * different features need to read it, and a feature may not import another
 * feature. Signing in and out are auth's business; knowing who you are is
 * everyone's.
 */
export const sessionKeys = { session: ['session'] as const }

export function useSession() {
  const query = useQuery({ queryKey: sessionKeys.session, queryFn: fetchSession })

  return {
    user: query.data?.user ?? null,
    workspaces: query.data?.workspaces ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
