-- ============================================================================================
-- 0015 · Wer ist gemeint? — Adressat der Anforderung und KI-Register
--
-- 1. NIS2 und DSGVO richten sich zu großen Teilen an Mitgliedstaaten und Behörden. Diese Artikel
--    tragen `applies_to = 'not_addressed'` und zählen nirgends — nicht in Liste, Abdeckung,
--    Kennzahl, Export oder Auditprogramm.
-- 2. EU AI Act, ausschließlich Betreiberpflichten: eine Pflicht zählt erst, wenn ein KI-System im
--    Register sie auslöst. Das Register ist für den AI Act, was die Modellierung für den
--    IT-Grundschutz ist.
-- Die Regel bleibt an genau einer Stelle: requirement_in_scope().
-- ============================================================================================

ALTER TABLE "ai_system" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ai_system"
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());--> statement-breakpoint

-- Nicht im Drizzle-Schema, um den Importzyklus operations ↔ ai zu vermeiden.
ALTER TABLE "incident" ADD CONSTRAINT "incident_ai_system_id_fk"
  FOREIGN KEY ("ai_system_id") REFERENCES "ai_system"("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE OR REPLACE FUNCTION requirement_in_scope(p_tenant uuid, p_req uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN r.applies_to = 'not_addressed' THEN false
    -- AI Act: ein nicht stillgelegtes KI-System im Register muss die Pflicht auslösen
    WHEN r.applies_to::text LIKE 'ai\_%' THEN EXISTS (
      SELECT 1 FROM ai_system s
      WHERE s.tenant_id = p_tenant AND s.status <> 'retired'
        AND CASE r.applies_to
              WHEN 'ai_any'       THEN true
              WHEN 'ai_high_risk' THEN s.risk_class = 'high'
              WHEN 'ai_fria'      THEN s.fria_required
              WHEN 'ai_biometric' THEN s.emotion_or_biometric
              WHEN 'ai_deepfake'  THEN s.deepfake_or_public_text
              ELSE false
            END)
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
$$;
