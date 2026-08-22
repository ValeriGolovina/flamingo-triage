import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Prisma 7 does not load .env files on its own. Next.js loads .env.local at
// runtime; the CLI (migrate, generate, studio) needs it stated explicitly.
loadEnv({ path: '.env.local' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations need a real session, which the transaction pooler cannot give.
    // Runtime uses the pooled URL instead — see src/core/db/prisma.ts.
    url: process.env.DIRECT_URL,
  },
})
