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
