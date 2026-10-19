-- Ein Audit belegt mit seinem Bericht, was auditiert wurde (ISO 27001 Kap. 9.2.2 f). Ab
-- `reported` sind deshalb Umfang, Termine, Regelwerk und Bericht fest, ab `closed` alles.
-- Der Service prüft das zuerst; diese Trigger sind die zweite Linie für jeden anderen Weg.
--
-- `pg_trigger_depth() > 1`: Änderungen aus einer Fremdschlüssel-Kaskade (Löschen eines
-- Mandanten, `report_file_id ON DELETE SET NULL`, Löschen eines Audits samt Umfang) laufen
-- selbst als Trigger und sollen nicht an dieser Sperre scheitern.
CREATE OR REPLACE FUNCTION trg_audit_locked() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'closed' THEN
    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'audit_locked: Audit % ist abgeschlossen', OLD.ref_no USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'reported' THEN
    IF NEW.planned_from IS DISTINCT FROM OLD.planned_from
       OR NEW.planned_to IS DISTINCT FROM OLD.planned_to
       OR NEW.framework_id IS DISTINCT FROM OLD.framework_id
       OR NEW.report_file_id IS DISTINCT FROM OLD.report_file_id THEN
      RAISE EXCEPTION 'audit_locked: Termine, Regelwerk und Bericht von Audit % sind mit dem Bericht fest', OLD.ref_no
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER trg_audit_locked BEFORE UPDATE ON "audit"
  FOR EACH ROW EXECUTE FUNCTION trg_audit_locked();--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_audit_requirement_locked() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_status text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status::text INTO v_status FROM "audit" WHERE id = OLD.audit_id;
    IF v_status IN ('reported', 'closed') THEN
      RAISE EXCEPTION 'audit_locked: der Umfang eines berichteten Audits ist fest' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status::text INTO v_status FROM "audit" WHERE id = NEW.audit_id;
    IF v_status IN ('reported', 'closed') THEN
      RAISE EXCEPTION 'audit_locked: der Umfang eines berichteten Audits ist fest' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;--> statement-breakpoint

CREATE TRIGGER trg_audit_requirement_locked BEFORE INSERT OR UPDATE OR DELETE ON "audit_requirement"
  FOR EACH ROW EXECUTE FUNCTION trg_audit_requirement_locked();--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isms_app') THEN
    GRANT EXECUTE ON FUNCTION trg_audit_locked() TO isms_app;
    GRANT EXECUTE ON FUNCTION trg_audit_requirement_locked() TO isms_app;
  END IF;
END $$;
