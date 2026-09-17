-- ============================================================================================
-- 0001 · Querverweise, Row-Level-Security, Funktionstrennung (Trigger), Views, Grants
-- Handgeschrieben (drizzle-kit --custom). Siehe docs/architecture/01-datenmodell.md §4.4–4.5.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- 1. Fremdschlüssel über Modulgrenzen (im Drizzle-Schema wegen zirkulärer Importe ausgelassen)
-- --------------------------------------------------------------------------------------------
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "requirement"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "org_unit"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_replaced_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_token"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pestle_factor" ADD CONSTRAINT "pestle_factor_risk_fk" FOREIGN KEY ("linked_risk_id") REFERENCES "risk"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_current_version_fk" FOREIGN KEY ("current_version_id") REFERENCES "document_version"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_risk_fk" FOREIGN KEY ("risk_id") REFERENCES "risk"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "action" ADD CONSTRAINT "action_incident_fk" FOREIGN KEY ("incident_id") REFERENCES "incident"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "integration_event" ADD CONSTRAINT "integration_event_incident_fk" FOREIGN KEY ("mapped_incident_id") REFERENCES "incident"("id") ON DELETE SET NULL;--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- 2. updated_at automatisch pflegen
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;--> statement-breakpoint
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t.table_name);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t.table_name);
  END LOOP;
END $$;--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- 3. Row-Level-Security: alle Tabellen mit tenant_id (außer Plattform-Tabellen)
--    Die API setzt je Transaktion: SELECT set_config('app.tenant_id', '<uuid>', true)
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;--> statement-breakpoint
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
      AND c.table_name NOT IN ('tenant_membership', 'role', 'sod_rule', 'tenant_framework', 'audit_log')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',
      t.table_name);
  END LOOP;
END $$;--> statement-breakpoint

-- Mandantentabellen mit globalen Zeilen (tenant_id IS NULL = Systemrolle / globale Regel): lesbar für alle,
-- schreibbar nur im eigenen Mandanten.
ALTER TABLE "role" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "role"
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
ALTER TABLE "sod_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sod_rule"
  USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint
-- audit_log: Mandantenzeilen nur im Mandantenkontext; Plattform-Ereignisse (tenant_id NULL) nur im mandantenlosen Kontext
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "audit_log"
  USING (tenant_id IS NOT DISTINCT FROM current_tenant_id())
  WITH CHECK (tenant_id IS NOT DISTINCT FROM current_tenant_id());--> statement-breakpoint
-- tenant_framework: Aktivierung erfolgt im Mandantenkontext
ALTER TABLE "tenant_framework" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_framework"
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

-- Junction-Tabellen ohne tenant_id: Isolation über die Elterntabelle
CREATE OR REPLACE FUNCTION rls_junction(p_table text, p_col text, p_parent text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %1$I USING (EXISTS (SELECT 1 FROM %3$I p WHERE p.id = %1$I.%2$I AND p.tenant_id = current_tenant_id())) WITH CHECK (EXISTS (SELECT 1 FROM %3$I p WHERE p.id = %1$I.%2$I AND p.tenant_id = current_tenant_id()))',
    p_table, p_col, p_parent);
