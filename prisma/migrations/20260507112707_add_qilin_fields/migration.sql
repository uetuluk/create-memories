-- CreateEnum
CREATE TYPE "QilinStyle" AS ENUM ('FIERCE', 'CUTE');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "location" TEXT,
ADD COLUMN     "parentJobId" TEXT,
ADD COLUMN     "selfiePath" TEXT,
ADD COLUMN     "style" "QilinStyle";

-- CreateIndex
CREATE INDEX "Job_parentJobId_idx" ON "Job"("parentJobId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
