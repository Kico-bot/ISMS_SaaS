-- ============================================================================================
-- 0012 · Eine Risikobewertung statt zwei
--
-- Bisher trug jedes Risiko eine inhärente (vor Maßnahmen) und eine Restrisiko-Bewertung (nach
-- Maßnahmen). Übernommen wird der aktuellere Stand: das Restrisiko, wo es bewertet ist, sonst die
-- inhärente Bewertung. Die Historie in risk_assessment bleibt vollständig erhalten.
-- Eine erteilte Übernahme bleibt gültig, wenn sie sich auf genau diese Werte bezog.
-- ============================================================================================
UPDATE risk SET
  likelihood = COALESCE(residual_likelihood, inherent_likelihood),
  impact     = COALESCE(residual_impact, inherent_impact);
