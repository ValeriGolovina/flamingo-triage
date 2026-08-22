import 'server-only'

import { prisma } from '@/core/db/prisma'

export const userRepository = {
  /** Powers the sign-in dropdown. Public by design — these are seeded demo users. */
  listAll() {
    return prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: { id: true, name: true } })
  },
}
