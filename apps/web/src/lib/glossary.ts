/*
 * Abkürzungen, die in der Oberfläche vorkommen, mit ihrer ausgeschriebenen Form.
 *
 * Das Info-Symbol (NormHint, AbbrHint) sucht im Text um sich herum nach diesen Kürzeln und zeigt
 * beim Überfahren, wofür sie stehen. Eine Abkürzung, die hier fehlt, bleibt unerklärt. Deshalb
 * gehört jede neue Abkürzung in der Oberfläche auch in diese Liste.
 */
export const GLOSSARY: Record<string, string> = {
  ISMS: 'Informationssicherheitsmanagementsystem',
  ISO: 'Internationale Organisation für Normung',
  IEC: 'Internationale Elektrotechnische Kommission',
  DIN: 'Deutsches Institut für Normung',
  SoA: 'Statement of Applicability, die Erklärung zur Anwendbarkeit nach ISO 27001',
  IT: 'Informationstechnik',
  IKT: 'Informations- und Kommunikationstechnik',
  KI: 'Künstliche Intelligenz',
  'AI Act': 'KI-Verordnung der EU, Verordnung (EU) 2024/1689',
  EU: 'Europäische Union',
  NIS2: 'EU-Richtlinie 2022/2555 für ein hohes gemeinsames Niveau der Cybersicherheit',
  BSI: 'Bundesamt für Sicherheit in der Informationstechnik',
  BSIG: 'Gesetz über das Bundesamt für Sicherheit in der Informationstechnik (BSI-Gesetz)',
  DSGVO: 'Datenschutz-Grundverordnung, Verordnung (EU) 2016/679',
  DSFA: 'Datenschutz-Folgenabschätzung nach Art. 35 DSGVO',
  DSB: 'Datenschutzbeauftragte Person',
  TOM: 'Technische und organisatorische Maßnahmen nach Art. 32 DSGVO',
  PbD: 'Personenbezogene Daten',
  CISO: 'Chief Information Security Officer, Leitung der Informationssicherheit',
  KVP: 'Kontinuierlicher Verbesserungsprozess',
  KPI: 'Key Performance Indicator, also eine Kennzahl',
  BIA: 'Business Impact Analyse, die Analyse der Auswirkungen eines Ausfalls auf das Geschäft',
  MTPD: 'Maximum Tolerable Period of Disruption: die längste Ausfallzeit, die das Geschäft verkraftet',
  RTO: 'Recovery Time Objective: bis wann der Prozess wieder laufen muss',
  RPO: 'Recovery Point Objective: wie viel Datenverlust höchstens tragbar ist, gemessen in Zeit',
  MFA: 'Mehr-Faktor-Authentisierung, also Anmeldung mit mindestens zwei Merkmalen',
  FRIA: 'Fundamental Rights Impact Assessment, Grundrechte-Folgenabschätzung nach Art. 27 AI Act',
  CE: 'Conformité Européenne, Kennzeichnung für Produkte, die EU-Vorgaben erfüllen',
  PESTLE:
    'Political, Economic, Social, Technological, Legal, Environmental: die sechs Blickwinkel der Umfeldanalyse',
  CSV: 'Comma Separated Values, eine Tabelle als Textdatei, die Excel öffnet',
  SMTP: 'Simple Mail Transfer Protocol, der Weg, auf dem E-Mails verschickt werden',
  SIEM: 'Security Information and Event Management, die zentrale Auswertung von Sicherheitsmeldungen',
  SSO: 'Single Sign-on, eine Anmeldung für mehrere Anwendungen',
  ORP: 'IT-Grundschutz-Schicht Organisation und Personal',
  CON: 'IT-Grundschutz-Schicht Konzepte und Vorgehensweisen',
  OPS: 'IT-Grundschutz-Schicht Betrieb',
  DER: 'IT-Grundschutz-Schicht Detektion und Reaktion',
  APP: 'IT-Grundschutz-Schicht Anwendungen',
  SYS: 'IT-Grundschutz-Schicht IT-Systeme',
  IND: 'IT-Grundschutz-Schicht Industrielle IT',
  NET: 'IT-Grundschutz-Schicht Netze und Kommunikation',
  INF: 'IT-Grundschutz-Schicht Infrastruktur',
  // Kap., Art., Abs. und Nr. stehen in fast jeder Normangabe und sind allgemein bekannt; sie in
  // jeder Blase zu erklären, wäre Lärm. „lit.“ kennt außerhalb von Rechtstexten kaum jemand.
  'lit.': 'littera, also Buchstabe (Gliederung in Rechtstexten)',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Längere Kürzel zuerst, damit „BSIG“ nicht als „BSI“ erkannt wird. Davor und dahinter darf kein
// Buchstabe stehen: „IT“ in „Mitarbeit“ ist keine Abkürzung.
const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const PATTERN = new RegExp(`(?<![\\p{L}\\p{N}])(${KEYS.map(escape).join('|')})(?![\\p{L}])`, 'gu');

/** Alle bekannten Abkürzungen im Text, in der Reihenfolge ihres ersten Auftretens. */
export function findAbbreviations(text: string): { abbr: string; meaning: string }[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(PATTERN)) seen.add(m[1]!);
  return [...seen].map((abbr) => ({ abbr, meaning: GLOSSARY[abbr]! }));
}
