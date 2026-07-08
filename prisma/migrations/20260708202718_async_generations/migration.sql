-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "costJson" JSONB,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'done';
