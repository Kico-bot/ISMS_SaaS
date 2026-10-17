ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_tenant_id_tenant_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;