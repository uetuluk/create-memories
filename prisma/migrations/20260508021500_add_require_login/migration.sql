-- AlterTable: AppState gets a kill-switch for the login requirement.
ALTER TABLE "AppState" ADD COLUMN "requireLogin" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Job.userId is now optional so anonymous kiosk submissions
-- (when requireLogin=false) can be persisted without an owner.
ALTER TABLE "Job" DROP CONSTRAINT "Job_userId_fkey";
ALTER TABLE "Job" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
