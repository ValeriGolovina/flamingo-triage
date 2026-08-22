import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

// Prisma 7 requires a driver adapter. The adapter owns the runtime connection,
// which is why the pooled URL is passed here and not in prisma.config.ts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

// Dev only: without this, hot reload opens a new pool on every edit.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
