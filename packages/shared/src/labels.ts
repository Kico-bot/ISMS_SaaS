/**
 * Deutsche Beschriftungen für die Enum-Werte.
 *
 * Die Enums selbst sind englisch — das ist Absprache für Code und Datenbank. Alles, was ein
 * Mensch liest, ist deutsch, und zwar an einer Stelle: Ausleitungen für Auditoren und die
 * Oberfläche sollen dieselben Wörter verwenden. Ein Risiko mit dem Status „accepted“ in einer
 * CSV, die einer Aufsichtsbehörde vorgelegt wird, ist ein vermeidbarer Stolperstein.
 */

export const RISK_KIND_LABEL: Record<string, string> = {
  risk: 'Risiko',
  opportunity: 'Chance',
};

export const RISK_STATUS_LABEL: Record<string, string> = {
  identified: 'identifiziert',
  assessed: 'bewertet',
  treated: 'behandelt',
  monitored: 'überwacht',
  accepted: 'akzeptiert',
  closed: 'geschlossen',
};

export const RISK_TREATMENT_LABEL: Record<string, string> = {
  mitigate: 'vermindern',
  accept: 'akzeptieren',
  transfer: 'übertragen',
  avoid: 'vermeiden',
};

export const RISK_SOURCE_LABEL: Record<string, string> = {
  manual: 'manuell erfasst',
  pestle: 'aus der Kontextanalyse',
  incident: 'aus einem Vorfall',
  audit: 'aus einem Audit',
  supplier: 'aus der Lieferkette',
  siem: 'aus dem SIEM',
  dpia: 'aus einer Folgenabschätzung',
};

export const MEASURE_STATUS_LABEL: Record<string, string> = {
  planned: 'geplant',
  in_progress: 'in Umsetzung',
  implemented: 'umgesetzt',
  verified: 'verifiziert',
  not_applicable: 'nicht anwendbar',
};

export const CONTROL_DOMAIN_LABEL: Record<string, string> = {
  organizational: 'organisatorisch',
  people: 'personenbezogen',
  physical: 'physisch',
  technological: 'technologisch',
};

export const COVERAGE_LABEL: Record<string, string> = {
  full: 'vollständig',
  partial: 'teilweise',
};

export const MAPPING_ORIGIN_LABEL: Record<string, string> = {
  manual: 'manuell',
  crosswalk: 'aus dem Crosswalk',
  import: 'importiert',
  template: 'aus einer Vorlage',
};

export const APPLICABILITY_LABEL: Record<string, string> = {
  applicable: 'anwendbar',
  not_applicable: 'nicht anwendbar',
  planned: 'geplant',
};

/** Stufe einer Grundschutz-Anforderung (Kompendium: B, S, H). */
export const REQUIREMENT_LEVEL_LABEL: Record<string, string> = {
  basis: 'Basis',
  standard: 'Standard',
  erhoeht: 'erhöhter Schutzbedarf',
};

export const PROTECTION_VARIANT_LABEL: Record<string, string> = {
  basis: 'Basis-Absicherung',
  standard: 'Standard-Absicherung',
  kern: 'Kern-Absicherung',
};

/**
 * Umsetzungsstatus im IT-Grundschutz-Check, mit dem Vokabular des BSI. Er wird nicht gepflegt,
 * sondern aus den zugeordneten Maßnahmen abgeleitet (`checkStatusSql`).
 */
export const BSI_CHECK_LABEL: Record<string, string> = {
  yes: 'ja',
  partial: 'teilweise',
  no: 'nein',
  dispensable: 'entbehrlich',
};

export const CLASSIFICATION_LABEL: Record<string, string> = {
  public: 'öffentlich',
  internal: 'intern',
  confidential: 'vertraulich',
  strictly_confidential: 'streng vertraulich',
};

export const ASSET_TYPE_LABEL: Record<string, string> = {
  primary: 'primär',
  supporting: 'unterstützend',
};

export const ASSET_CATEGORY_LABEL: Record<string, string> = {
  information: 'Information',
  process: 'Prozess',
  application: 'Anwendung',
  system: 'System',
  network: 'Netz',
  hardware: 'Hardware',
  site: 'Standort',
  person: 'Person',
  supplier: 'Lieferant',
  other: 'Sonstiges',
};

export const ASSET_STATUS_LABEL: Record<string, string> = {
  active: 'aktiv',
  retired: 'ausgemustert',
};

export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  policy: 'Richtlinie',
  procedure: 'Verfahrensanweisung',
  work_instruction: 'Arbeitsanweisung',
  record: 'Aufzeichnung',
  evidence: 'Nachweis',
  other: 'Sonstiges',
};

export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  in_review: 'in Prüfung',
  published: 'veröffentlicht',
  retired: 'zurückgezogen',
};

export const SEVERITY_LABEL: Record<string, string> = {
  low: 'niedrig',
  medium: 'mittel',
  high: 'hoch',
  critical: 'kritisch',
};

