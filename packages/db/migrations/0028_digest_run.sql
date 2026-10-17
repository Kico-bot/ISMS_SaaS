CREATE TABLE "digest_run" (
	"tenant_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_run_tenant_id_run_date_pk" PRIMARY KEY("tenant_id","run_date")
);
--> statement-breakpoint
ALTER TABLE "digest_run" ADD CONSTRAINT "digest_run_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "digest_run"
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isms_app') THEN
    -- Ein Tageslauf wird vermerkt, nie umgeschrieben; nur mit dem Mandanten verschwindet er.
    GRANT SELECT, INSERT ON "digest_run" TO isms_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "digest_run" FROM isms_app;
  END IF;
END $$;
