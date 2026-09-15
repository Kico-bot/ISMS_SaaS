CREATE TABLE "audit_requirement" (
	"audit_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	CONSTRAINT "audit_requirement_audit_id_requirement_id_pk" PRIMARY KEY("audit_id","requirement_id")
);
--> statement-breakpoint
ALTER TABLE "audit_requirement" ADD CONSTRAINT "audit_requirement_audit_id_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requirement" ADD CONSTRAINT "audit_requirement_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE no action ON UPDATE no action;