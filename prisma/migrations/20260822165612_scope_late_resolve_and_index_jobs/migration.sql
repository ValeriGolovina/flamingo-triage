-- AlterTable
ALTER TABLE "items" ADD COLUMN     "last_claimed_by_id" UUID;

-- CreateIndex
CREATE INDEX "notification_jobs_ws_status_idx" ON "notification_jobs"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_last_claimed_by_id_fkey" FOREIGN KEY ("last_claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: rows already claimed keep their holder as the last claimer, so a
-- claim that predates this migration does not lose the right to be resolved
-- after the sweep releases it.
UPDATE "items" SET "last_claimed_by_id" = "claimed_by_id" WHERE "status" = 'claimed';
