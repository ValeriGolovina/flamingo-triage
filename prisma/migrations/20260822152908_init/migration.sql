-- CreateEnum
CREATE TYPE "role" AS ENUM ('owner', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "item_status" AS ENUM ('open', 'claimed', 'resolved');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('pending', 'sent', 'dead');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "role" "role" NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("user_id","workspace_id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "item_status" NOT NULL DEFAULT 'open',
    "claimed_by_id" UUID,
    "claimed_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "items_ws_created_id_idx" ON "items"("workspace_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "items_ws_status_created_id_idx" ON "items"("workspace_id", "status", "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written below this line. Prisma cannot express CHECK constraints or
-- partial indexes in schema.prisma — do not regenerate this file, add a new
-- migration instead.
-- ============================================================================

-- Makes a contradictory item state unwritable: "claimed" with no holder, or
-- "open" with one. Six different call sites write to this table (three
-- services, the R5 sweep, the seed, and manual SQL) — the likeliest bug is a
-- sweep that flips status back to 'open' and forgets to clear the holder,
-- which shows up in the UI as a free item with someone's name on it.
--
-- The 'resolved' branch deliberately does NOT constrain the claim columns:
-- what happens to a resolve that arrives after its claim expired is still an
-- open product question (R5), and a constraint must not pre-decide it.
ALTER TABLE "items" ADD CONSTRAINT "items_status_consistent" CHECK (
  (
    status = 'open'
    AND claimed_by_id IS NULL AND claimed_at IS NULL
    AND resolved_by_id IS NULL AND resolved_at IS NULL
  ) OR (
    status = 'claimed'
    AND claimed_by_id IS NOT NULL AND claimed_at IS NOT NULL
    AND resolved_by_id IS NULL AND resolved_at IS NULL
  ) OR (
    status = 'resolved'
    AND resolved_by_id IS NOT NULL AND resolved_at IS NOT NULL
  )
);

-- R5 sweep: find claims older than 30 minutes. Partial, because only claimed
-- rows are ever searched — the index stays tiny and costs almost nothing on write.
CREATE INDEX "items_stale_claims_idx"
  ON "items" ("claimed_at")
  WHERE status = 'claimed';

-- R3 outbox drain: find jobs that are due. Partial for the same reason —
-- delivered and dead jobs accumulate forever and must not bloat this index.
CREATE INDEX "notification_jobs_due_idx"
  ON "notification_jobs" ("next_attempt_at")
  WHERE status = 'pending';
