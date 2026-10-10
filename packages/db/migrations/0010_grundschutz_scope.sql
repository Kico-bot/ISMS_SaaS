-- ============================================================================================
-- 0010 · IT-Grundschutz: Modellierung bestimmt, welche Anforderungen überhaupt zählen
--
-- Der Kompendium-Katalog hat 1.832 Anforderungen in 111 Bausteinen. Eine Organisation
-- modelliert davon typischerweise 20–40 Bausteine; nur deren Anforderungen — gefiltert nach der
-- Absicherungsvariante — gehören in den IT-Grundschutz-Check, in die Abdeckung und in das
-- Auditprogramm. Ohne diesen Filter rechnet jede Kennzahl gegen 1.832 und zeigt ~0 %.
--
-- Die Regel ist katalog-, nicht BSI-spezifisch: Wer einen Elternteil vom Typ 'baustein' hat, ist
-- nur im Umfang, wenn der Baustein modelliert ist. Alle anderen Anforderungen (ISO, NIS2, DSGVO)
-- sind es immer.
-- ============================================================================================

ALTER TABLE "tenant_module" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_module"
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

-- Ein modellierter Baustein muss ein Baustein sein — sonst ließe sich eine Einzelanforderung
-- "modellieren" und die Abdeckung bliebe trotzdem leer.
CREATE OR REPLACE FUNCTION trg_tenant_module_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requirement r WHERE r.id = NEW.requirement_id AND r.kind = 'baustein') THEN
    RAISE EXCEPTION 'Nur Bausteine lassen sich modellieren' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER trg_tenant_module_kind BEFORE INSERT OR UPDATE OF requirement_id ON "tenant_module"
  FOR EACH ROW EXECUTE FUNCTION trg_tenant_module_kind();--> statement-breakpoint

-- Gehört die Anforderung für diesen Mandanten zum Umfang?
--   Baustein          → modelliert?
--   Anforderung       → Baustein modelliert UND Stufe passt zur Absicherungsvariante
--                       (basis: nur Basis; standard/kern: Basis + Standard; erhöht: je Baustein)
--   alles andere      → ja
CREATE OR REPLACE FUNCTION requirement_in_scope(p_tenant uuid, p_req uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN r.kind = 'baustein' THEN EXISTS (
      SELECT 1 FROM tenant_module tm WHERE tm.tenant_id = p_tenant AND tm.requirement_id = r.id)
    WHEN b.kind = 'baustein' THEN EXISTS (
      SELECT 1
      FROM tenant_module tm
      LEFT JOIN tenant_framework tf ON tf.tenant_id = tm.tenant_id AND tf.framework_id = r.framework_id
      WHERE tm.tenant_id = p_tenant AND tm.requirement_id = b.id
        AND (r.level IS NULL
             OR r.level = 'basis'
             OR (r.level = 'standard' AND COALESCE(tf.protection_variant::text, 'standard') <> 'basis')
             OR (r.level = 'erhoeht' AND tm.elevated)))
    ELSE true
  END
  FROM requirement r
  LEFT JOIN requirement b ON b.id = r.parent_id
  WHERE r.id = p_req
$$;--> statement-breakpoint

-- Umsetzungsstatus im IT-Grundschutz-Check (ja / teilweise / nein / entbehrlich). Abgeleitet,
-- nicht gepflegt: „ja" heißt, eine umgesetzte Maßnahme deckt die Anforderung vollständig ab;
-- „teilweise", eine umgesetzte deckt sie nur zum Teil ab; eine Maßnahme in Arbeit ist noch „nein".
-- „entbehrlich" ist die Grundschutz-Entsprechung von „nicht anwendbar" — mit Begründung.
CREATE OR REPLACE FUNCTION requirement_check_status(p_tenant uuid, p_req uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM tenant_requirement tr
                 WHERE tr.tenant_id = p_tenant AND tr.requirement_id = p_req
                   AND tr.applicability = 'not_applicable') THEN 'dispensable'
    WHEN EXISTS (SELECT 1 FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
                 WHERE mr.tenant_id = p_tenant AND mr.requirement_id = p_req
                   AND m.status IN ('implemented', 'verified') AND mr.coverage = 'full') THEN 'yes'
    WHEN EXISTS (SELECT 1 FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
                 WHERE mr.tenant_id = p_tenant AND mr.requirement_id = p_req
                   AND m.status IN ('implemented', 'verified')) THEN 'partial'
    ELSE 'no'
  END
$$;--> statement-breakpoint

-- Auditprogramm-Abdeckung nur über den Umfang — ein nie modellierter Baustein ist keine Lücke.
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
WHERE requirement_in_scope(a.tenant_id, r.id)
GROUP BY a.tenant_id, r.id, r.framework_id, r.ref_code, r.group_ref_code, r.group_title;
--> statement-breakpoint

-- Bestand: wer schon Maßnahmen auf Grundschutz-Anforderungen gemappt oder Anforderungen bewertet
-- hat, hat damit faktisch modelliert. Diese Bausteine werden übernommen, damit nach dem Update
-- nichts aus Check und Abdeckung verschwindet.
INSERT INTO tenant_module (tenant_id, requirement_id, elevated, note)
SELECT DISTINCT x.tenant_id, b.id,
       bool_or(r.level = 'erhoeht') OVER (PARTITION BY x.tenant_id, b.id),
       'Aus bestehenden Zuordnungen übernommen'
FROM (
  SELECT tenant_id, requirement_id FROM measure_requirement
  UNION
  SELECT tenant_id, requirement_id FROM tenant_requirement
) x
JOIN requirement r ON r.id = x.requirement_id
JOIN requirement b ON b.id = CASE WHEN r.kind = 'baustein' THEN r.id ELSE r.parent_id END AND b.kind = 'baustein'
ON CONFLICT DO NOTHING;
