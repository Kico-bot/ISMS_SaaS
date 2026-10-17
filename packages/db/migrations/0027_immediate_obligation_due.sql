-- Pflichten „unverzüglich“ (Art. 34 DSGVO, Art. 26 Abs. 5 AI Act) tragen ab jetzt den auslösenden
-- Zeitpunkt als Fälligkeit. Ältere Zeilen ohne Fälligkeit fielen sonst weiter aus Fristenliste,
-- Monitor und Erinnerung heraus. Gesetzt wird nur, was leer ist.
-- Vergleich als Text: alle Migrationen laufen in einer Transaktion, und ein Enum-Wert, der in
-- derselben Transaktion hinzukam (`ai_provider_notice`), darf dort nicht als Literal stehen.
UPDATE reporting_obligation ro
SET due_at = i.breach_confirmed_at
FROM incident i
WHERE i.id = ro.incident_id
  AND ro.regime::text = 'gdpr_art34'
  AND ro.due_at IS NULL
  AND i.breach_confirmed_at IS NOT NULL;
--> statement-breakpoint
UPDATE reporting_obligation ro
SET due_at = i.ai_serious_at
FROM incident i
WHERE i.id = ro.incident_id
  AND ro.regime::text = 'ai_provider_notice'
  AND ro.due_at IS NULL
  AND i.ai_serious_at IS NOT NULL;
