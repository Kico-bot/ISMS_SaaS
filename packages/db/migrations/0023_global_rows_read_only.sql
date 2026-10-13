-- Systemrollen und globale Regeln zur Funktionstrennung (tenant_id IS NULL) gelten für alle
-- Mandanten. Die bisherige Richtlinie `USING (tenant_id IS NULL OR tenant_id = current_tenant_id())`
-- bestimmte auch, welche Zeilen UPDATE und DELETE erreichen: Jeder Mandant konnte globale Zeilen
-- löschen oder in seinen Mandanten ziehen. Lesen bleibt global und eigen, Schreiben nur eigen.
-- Der Seed schreibt die globalen Zeilen als Migrator (Eigentümerin, keine Zeilensicherheit).
DROP POLICY tenant_isolation ON "role";--> statement-breakpoint
CREATE POLICY tenant_read ON "role" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY tenant_insert ON "role" FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY tenant_update ON "role" FOR UPDATE
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY tenant_delete ON "role" FOR DELETE
  USING (tenant_id = current_tenant_id());--> statement-breakpoint

DROP POLICY tenant_isolation ON "sod_rule";--> statement-breakpoint
CREATE POLICY tenant_read ON "sod_rule" FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY tenant_insert ON "sod_rule" FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY tenant_update ON "sod_rule" FOR UPDATE
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
CREATE POLICY tenant_delete ON "sod_rule" FOR DELETE
  USING (tenant_id = current_tenant_id());
