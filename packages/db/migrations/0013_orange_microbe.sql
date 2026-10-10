ALTER TABLE "risk" DROP CONSTRAINT "risk_matrix_chk";--> statement-breakpoint
DROP INDEX "risk_tenant_scores_idx";--> statement-breakpoint
CREATE INDEX "risk_tenant_score_idx" ON "risk" USING btree ("tenant_id","score");--> statement-breakpoint
-- Generierte Spalten zuerst — sie hängen an den Eingangswerten.
ALTER TABLE "risk" DROP COLUMN "inherent_score";--> statement-breakpoint
ALTER TABLE "risk" DROP COLUMN "residual_score";--> statement-breakpoint
ALTER TABLE "risk" DROP COLUMN "inherent_likelihood";--> statement-breakpoint
ALTER TABLE "risk" DROP COLUMN "inherent_impact";--> statement-breakpoint
ALTER TABLE "risk" DROP COLUMN "residual_likelihood";--> statement-breakpoint
ALTER TABLE "risk" DROP COLUMN "residual_impact";--> statement-breakpoint
ALTER TABLE "risk_assessment" DROP COLUMN "stage";--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_rating_chk" CHECK (("risk"."likelihood" IS NULL OR "risk"."likelihood" BETWEEN 1 AND 5) AND ("risk"."impact" IS NULL OR "risk"."impact" BETWEEN 1 AND 5));--> statement-breakpoint
DROP TYPE "public"."assessment_stage";