export const INCIDENT_CATEGORY_LABEL: Record<string, string> = {
  malware: 'Schadsoftware',
  phishing: 'Phishing',
  data_loss: 'Datenverlust',
  availability: 'Verfügbarkeit',
  unauthorized_access: 'unbefugter Zugriff',
  physical: 'physischer Vorfall',
  supplier: 'Lieferant',
  other: 'Sonstiges',
};

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  new: 'neu',
  triage: 'in Ersteinschätzung',
  contained: 'eingedämmt',
  resolved: 'behoben',
  closed: 'abgeschlossen',
};

export const INCIDENT_SOURCE_LABEL: Record<string, string> = {
  manual: 'manuell gemeldet',
  siem: 'aus dem SIEM',
  email: 'per E-Mail',
  monitoring: 'aus der Überwachung',
  external: 'von außen gemeldet',
  other: 'Sonstiges',
};

export const REPORTING_REGIME_LABEL: Record<string, string> = {
  gdpr_art33: 'Meldung an die Aufsichtsbehörde (Art. 33 DSGVO)',
  gdpr_art34: 'Benachrichtigung der Betroffenen (Art. 34 DSGVO)',
  nis2_early_warning_24h: 'Frühwarnung nach 24 Stunden (NIS2 Art. 23)',
  nis2_notification_72h: 'Meldung nach 72 Stunden (NIS2 Art. 23)',
  nis2_progress: 'Zwischenbericht (NIS2 Art. 23)',
  nis2_final_1m: 'Abschlussbericht nach 1 Monat (NIS2 Art. 23)',
  ai_provider_notice: 'Anbieter informieren (AI Act Art. 26 Abs. 5)',
  ai_authority_report: 'Meldung an die Marktüberwachungsbehörde (AI Act Art. 73)',
};

export const AI_RISK_CLASS_LABEL: Record<string, string> = {
  prohibited: 'verboten',
  high: 'Hochrisiko',
  limited: 'Transparenzpflicht',
  minimal: 'minimales Risiko',
};

export const AI_SYSTEM_STATUS_LABEL: Record<string, string> = {
  draft: 'in Vorbereitung',
  active: 'im Einsatz',
  retired: 'stillgelegt',
};

export const AI_ANNEX_III_LABEL: Record<string, string> = {
  biometrics: 'Biometrie (Anhang III Nr. 1)',
  critical_infrastructure: 'Kritische Infrastruktur (Nr. 2)',
  education: 'Bildung und Ausbildung (Nr. 3)',
  employment: 'Beschäftigung und Personalmanagement (Nr. 4)',
  essential_services: 'Grundlegende private und öffentliche Dienste (Nr. 5)',
  law_enforcement: 'Strafverfolgung (Nr. 6)',
  migration: 'Migration, Asyl, Grenzkontrolle (Nr. 7)',
  justice_democracy: 'Justiz und demokratische Prozesse (Nr. 8)',
};

export const AI_PROHIBITED_LABEL: Record<string, string> = {
  manipulation: 'Unterschwellige oder täuschende Beeinflussung (Art. 5 Abs. 1 a)',
  exploitation_of_vulnerabilities: 'Ausnutzen von Schwächen wegen Alter, Behinderung, Lage (b)',
  social_scoring: 'Bewertung des sozialen Verhaltens, sogenanntes Social Scoring (c)',
  predictive_policing_profiling: 'Straftatprognose allein aus Profiling (d)',
  facial_image_scraping: 'Ungezieltes Auslesen von Gesichtsbildern (e)',
  emotion_recognition_work_education: 'Emotionserkennung am Arbeitsplatz oder in Bildung (f)',
  biometric_categorisation_sensitive: 'Biometrische Kategorisierung nach sensiblen Merkmalen (g)',
  realtime_remote_biometric_id: 'Biometrische Echtzeit-Fernidentifizierung im öffentlichen Raum (h)',
};

export const FINDING_SEVERITY_LABEL: Record<string, string> = {
  observation: 'Beobachtung',
  minor: 'Nebenabweichung',
  major: 'Hauptabweichung',
};

export const FINDING_STATUS_LABEL: Record<string, string> = {
  open: 'offen',
  in_progress: 'in Bearbeitung',
  closed: 'geschlossen',
  verified: 'Schließung bestätigt',
};

export const FINDING_SOURCE_LABEL: Record<string, string> = {
  audit: 'internes oder externes Audit',
  self_assessment: 'Selbstbewertung',
  incident: 'Vorfall',
  management_review: 'Managementbewertung',
  supplier: 'Lieferant',
  other: 'Sonstiges',
};

export const ACTION_KIND_LABEL: Record<string, string> = {
  corrective: 'Korrekturmaßnahme',
  preventive: 'Vorbeugemaßnahme',
  improvement: 'Verbesserung',
};

