'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { ApiError } from '@/client/shared/api/http'

/**
 * Created inside state, not at module scope: a module-level client would be
 * shared across requests on the server and leak one user's cache into another's.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Retrying an authorization failure just repeats it more slowly.
            retry: (count, error) =>
              !(error instanceof ApiError && error.status < 500) && count < 2,
            staleTime: 1_000,
          },
          mutations: { retry: false },
        },
      }),
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
