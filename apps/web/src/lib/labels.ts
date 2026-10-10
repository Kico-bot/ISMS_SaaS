/**
 * Deutsche Beschriftungen der Domänen-Enums. Liegen zentral, damit dieselbe Kategorie
 * nicht auf einer Seite „Aufsicht“ und auf der nächsten „regulator“ heißt.
 */
export const PARTY_CATEGORY_LABEL: Record<string, string> = {
  customer: 'Kunden',
  supplier: 'Lieferanten',
  regulator: 'Aufsicht',
  owner: 'Eigentümer',
  employee: 'Beschäftigte',
  partner: 'Partner',
  public: 'Öffentlichkeit',
  internal: 'Intern',
  other: 'Sonstige',
};

export const PESTLE_DIMENSION_LABEL: Record<string, string> = {
  political: 'Politisch',
  economic: 'Wirtschaftlich',
  social: 'Gesellschaftlich',
  technological: 'Technologisch',
  legal: 'Rechtlich',
  environmental: 'Ökologisch',
};

export const OBJECTIVE_STATUS_LABEL: Record<string, string> = {
  draft: 'Entwurf',
  active: 'Verabschiedet',
  at_risk: 'Gefährdet',
  achieved: 'Erreicht',
  missed: 'Verfehlt',
};

export const RELEVANCE_LABEL: Record<number, string> = { 1: 'gering', 2: 'mittel', 3: 'hoch' };

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

/** Stufe einer Grundschutz-Anforderung (Kompendium: B, S, H). */
export const REQUIREMENT_LEVEL_LABEL: Record<string, string> = {
  basis: 'Basis',
  standard: 'Standard',
  erhoeht: 'erhöht',
};

export const PROTECTION_VARIANT_LABEL: Record<string, string> = {
  basis: 'Basis-Absicherung',
  standard: 'Standard-Absicherung',
  kern: 'Kern-Absicherung',
};

/** Umsetzung im IT-Grundschutz-Check — abgeleitet aus den Maßnahmen, nicht gepflegt. */
export const BSI_CHECK_LABEL: Record<string, string> = {
  yes: 'ja',
  partial: 'teilweise',
  no: 'nein',
  dispensable: 'entbehrlich',
};

// --- KI-Register (AI Act, nur Betreiber) -----------------------------------------------------
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
  critical_infrastructure: 'Kritische Infrastruktur, z. B. Netzführung (Nr. 2)',
  education: 'Bildung und Ausbildung (Nr. 3)',
  employment: 'Beschäftigung, Personalauswahl, Leistungsbewertung (Nr. 4)',
  essential_services: 'Grundlegende Dienste, z. B. Kreditwürdigkeit, Versicherung (Nr. 5)',
  law_enforcement: 'Strafverfolgung (Nr. 6)',
  migration: 'Migration, Asyl, Grenzkontrolle (Nr. 7)',
  justice_democracy: 'Justiz und demokratische Prozesse (Nr. 8)',
};

export const AI_PROHIBITED_LABEL: Record<string, string> = {
  manipulation: 'Unterschwellige oder täuschende Beeinflussung von Menschen (Art. 5 Abs. 1 a)',
  exploitation_of_vulnerabilities: 'Ausnutzen von Schwächen wegen Alter, Behinderung oder sozialer Lage (b)',
  social_scoring: 'Bewertung des sozialen Verhaltens — Social Scoring (c)',
  predictive_policing_profiling: 'Straftatprognose allein aus Profiling (d)',
  facial_image_scraping: 'Ungezieltes Auslesen von Gesichtsbildern für Datenbanken (e)',
  emotion_recognition_work_education: 'Emotionserkennung am Arbeitsplatz oder in der Bildung (f)',
  biometric_categorisation_sensitive: 'Biometrische Kategorisierung nach sensiblen Merkmalen (g)',
  realtime_remote_biometric_id: 'Biometrische Echtzeit-Fernidentifizierung im öffentlichen Raum (h)',
};
