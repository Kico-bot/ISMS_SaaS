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
