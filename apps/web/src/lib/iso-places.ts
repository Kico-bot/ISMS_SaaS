/**
 * Wo die Suite einen ISO-27001-Normpunkt mit eigenem Register erfasst. Dieselbe Zuordnung wie in
 * docs/iso27001-abdeckung.md, hier als Sprungziel: Die Gap-Analyse zeigt bei jedem dieser Punkte,
 * wo die Aufzeichnung entsteht, die ein Auditor sehen will. Punkte ohne Eintrag werden allein über
 * die zugeordnete Maßnahme und ihren Nachweis belegt (die meisten technischen Controls).
 */
export interface IsoPlace {
  label: string;
  to: string;
}

const CONTEXT = (tab: string, label: string): IsoPlace => ({
  label: `Kontext & Ziele, ${label}`,
  to: `/context?tab=${tab}`,
});
const PLANNING = (tab: string, label: string): IsoPlace => ({
  label: `Kommunikation & Änderungen, ${label}`,
  to: `/planning?tab=${tab}`,
});
const COMPETENCE = (tab: string, label: string): IsoPlace => ({
  label: `Kompetenz & Schulung, ${label}`,
  to: `/competence?tab=${tab}`,
});
const PAGE = (to: string, label: string): IsoPlace => ({ label, to });

const RISKS = PAGE('/risks', 'Risikoregister');
const DOCUMENTS = PAGE('/documents', 'Dokumente');
const REVIEWS = PAGE('/reviews', 'Managementbewertung');
const AUDITS = PAGE('/audits', 'Auditprogramm');
const INCIDENTS = PAGE('/incidents', 'Sicherheitsvorfälle');
const CONTINUITY = PAGE('/continuity', 'Notfallplanung');
const ASSETS = PAGE('/assets', 'Asset-Inventar');

export const ISO_PLACES: Record<string, IsoPlace[]> = {
  '4.1': [CONTEXT('factors', 'PESTLE-Analyse')],
  '4.2': [CONTEXT('parties', 'Interessierte Parteien')],
  '4.3': [CONTEXT('scope', 'Geltungsbereich')],
  '5.1': [REVIEWS, DOCUMENTS],
  '5.2': [DOCUMENTS],
  '5.3': [PLANNING('org', 'Organigramm')],
  '6.1.1': [RISKS, CONTEXT('factors', 'PESTLE-Analyse')],
  '6.1.2': [RISKS],
  '6.1.3': [RISKS],
  '6.2': [CONTEXT('objectives', 'Ziele')],
  '6.3': [PLANNING('changes', 'Änderungsplanung')],
  '7.1': [REVIEWS],
  '7.2': [COMPETENCE('matrix', 'Qualifikationsmatrix')],
  '7.3': [COMPETENCE('trainings', 'Schulungen')],
  '7.4': [PLANNING('communication', 'Kommunikationsplan')],
  '7.5.1': [DOCUMENTS],
  '7.5.2': [DOCUMENTS],
  '7.5.3': [DOCUMENTS],
  '8.1': [PAGE('/measures', 'Maßnahmen'), PAGE('/deadlines', 'Fristen')],
  '8.2': [RISKS],
  '8.3': [RISKS],
  '9.1': [PAGE('/kpis', 'Kennzahlen')],
  '9.2.1': [AUDITS],
  '9.2.2': [AUDITS],
  '9.3.1': [REVIEWS],
  '9.3.2': [REVIEWS],
  '9.3.3': [REVIEWS],
  '10.1': [PAGE('/actions', 'Verbesserungen (KVP)')],
  '10.2': [PAGE('/findings', 'Feststellungen')],
  'A.5.1': [DOCUMENTS],
  'A.5.2': [PLANNING('org', 'Organigramm')],
  'A.5.3': [PAGE('/members', 'Mitglieder & Rollen')],
  'A.5.4': [REVIEWS],
  'A.5.5': [CONTEXT('parties', 'Interessierte Parteien')],
  'A.5.6': [CONTEXT('parties', 'Interessierte Parteien')],
  'A.5.7': [CONTEXT('factors', 'PESTLE-Analyse')],
  'A.5.9': [ASSETS],
  'A.5.12': [ASSETS],
  'A.5.24': [INCIDENTS],
  'A.5.25': [INCIDENTS],
  'A.5.26': [INCIDENTS],
  'A.5.27': [INCIDENTS],
  'A.5.28': [INCIDENTS],
  'A.5.29': [CONTINUITY],
  'A.5.30': [CONTINUITY],
  'A.5.35': [AUDITS],
  'A.6.3': [COMPETENCE('trainings', 'Schulungen')],
};
