import { LEAN } from './lean';

/**
 * Wo die Suite einen ISO-27001-Normpunkt mit eigenem Register erfasst. Dieselbe Zuordnung wie in
 * docs/iso27001-abdeckung.md, hier als Sprungziel: Die Gap-Analyse zeigt bei jedem dieser Punkte,
 * wo die Aufzeichnung entsteht, die ein Auditor sehen will. Punkte ohne Eintrag werden allein über
 * die zugeordnete Maßnahme und ihren Nachweis belegt (die meisten technischen Controls).
 *
 * Zwei Varianten, weil die schlanke Oberfläche Organigramm, Qualifikationsmatrix, Kennzahlen,
 * Fristen, Notfallpläne, Verbesserungen sowie Kommunikations- und Änderungsplan nicht zeigt: Dort zeigen die Sprungziele auf das sichtbare
 * Register, in dem derselbe Nachweis liegt, und tragen die Namen des schlanken Menüs.
 */
export interface IsoPlace {
  label: string;
  to: string;
}

const PAGE = (to: string, label: string): IsoPlace => ({ label, to });

function fullPlaces(): Record<string, IsoPlace[]> {
  const CONTEXT = (tab: string, label: string): IsoPlace => ({
    label: `Organisation & Kontext, ${label}`,
    to: `/context?tab=${tab}`,
  });
  const PLANNING = CONTEXT;
  const COMPETENCE = (tab: string, label: string): IsoPlace => ({
    label: `Personen & Schulung, ${label}`,
    to: `/competence?tab=${tab}`,
  });
  const RISKS = PAGE('/risks', 'Risikoregister');
  const DOCUMENTS = PAGE('/documents', 'Dokumente');
  const REVIEWS = PAGE('/reviews', 'Managementbewertung');
  const AUDITS = PAGE('/audits', 'Auditprogramm');
  const INCIDENTS = PAGE('/incidents', 'Sicherheitsvorfälle');
  const CONTINUITY = PAGE('/continuity', 'Notfallplanung');
  const ASSETS = PAGE('/assets', 'Asset-Inventar');
  const SUPPLIERS = PAGE('/assets?category=supplier', 'Asset-Inventar, Lieferanten');
  const ENV = CONTEXT('environment', 'Umfeld');

  return {
    '4.1': [ENV],
    '4.2': [ENV],
    '4.3': [CONTEXT('scope', 'Geltungsbereich')],
    '5.1': [REVIEWS, DOCUMENTS],
    '5.2': [DOCUMENTS],
    '5.3': [PLANNING('org', 'Organigramm')],
    '6.1.1': [RISKS, ENV],
    '6.1.2': [RISKS],
    '6.1.3': [RISKS],
    '6.2': [CONTEXT('objectives', 'Ziele')],
    '6.3': [PLANNING('changes', 'Änderungen')],
    '7.1': [REVIEWS],
    '7.2': [COMPETENCE('matrix', 'Qualifikationsmatrix')],
    '7.3': [COMPETENCE('trainings', 'Schulungen')],
    '7.4': [PLANNING('communication', 'Kommunikation')],
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
    'A.5.5': [ENV],
    'A.5.6': [ENV],
    'A.5.7': [ENV],
    'A.5.9': [ASSETS],
    'A.5.12': [ASSETS],
    'A.5.19': [SUPPLIERS],
    'A.5.20': [SUPPLIERS],
    'A.5.21': [SUPPLIERS],
    'A.5.22': [SUPPLIERS],
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
}

function leanPlaces(): Record<string, IsoPlace[]> {
  // Organisation und Team & Schulung sind schlank je eine Seite ohne Unterreiter.
  const ORG = (block: string): IsoPlace => ({ label: `Planen, Organisation, ${block}`, to: '/context' });
  const TEAM = PAGE('/competence', 'Betreiben, Team & Schulung');
  const SCOPE = ORG('Geltungsbereich');
  const TOPICS = ORG('Themen von außen und innen');
  const PARTIES = ORG('Interessierte Parteien');
  const OBJECTIVES = ORG('Ziele');
  const RISKS = PAGE('/risks', 'Planen, Risiken');
  const MEASURES = PAGE('/measures', 'Planen, Maßnahmen');
  const ASSETS = PAGE('/assets', 'Betreiben, Assets');
  const DOCUMENTS = PAGE('/documents', 'Betreiben, Richtlinien');
  const INCIDENTS = PAGE('/incidents', 'Betreiben, Vorfälle');
  const AUDITS = PAGE('/audits', 'Prüfen, Audits');
  const FINDINGS = PAGE('/findings', 'Prüfen, Feststellungen');
  const REVIEWS = PAGE('/reviews', 'Prüfen, Managementbewertung');
  const MEMBERS = PAGE('/members', 'Einstellungen, Mitglieder & Rollen');
  const SUPPLIERS = PAGE('/assets?category=supplier', 'Betreiben, Assets, Lieferanten');

  return {
    '4.1': [TOPICS],
    '4.2': [PARTIES],
    '4.3': [SCOPE],
    '5.1': [REVIEWS, DOCUMENTS],
    '5.2': [DOCUMENTS],
    // Rollen und Verantwortlichkeiten als Richtlinie (Vorlage), die Rechte unter Mitglieder & Rollen.
    '5.3': [DOCUMENTS],
    '6.1.1': [RISKS, TOPICS],
    '6.1.2': [RISKS],
    '6.1.3': [RISKS],
    '6.2': [OBJECTIVES],
    // Geplante Änderungen sind schlank Maßnahmen, der Kommunikationsplan eine Richtlinie.
    '6.3': [MEASURES],
    '7.1': [REVIEWS],
    '7.2': [TEAM],
    '7.3': [TEAM],
    '7.4': [DOCUMENTS],
    '7.5.1': [DOCUMENTS],
    '7.5.2': [DOCUMENTS],
    '7.5.3': [DOCUMENTS],
    '8.1': [MEASURES],
    '8.2': [RISKS],
    '8.3': [RISKS],
    '9.1': [REVIEWS],
    '9.2.1': [AUDITS],
    '9.2.2': [AUDITS],
    '9.3.1': [REVIEWS],
    '9.3.2': [REVIEWS],
    '9.3.3': [REVIEWS],
    // Korrekturmaßnahmen hängen schlank an der Feststellung.
    '10.1': [FINDINGS],
    '10.2': [FINDINGS],
    'A.5.1': [DOCUMENTS],
    'A.5.2': [DOCUMENTS, MEMBERS],
    'A.5.3': [MEMBERS],
    'A.5.4': [REVIEWS],
    'A.5.5': [PARTIES],
    'A.5.6': [PARTIES],
    'A.5.7': [TOPICS],
    'A.5.9': [ASSETS],
    'A.5.12': [ASSETS],
    'A.5.19': [SUPPLIERS],
    'A.5.20': [SUPPLIERS],
    'A.5.21': [SUPPLIERS],
    'A.5.22': [SUPPLIERS],
    'A.5.24': [INCIDENTS],
    'A.5.25': [INCIDENTS],
    'A.5.26': [INCIDENTS],
    'A.5.27': [INCIDENTS],
    'A.5.28': [INCIDENTS],
    // Der Notfallplan ist schlank eine Richtlinie; Prozess und BIA bleiben unter /continuity.
    'A.5.29': [DOCUMENTS],
    'A.5.30': [DOCUMENTS],
    'A.5.35': [AUDITS],
    'A.6.3': [TEAM],
  };
}

export const isoPlaces = (lean: boolean): Record<string, IsoPlace[]> => (lean ? leanPlaces() : fullPlaces());

export const ISO_PLACES = isoPlaces(LEAN);
