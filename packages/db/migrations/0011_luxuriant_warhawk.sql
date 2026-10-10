ALTER TABLE "risk" ADD COLUMN "likelihood" smallint;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "impact" smallint;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "score" smallint GENERATED ALWAYS AS (likelihood * impact) STORED;