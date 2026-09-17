-- ============================================================================================
-- 0002 · Bewertbare Anforderungen und ihre Gruppierung
--
-- Bewertbar ist, was ein Blatt im Anforderungsbaum ist: ISO-Unterklauseln (4.1, 5.2 …) und
-- Annex-A-Controls, BSI-Anforderungen (ORP.4.A1), EU-Artikel bzw. deren Absätze. Übergeordnete
-- Knoten (Kapitel "6", Anhang "A", Baustein "ORP.4") gliedern nur und werden nicht bewertet —
-- sonst zählte dieselbe Anforderung mehrfach in die Abdeckung.
--
-- Die Gruppe für Spider-Charts/Reifegrad-Aggregation ist der direkte Elternteil des Blatts:
-- A.5.17 → A.5, 4.1 → 4, ORP.4.A1 → ORP.4, Art. 21 Abs. 2 j) → Art. 21.
-- ============================================================================================

CREATE VIEW v_assessable_requirement AS
SELECT
  r.id,
  r.framework_id,
  r.parent_id,
  r.ref_code,
  r.title,
  r.kind,
  r.level,
  r.domain,
  r.path,
  r.sort_order,
  COALESCE(p.id, r.id)                 AS group_id,
  COALESCE(p.ref_code, r.ref_code)     AS group_ref_code,
  COALESCE(p.title, r.title)           AS group_title,
  COALESCE(p.sort_order, r.sort_order) AS group_sort_order
FROM requirement r
LEFT JOIN requirement p ON p.id = r.parent_id
WHERE NOT EXISTS (SELECT 1 FROM requirement c WHERE c.parent_id = r.id);--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isms_app') THEN
    GRANT SELECT ON v_assessable_requirement TO isms_app;
  END IF;
END $$;
