-- Ohne festen Suchpfad sucht PostgreSQL Tabellen und Typen zuerst im temporären Schema der
-- Sitzung. Wer eine temporäre Tabelle `action` anlegt, lässt so `trg_finding_verify_sod` gegen
-- eine leere Tabelle prüfen und bestätigt die eigene Feststellung. Jede Funktion in `public`
-- bekommt deshalb denselben Suchpfad, `pg_temp` ausdrücklich zuletzt. Die Funktionen aus 0019
-- und 0020 haben ihn schon. `assert_distinct_actor` und `trg_finding_sod` hatten nur `public`;
-- dann sucht PostgreSQL `pg_temp` trotzdem zuerst.
ALTER FUNCTION set_updated_at() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION current_tenant_id() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION rls_junction(text, text, text) SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION assert_distinct_actor(uuid, uuid, text) SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION trg_risk_sod() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION trg_measure_sod() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION trg_finding_sod() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION trg_action_sod() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION next_ref_no(uuid, text, text) SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION trg_finding_verify_sod() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION trg_tenant_module_kind() SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION requirement_in_scope(uuid, uuid) SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint
ALTER FUNCTION requirement_check_status(uuid, uuid) SET search_path = pg_catalog, public, pg_temp;--> statement-breakpoint

-- Zweite Linie: Die App-Rolle legt gar keine temporären Objekte an. Jede Rolle erbt TEMPORARY
-- über PUBLIC, deshalb wird es PUBLIC entzogen; die Eigentümerin der Datenbank (isms_migrator,
-- auch für pg-boss) behält es als Eigentümerin. Das darf nur die Eigentümerin selbst; läuft die
-- Migration unter einer anderen Rolle, übernimmt das `infra/docker/postgres-init.sql` bzw. die
-- Einrichtung der Datenbank.
DO $$
BEGIN
  IF pg_has_role(current_user, (SELECT datdba FROM pg_database WHERE datname = current_database()), 'USAGE') THEN
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM isms_app', current_database());
  ELSE
    RAISE NOTICE 'TEMPORARY nicht entzogen: % ist nicht Eigentümerin der Datenbank %', current_user, current_database();
  END IF;
END $$;
