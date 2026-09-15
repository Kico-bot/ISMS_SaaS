import type { ReportingRegime } from '@isms/shared';

/**
 * Meldefristen bei Sicherheitsvorfällen — die Fristenlogik liegt bewusst an genau einer Stelle.
 *
 * NIS2 (Richtlinie (EU) 2022/2555, Art. 23 Abs. 4), gerechnet ab Kenntnisnahme des erheblichen Vorfalls:
 *   a) Frühwarnung        unverzüglich, spätestens 24 Stunden
 *   b) Meldung            unverzüglich, spätestens 72 Stunden
 *   c) Zwischenbericht    nur auf Ersuchen des CSIRT — keine feste Frist
 *   d) Abschlussbericht   spätestens einen Monat nach der Meldung nach Buchstabe b
 *                         (nicht nach Kenntnisnahme — ein häufiger Fehler)
 *   e) dauert der Vorfall zum Zeitpunkt d) noch an: Fortschrittsbericht, Abschlussbericht dann
 *      einen Monat nach Abschluss der Behandlung
 *
 * DSGVO (VO (EU) 2016/679):
 *   Art. 33  Meldung an die Aufsichtsbehörde binnen 72 Stunden nach Bekanntwerden
 *   Art. 34  Benachrichtigung betroffener Personen unverzüglich, sofern hohes Risiko — ohne feste Frist
 */

export interface DeadlineSpec {
  regime: ReportingRegime;
  dueAt: Date | null;
  authority: string;
  note: string;
}

const HOURS = 3_600_000;

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * HOURS);
}

/** Kalendermonat, nicht 30 Tage — „einen Monat nach“ meint denselben Tag im Folgemonat. */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Überlauf abfangen: 31.01. + 1 Monat = 28./29.02., nicht 03.03.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

/** Fristen einer Datenpanne nach DSGVO ab dem Zeitpunkt des Bekanntwerdens. */
export function gdprDeadlines(confirmedAt: Date, highRiskForIndividuals: boolean): DeadlineSpec[] {
  const specs: DeadlineSpec[] = [
    {
      regime: 'gdpr_art33',
      dueAt: addHours(confirmedAt, 72),
      authority: 'Zuständige Datenschutz-Aufsichtsbehörde',
      note: 'Art. 33 DSGVO: Meldung binnen 72 Stunden nach Bekanntwerden. Später ist eine Begründung der Verzögerung beizufügen.',
    },
  ];
  if (highRiskForIndividuals) {
    specs.push({
      regime: 'gdpr_art34',
      dueAt: null,
      authority: 'Betroffene Personen',
      note: 'Art. 34 DSGVO: unverzügliche Benachrichtigung, da voraussichtlich hohes Risiko für die Rechte und Freiheiten.',
    });
  }
  return specs;
}

/** Fristen eines erheblichen Sicherheitsvorfalls nach NIS2 ab Kenntnisnahme. */
export function nis2Deadlines(knownAt: Date): DeadlineSpec[] {
  const notification72h = addHours(knownAt, 72);
  return [
    {
      regime: 'nis2_early_warning_24h',
      dueAt: addHours(knownAt, 24),
      authority: 'CSIRT bzw. zuständige Behörde (BSI)',
      note: 'Art. 23 Abs. 4 a) NIS2: Frühwarnung binnen 24 Stunden, mit Hinweis auf mögliche Rechtswidrigkeit oder grenzüberschreitende Wirkung.',
    },
    {
      regime: 'nis2_notification_72h',
      dueAt: notification72h,
      authority: 'CSIRT bzw. zuständige Behörde (BSI)',
      note: 'Art. 23 Abs. 4 b) NIS2: Meldung binnen 72 Stunden, mit erster Bewertung von Schweregrad, Auswirkungen und Kompromittierungsindikatoren.',
    },
    {
      regime: 'nis2_progress',
      dueAt: null,
      authority: 'CSIRT bzw. zuständige Behörde (BSI)',
      note: 'Art. 23 Abs. 4 c) NIS2: Zwischenbericht nur auf Ersuchen — keine gesetzliche Frist.',
    },
    {
      regime: 'nis2_final_1m',
      // Solange die 72-Stunden-Meldung nicht abgesetzt ist, gilt der spätestmögliche Zeitpunkt als Planwert.
      dueAt: addMonths(notification72h, 1),
      authority: 'CSIRT bzw. zuständige Behörde (BSI)',
      note: 'Art. 23 Abs. 4 d) NIS2: Abschlussbericht spätestens einen Monat nach der 72-Stunden-Meldung. Dauert der Vorfall noch an, zunächst Fortschrittsbericht (Buchstabe e).',
    },
  ];
}

/**
 * Nach dem Absetzen der 72-Stunden-Meldung steht der tatsächliche Fristbeginn für den
 * Abschlussbericht fest — die Frist wird dann auf diesen Zeitpunkt neu gerechnet.
 */
export function finalReportDueFrom(notificationFulfilledAt: Date): Date {
  return addMonths(notificationFulfilledAt, 1);
}

export const REGIME_LABEL: Record<ReportingRegime, string> = {
  gdpr_art33: 'DSGVO Art. 33 — Meldung an Aufsichtsbehörde',
  gdpr_art34: 'DSGVO Art. 34 — Benachrichtigung Betroffener',
  nis2_early_warning_24h: 'NIS2 — Frühwarnung (24 h)',
  nis2_notification_72h: 'NIS2 — Meldung (72 h)',
  nis2_progress: 'NIS2 — Zwischenbericht (auf Ersuchen)',
  nis2_final_1m: 'NIS2 — Abschlussbericht (1 Monat)',
};