END $$;--> statement-breakpoint
SELECT rls_junction('objective_requirement', 'objective_id', 'security_objective');--> statement-breakpoint
SELECT rls_junction('document_requirement', 'document_id', 'document');--> statement-breakpoint
SELECT rls_junction('profile_skill_requirement', 'profile_id', 'competence_profile');--> statement-breakpoint
SELECT rls_junction('person_profile', 'person_id', 'person');--> statement-breakpoint
SELECT rls_junction('measure_evidence', 'measure_id', 'measure');--> statement-breakpoint
SELECT rls_junction('finding_evidence', 'finding_id', 'finding');--> statement-breakpoint
SELECT rls_junction('bia_impact', 'bia_id', 'bia');--> statement-breakpoint
SELECT rls_junction('bia_resource', 'bia_id', 'bia');--> statement-breakpoint
SELECT rls_junction('continuity_plan_step', 'plan_id', 'continuity_plan');--> statement-breakpoint
SELECT rls_junction('processing_asset', 'processing_activity_id', 'processing_activity');--> statement-breakpoint
SELECT rls_junction('processing_tom', 'processing_activity_id', 'processing_activity');--> statement-breakpoint
SELECT rls_junction('processing_requirement', 'processing_activity_id', 'processing_activity');--> statement-breakpoint
SELECT rls_junction('incident_processing', 'incident_id', 'incident');--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- 4. Funktionstrennung (Vier-Augen-Prinzip) — zweite Verteidigungslinie hinter dem Service-Layer
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_distinct_actor(p_actor_user uuid, p_owner_person uuid, p_context text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_user uuid;
BEGIN
  IF p_actor_user IS NULL OR p_owner_person IS NULL THEN RETURN; END IF;
  SELECT user_id INTO v_owner_user FROM person WHERE id = p_owner_person;
  IF v_owner_user IS NOT NULL AND v_owner_user = p_actor_user THEN
    RAISE EXCEPTION 'sod_violation: % darf nicht durch den Owner selbst erfolgen', p_context
      USING ERRCODE = '23514';
  END IF;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_risk_sod() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.accepted_by_user_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.accepted_by_user_id IS DISTINCT FROM OLD.accepted_by_user_id) THEN
    PERFORM assert_distinct_actor(NEW.accepted_by_user_id, NEW.owner_person_id, 'Restrisiko-Übernahme');
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER trg_risk_sod BEFORE INSERT OR UPDATE ON "risk" FOR EACH ROW EXECUTE FUNCTION trg_risk_sod();--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_measure_sod() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified_by_user_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id) THEN
    PERFORM assert_distinct_actor(NEW.verified_by_user_id, NEW.owner_person_id, 'Verifizierung der Maßnahme');
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER trg_measure_sod BEFORE INSERT OR UPDATE ON "measure" FOR EACH ROW EXECUTE FUNCTION trg_measure_sod();--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_finding_sod() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.measure_id IS NOT NULL THEN
    SELECT owner_person_id INTO v_owner FROM measure WHERE id = NEW.measure_id;
    PERFORM assert_distinct_actor(NEW.raised_by_user_id, v_owner, 'Feststellung zur eigenen Maßnahme');
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER trg_finding_sod BEFORE INSERT OR UPDATE OF measure_id, raised_by_user_id ON "finding" FOR EACH ROW EXECUTE FUNCTION trg_finding_sod();--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_action_sod() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified_by_user_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id) THEN
    PERFORM assert_distinct_actor(NEW.verified_by_user_id, NEW.owner_person_id, 'Wirksamkeitsbestätigung der KVP-Maßnahme');
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER trg_action_sod BEFORE INSERT OR UPDATE ON "action" FOR EACH ROW EXECUTE FUNCTION trg_action_sod();--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- 5. Fortlaufende Referenznummern je Mandant: R-0001, INC-0042 …
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_ref_no(p_tenant uuid, p_kind text, p_prefix text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v int;
BEGIN
  INSERT INTO sequence_counter (tenant_id, kind, value) VALUES (p_tenant, p_kind, 1)
  ON CONFLICT (tenant_id, kind) DO UPDATE SET value = sequence_counter.value + 1
  RETURNING value INTO v;
  RETURN p_prefix || '-' || lpad(v::text, 4, '0');
END $$;--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- 6. Views
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_crosswalk AS
  SELECT source_requirement_id AS from_id, target_requirement_id AS to_id, relation, source FROM requirement_crosswalk
  UNION ALL
  SELECT target_requirement_id, source_requirement_id, relation, source FROM requirement_crosswalk;--> statement-breakpoint

-- Skill-Lücken: Soll (Profil) minus Ist (Person) je Person und Skill
CREATE OR REPLACE VIEW v_skill_gap AS
  SELECT pp.person_id, pp.profile_id, psr.skill_id, psr.min_level,
         COALESCE(ps.level, 0) AS actual_level,
         psr.min_level - COALESCE(ps.level, 0) AS gap
  FROM person_profile pp
  JOIN profile_skill_requirement psr ON psr.profile_id = pp.profile_id
  LEFT JOIN person_skill ps ON ps.person_id = pp.person_id AND ps.skill_id = psr.skill_id
  WHERE COALESCE(ps.level, 0) < psr.min_level;--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- 7. Rechte der App-Rolle (unterliegt RLS, kein DDL, Audit-Log append-only)
-- --------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isms_app') THEN
    GRANT USAGE ON SCHEMA public TO isms_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO isms_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO isms_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO isms_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM isms_app;
    -- Katalog und Rechte-Katalog sind für die App read-only
    REVOKE INSERT, UPDATE, DELETE ON framework, requirement, requirement_crosswalk, permission FROM isms_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO isms_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO isms_app;
  END IF;
END $$;
