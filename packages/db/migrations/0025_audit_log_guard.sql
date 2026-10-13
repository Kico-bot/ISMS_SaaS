-- Das Änderungsprotokoll ist append-only (0001 entzieht UPDATE, DELETE und TRUNCATE). Zwei Umwege
-- blieben: Ein gelöschter Mandant nahm seine Protokollzeilen per Kaskade mit, und eine neue Zeile
-- durfte ihr `at` selbst bestimmen, also rückdatiert werden. 0024 stellt die Fremdschlüssel auf
-- ON DELETE RESTRICT; hier verliert die App-Rolle das Löschen von Mandanten und Konten (kein
-- API-Weg löscht sie), und ein Trigger setzt `at` immer auf den Zeitpunkt des Schreibens.
CREATE FUNCTION trg_audit_log_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.at := now();
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER trg_audit_log_at BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION trg_audit_log_at();--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isms_app') THEN
    REVOKE DELETE ON tenant, "user" FROM isms_app;
  END IF;
END $$;
