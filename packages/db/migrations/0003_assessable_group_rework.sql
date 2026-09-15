-- ============================================================================================
-- 0003 · Gruppierung bewertbarer Anforderungen für Spider-Charts und Reifegrad-Aggregation
--
-- Der direkte Elternteil (0002) ist als Gruppe zu fein: ISO-Kapitel 9 zerfiele in 9.1, 9.2, 9.3
-- und der Spider hätte 20 statt 11 Achsen. Die Gruppe ist deshalb der OBERSTE Vorfahre, der
-- selbst schon bewertbare Anforderungen direkt unter sich hat:
--   ISO   6.1.2 → 6 (Kapitel 6 hat mit 6.2/6.3 eigene Blätter)
--   ISO   A.5.17 → A.5 (Anhang "A" hat nur Container-Kinder, also eine Ebene tiefer)
--   BSI   ORP.4.A1 → ORP.4 (Schicht "ORP" hat nur Bausteine als Kinder)
--   NIS2  Art. 21 Abs. 2 j) → Kap. IV (das Kapitel hat mit Art. 20/22/23 eigene Blätter)
-- ============================================================================================

DROP VIEW IF EXISTS v_assessable_requirement;--> statement-breakpoint

CREATE VIEW v_assessable_requirement AS
WITH leaf AS (
  SELECT r.* FROM requirement r
  WHERE NOT EXISTS (SELECT 1 FROM requirement c WHERE c.parent_id = r.id)
),
-- Knoten, die mindestens eine bewertbare Anforderung direkt unter sich haben
group_node AS (
  SELECT DISTINCT p.id, p.path, p.ref_code, p.title, p.sort_order
  FROM requirement p
  WHERE EXISTS (SELECT 1 FROM leaf l WHERE l.parent_id = p.id)
)
SELECT
  l.id,
  l.framework_id,
  l.parent_id,
  l.ref_code,
  l.title,
  l.kind,
  l.level,
  l.domain,
  l.path,
  l.sort_order,
  COALESCE(g.id, l.id)                 AS group_id,
  COALESCE(g.ref_code, l.ref_code)     AS group_ref_code,
  COALESCE(g.title, l.title)           AS group_title,
  COALESCE(g.sort_order, l.sort_order) AS group_sort_order
FROM leaf l
LEFT JOIN LATERAL (
  SELECT gn.* FROM group_node gn
  WHERE gn.path OPERATOR(public.@>) l.path AND gn.id <> l.id
  ORDER BY nlevel(gn.path)   -- der oberste passende Vorfahre gewinnt
  LIMIT 1
) g ON true;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'isms_app') THEN
    GRANT SELECT ON v_assessable_requirement TO isms_app;
  END IF;
END $$;
