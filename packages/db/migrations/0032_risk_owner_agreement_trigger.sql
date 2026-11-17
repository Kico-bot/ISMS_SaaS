-- Zustimmung der verantwortlichen Person zu Behandlungsplan und Restrisiko (ISO 27001 Kap. 6.1.3 f).
-- Umgekehrte Regel zu assert_distinct_actor: Hat die verantwortliche Person ein Konto, stimmt nur
-- sie selbst zu. Ohne Konto darf jemand anderes die Zustimmung eintragen, aber nur mit Angabe, wie
-- sie erteilt wurde. Wechselt die verantwortliche Person, entfällt die Zustimmung.
CREATE OR REPLACE FUNCTION trg_risk_owner_agreement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_owner_user uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_person_id IS DISTINCT FROM OLD.owner_person_id
     AND NEW.owner_agreed_at IS NOT DISTINCT FROM OLD.owner_agreed_at THEN
    NEW.owner_agreed_at := NULL;
    NEW.owner_agreed_by_user_id := NULL;
    NEW.owner_agreement_note := NULL;
    NEW.owner_agreement_file_id := NULL;
    NEW.owner_agreement_snapshot := NULL;
    RETURN NEW;
  END IF;
  IF NEW.owner_agreed_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.owner_agreed_at IS DISTINCT FROM OLD.owner_agreed_at
          OR NEW.owner_agreed_by_user_id IS DISTINCT FROM OLD.owner_agreed_by_user_id) THEN
    IF NEW.owner_person_id IS NULL OR NEW.owner_agreed_by_user_id IS NULL THEN
      RAISE EXCEPTION 'sod_violation: Zustimmung ohne verantwortliche Person ist nicht möglich'
        USING ERRCODE = '23514';
    END IF;
    SELECT user_id INTO v_owner_user FROM person WHERE id = NEW.owner_person_id;
    IF v_owner_user IS NOT NULL AND v_owner_user <> NEW.owner_agreed_by_user_id THEN
      RAISE EXCEPTION 'sod_violation: Der Behandlung zustimmen darf nur die verantwortliche Person selbst'
        USING ERRCODE = '23514';
    END IF;
    IF v_owner_user IS NULL AND coalesce(btrim(NEW.owner_agreement_note), '') = '' THEN
      RAISE EXCEPTION 'sod_violation: Eine Zustimmung im Auftrag braucht die Angabe, wie sie erteilt wurde'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

CREATE TRIGGER trg_risk_owner_agreement BEFORE INSERT OR UPDATE ON "risk"
  FOR EACH ROW EXECUTE FUNCTION trg_risk_owner_agreement();
