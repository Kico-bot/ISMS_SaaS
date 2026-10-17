-- Eine Freigabe ist kein Status, den man setzt: „bestätigt“, „getragen“ und „freigegeben“
-- entstehen nur zusammen mit der Person, die bestätigt, trägt oder freigibt. Die Trigger aus
-- 0001 prüfen die Funktionstrennung nur, wenn diese Person gesetzt wird; ohne sie fehlte jede
-- Prüfung. Das ist die zweite Linie hinter DTO und Service.
--
-- Bewusst ein Trigger statt eines CHECK: er prüft nur neue Zeilen und Zeilen, die in den
-- Freigabestatus wechseln oder ihre handelnde Person verlieren. Vorhandene Zeilen ohne
-- handelnde Person bleiben bearbeitbar; ob sie bereinigt werden, ist eine eigene Entscheidung.
CREATE OR REPLACE FUNCTION assert_approval_actor() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_status text := TG_ARGV[0];
  v_actor text := TG_ARGV[1];
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb;
BEGIN
  IF v_new ->> 'status' IS DISTINCT FROM v_status OR v_new ->> v_actor IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    IF v_old ->> 'status' = v_status AND v_old ->> v_actor IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'approval_without_actor: %.status = % verlangt %', TG_TABLE_NAME, v_status, v_actor
    USING ERRCODE = '23514';
END $$;--> statement-breakpoint

CREATE TRIGGER trg_measure_approval_actor BEFORE INSERT OR UPDATE OF status, verified_by_user_id ON "measure"
  FOR EACH ROW EXECUTE FUNCTION assert_approval_actor('verified', 'verified_by_user_id');--> statement-breakpoint
CREATE TRIGGER trg_action_approval_actor BEFORE INSERT OR UPDATE OF status, verified_by_user_id ON "action"
  FOR EACH ROW EXECUTE FUNCTION assert_approval_actor('verified', 'verified_by_user_id');--> statement-breakpoint
CREATE TRIGGER trg_risk_approval_actor BEFORE INSERT OR UPDATE OF status, accepted_by_user_id ON "risk"
  FOR EACH ROW EXECUTE FUNCTION assert_approval_actor('accepted', 'accepted_by_user_id');--> statement-breakpoint
CREATE TRIGGER trg_change_plan_approval_actor BEFORE INSERT OR UPDATE OF status, approved_by_user_id ON "change_plan_entry"
  FOR EACH ROW EXECUTE FUNCTION assert_approval_actor('approved', 'approved_by_user_id');--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isms_app') THEN
    GRANT EXECUTE ON FUNCTION assert_approval_actor() TO isms_app;
  END IF;
END $$;