export const ACTION_STATUS_LABEL: Record<string, string> = {
  open: 'offen',
  in_progress: 'in Bearbeitung',
  done: 'erledigt',
  verified: 'Wirksamkeit bestätigt',
  rejected: 'verworfen',
};

export const AUDIT_KIND_LABEL: Record<string, string> = {
  internal: 'internes Audit',
  external: 'externes Audit',
  certification: 'Zertifizierungsaudit',
  surveillance: 'Überwachungsaudit',
  supplier: 'Lieferantenaudit',
};

export const AUDIT_STATUS_LABEL: Record<string, string> = {
  planned: 'geplant',
  in_progress: 'in Durchführung',
  reported: 'berichtet',
  closed: 'abgeschlossen',
};

export const PROCESSING_ROLE_LABEL: Record<string, string> = {
  controller: 'Verantwortlicher',
  processor: 'Auftragsverarbeiter',
  joint: 'gemeinsam verantwortlich',
};

export const LEGAL_BASIS_LABEL: Record<string, string> = {
  art6_1a: 'Einwilligung (Art. 6 Abs. 1 lit. a)',
  art6_1b: 'Vertrag (Art. 6 Abs. 1 lit. b)',
  art6_1c: 'Rechtliche Pflicht (Art. 6 Abs. 1 lit. c)',
  art6_1d: 'Lebenswichtige Interessen (Art. 6 Abs. 1 lit. d)',
  art6_1e: 'Öffentliches Interesse (Art. 6 Abs. 1 lit. e)',
  art6_1f: 'Berechtigtes Interesse (Art. 6 Abs. 1 lit. f)',
  art9_2a: 'Ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a)',
  art9_2b: 'Arbeitsrecht oder Sozialrecht (Art. 9 Abs. 2 lit. b)',
  art9_2h: 'Gesundheitsvorsorge (Art. 9 Abs. 2 lit. h)',
  other: 'andere Grundlage',
};

export const PROCESSING_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  active: 'aktiv',
  retired: 'außer Betrieb',
};

export const DPIA_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  in_review: 'zur Stellungnahme vorgelegt',
  approved: 'abgeschlossen',
};

export const DPIA_RESULT_LABEL: Record<string, string> = {
  approved: 'zulässig',
  approved_with_measures: 'zulässig unter Auflagen',
  rejected: 'nicht zulässig',
};

export const OBJECTIVE_KIND_LABEL: Record<string, string> = {
  strategic: 'strategisch',
  operational: 'operativ',
};

export const OBJECTIVE_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  active: 'aktiv',
  at_risk: 'gefährdet',
  achieved: 'erreicht',
  missed: 'verfehlt',
};

export const PARTY_CATEGORY_LABEL: Record<string, string> = {
  customer: 'Kundschaft',
  supplier: 'Lieferant',
  regulator: 'Aufsicht',
  owner: 'Eigentümer',
  employee: 'Beschäftigte',
  partner: 'Partner',
  public: 'Öffentlichkeit',
  internal: 'intern',
  other: 'Sonstiges',
};

export const PESTLE_DIMENSION_LABEL: Record<string, string> = {
  political: 'politisch',
  economic: 'wirtschaftlich',
  social: 'gesellschaftlich',
  technological: 'technologisch',
  legal: 'rechtlich',
  environmental: 'ökologisch',
};

export const PESTLE_EFFECT_LABEL: Record<string, string> = {
  risk: 'Risiko',
  opportunity: 'Chance',
};

export const TRAINING_KIND_LABEL: Record<string, string> = {
  awareness: 'Awareness',
  nis2_management: 'NIS2-Leitungsschulung',
  phishing: 'Phishing-Simulation',
  onboarding: 'Einarbeitung',
  other: 'Sonstiges',
};

export const BIA_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  approved: 'freigegeben',
};

export const PLAN_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  active: 'aktiv',
  archived: 'archiviert',
};

export const BC_EXERCISE_KIND_LABEL: Record<string, string> = {
  tabletop: 'Planbesprechung',
  walkthrough: 'Durchsprache',
  simulation: 'Simulation',
  failover: 'Umschaltung',
  real_event: 'Ernstfall',
};

export const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  invited: 'eingeladen',
  active: 'aktiv',
  suspended: 'gesperrt',
};

export const AUDIT_LOG_ACTION_LABEL: Record<string, string> = {
  create: 'angelegt',
  update: 'geändert',
  delete: 'gelöscht',
  approve: 'freigegeben',
  login: 'angemeldet',
  logout: 'abgemeldet',
  export: 'ausgeleitet',
};

export const CHANGE_PLAN_STATUS_LABEL: Record<string, string> = {
  planned: 'geplant',
  approved: 'freigegeben',
  in_progress: 'in Umsetzung',
  done: 'umgesetzt',
  rejected: 'verworfen',
};

export const ORG_NODE_KIND_LABEL: Record<string, string> = {
  unit: 'Organisationseinheit',
  location: 'Standort',
  person: 'Stelle (besetzt)',
  vacancy: 'Stelle (unbesetzt)',
};
