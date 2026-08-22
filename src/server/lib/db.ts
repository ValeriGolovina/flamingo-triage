import 'server-only'

import { prisma } from '@/server/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Anything that can run a query — the client itself, or a transaction.
 *
 * Repositories accept one of these so a service can require that two writes
 * land together without the service importing Prisma. The transaction boundary
 * is a business fact ("these happen together or not at all"), so it belongs to
 * the service; the SQL still belongs to the repositories.
 */
export type Executor = typeof prisma | Prisma.TransactionClient

export function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn)
}
