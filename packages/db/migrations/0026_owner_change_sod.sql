-- Eine Freigabe gilt für die Eigentümerin, unter der sie erteilt wurde. Die Trigger aus 0001
-- prüften die Funktionstrennung nur, wenn die freigebende Person gesetzt wird. Wer den Eigentümer
-- wegsetzt, freigibt und ihn danach zurücksetzt, hatte so eine Freigabe der eigenen Arbeit.
-- Jetzt prüfen die Trigger auch jeden Eigentümerwechsel, solange eine Freigabe gesetzt ist.
-- Der Service setzt die Freigabe beim Eigentümerwechsel zurück; das hier ist die zweite Linie.
CREATE OR REPLACE FUNCTION trg_risk_sod() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.accepted_by_user_id IS NOT NULL AND (TG_OP = 'INSERT'
      OR NEW.accepted_by_user_id IS DISTINCT FROM OLD.accepted_by_user_id
      OR NEW.owner_person_id IS DISTINCT FROM OLD.owner_person_id) THEN
    PERFORM assert_distinct_actor(NEW.accepted_by_user_id, NEW.owner_person_id, 'Restrisiko-Übernahme');
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_measure_sod() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.verified_by_user_id IS NOT NULL AND (TG_OP = 'INSERT'
      OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id
      OR NEW.owner_person_id IS DISTINCT FROM OLD.owner_person_id) THEN
    PERFORM assert_distinct_actor(NEW.verified_by_user_id, NEW.owner_person_id, 'Verifizierung der Maßnahme');
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_action_sod() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.verified_by_user_id IS NOT NULL AND (TG_OP = 'INSERT'
      OR NEW.verified_by_user_id IS DISTINCT FROM OLD.verified_by_user_id
      OR NEW.owner_person_id IS DISTINCT FROM OLD.owner_person_id) THEN
    PERFORM assert_distinct_actor(NEW.verified_by_user_id, NEW.owner_person_id, 'Wirksamkeitsbestätigung der KVP-Maßnahme');
  END IF;
  RETURN NEW;
END $$;
