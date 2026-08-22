import { PrismaPg } from '@prisma/adapter-pg'

import { env } from '@/core/config/env'

import { PrismaClient } from '@/generated/prisma/client'

// Prisma 7 requires a driver adapter. The adapter owns the runtime connection,
// which is why the pooled URL is passed here and not in prisma.config.ts.
// Read through the validated env, not raw process.env: a missing URL should
// fail at boot with the variable named, not at the first query with a driver
// error that mentions neither.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

// Dev only: without this, hot reload opens a new pool on every edit.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
