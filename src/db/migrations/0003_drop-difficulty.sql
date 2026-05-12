ALTER TABLE "problems" DROP CONSTRAINT "problems_difficulty_check";--> statement-breakpoint
DROP INDEX "problems_difficulty_idx";--> statement-breakpoint
ALTER TABLE "problems" DROP COLUMN "difficulty";