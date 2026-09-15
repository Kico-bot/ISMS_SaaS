-- Auditumfang: Isolation über die Elterntabelle, wie bei allen Junction-Tabellen ohne tenant_id.
SELECT rls_junction('audit_requirement', 'audit_id', 'audit');--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- Funktionstrennung: die Schließung einer Feststellung bestätigt nicht, wer sie behoben hat.
-- Geprüft wird gegen alle Verantwortlichen der zugehörigen KVP-Maßnahmen.
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_finding_verify_sod() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified_by_user_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id) THEN
    PERFORM assert_distinct_actor(NEW.verified_by_user_id, a.owner_person_id, 'Verifizierung der Feststellung')
    FROM "action" a
    WHERE a.finding_id = NEW.id AND a.owner_person_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER trg_finding_verify_sod BEFORE INSERT OR UPDATE OF verified_by_user_id ON "finding"
  FOR EACH ROW EXECUTE FUNCTION trg_finding_verify_sod();--> statement-breakpoint

-- --------------------------------------------------------------------------------------------
-- Auditprogramm-Abdeckung (ISO 27001 Kap. 9.2.2): wann wurde jede bewertbare Anforderung
-- zuletzt auditiert? Ohne diese Sicht bleibt das Auditprogramm eine Behauptung.
-- --------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_audit_coverage AS
SELECT
  a.tenant_id,
  r.id            AS requirement_id,
  r.framework_id,
  r.ref_code,
  r.group_ref_code,
  r.group_title,
  max(COALESCE(au.planned_to, au.planned_from))                                    AS last_audited_on,
  count(DISTINCT au.id)                                                            AS audit_count,
  count(DISTINCT f.id) FILTER (WHERE f.status IN ('open', 'in_progress'))           AS open_findings
FROM tenant_framework a
JOIN v_assessable_requirement r ON r.framework_id = a.framework_id
LEFT JOIN audit_requirement ar ON ar.requirement_id = r.id
LEFT JOIN "audit" au ON au.id = ar.audit_id AND au.tenant_id = a.tenant_id AND au.status IN ('reported', 'closed')
LEFT JOIN finding f ON f.requirement_id = r.id AND f.tenant_id = a.tenant_id
GROUP BY a.tenant_id, r.id, r.framework_id, r.ref_code, r.group_ref_code, r.group_title;
