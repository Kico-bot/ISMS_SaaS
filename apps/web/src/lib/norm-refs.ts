/*
 * Normbezüge für die Kurzhilfen in der Oberfläche.
 *
 * ERZEUGT — nicht von Hand ändern. Quelle: packages/catalog/data, Erzeugung:
 *   node apps/web/scripts/build-norm-refs.mjs
 *
 * Enthalten sind ausschließlich Referenz und Kurztitel. Der Normtext selbst steht bewusst
 * nirgends in der Anwendung (DIN-Urheberrecht) — und eine Kurzhilfe, die eine halbe Seite
 * Normtext aufklappt, liest ohnehin niemand.
 */
export interface NormRef {
  framework: string;
  clause: string;
  title: string;
}

export const NORM_REF = {
  'iso:4.1': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 4.1',
    title: 'Verstehen der Organisation und ihres Kontextes',
  },
  'iso:4.2': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 4.2',
    title: 'Verstehen der Erfordernisse und Erwartungen interessierter Parteien',
  },
  'iso:4.3': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 4.3',
    title: 'Festlegen des Anwendungsbereichs des Informationssicherheitsmanagementsystems',
  },
  'iso:5.2': { framework: 'ISO 27001:2022', clause: 'Kap. 5.2', title: 'Politik' },
  'iso:5.3': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 5.3',
    title: 'Rollen, Verantwortlichkeiten und Befugnisse in der Organisation',
  },
  'iso:6.1.2': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 6.1.2',
    title: 'Informationssicherheitsrisikobeurteilung',
  },
  'iso:6.1.3': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 6.1.3',
    title: 'Informationssicherheitsrisikobehandlung',
  },
  'iso:6.2': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 6.2',
    title: 'Informationssicherheitsziele und Planung zu deren Erreichung',
  },
  'iso:6.3': { framework: 'ISO 27001:2022', clause: 'Kap. 6.3', title: 'Planung von Änderungen' },
  'iso:7.1': { framework: 'ISO 27001:2022', clause: 'Kap. 7.1', title: 'Ressourcen' },
  'iso:7.2': { framework: 'ISO 27001:2022', clause: 'Kap. 7.2', title: 'Kompetenz' },
  'iso:7.3': { framework: 'ISO 27001:2022', clause: 'Kap. 7.3', title: 'Bewusstsein' },
  'iso:7.4': { framework: 'ISO 27001:2022', clause: 'Kap. 7.4', title: 'Kommunikation' },
  'iso:7.5': { framework: 'ISO 27001:2022', clause: 'Kap. 7.5', title: 'Dokumentierte Information' },
  'iso:8.2': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 8.2',
    title: 'Informationssicherheitsrisikobeurteilung',
  },
  'iso:8.3': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 8.3',
    title: 'Informationssicherheitsrisikobehandlung',
  },
  'iso:9.1': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 9.1',
    title: 'Überwachung, Messung, Analyse und Bewertung',
  },
  'iso:9.2': { framework: 'ISO 27001:2022', clause: 'Kap. 9.2', title: 'Internes Audit' },
  'iso:9.3': { framework: 'ISO 27001:2022', clause: 'Kap. 9.3', title: 'Managementbewertung' },
  'iso:10.1': { framework: 'ISO 27001:2022', clause: 'Kap. 10.1', title: 'Fortlaufende Verbesserung' },
  'iso:10.2': {
    framework: 'ISO 27001:2022',
    clause: 'Kap. 10.2',
    title: 'Nichtkonformität und Korrekturmaßnahmen',
  },
  'iso:A.5.1': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.1',
    title: 'Informationssicherheitspolitik und -richtlinien',
  },
  'iso:A.5.9': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.9',
    title: 'Inventar der Informationen und anderen damit verbundenen Werte',
  },
  'iso:A.5.10': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.10',
    title: 'Zulässiger Gebrauch von Informationen und anderen damit verbundenen Werten',
  },
  'iso:A.5.12': { framework: 'ISO 27001:2022', clause: 'A.5.12', title: 'Klassifizierung von Informationen' },
  'iso:A.5.16': { framework: 'ISO 27001:2022', clause: 'A.5.16', title: 'Identitätsmanagement' },
  'iso:A.5.17': { framework: 'ISO 27001:2022', clause: 'A.5.17', title: 'Authentisierungsinformationen' },
  'iso:A.5.19': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.19',
    title: 'Informationssicherheit in Lieferantenbeziehungen',
  },
  'iso:A.5.24': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.24',
    title: 'Planung und Vorbereitung der Handhabung von Informationssicherheitsvorfällen',
  },
  'iso:A.5.25': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.25',
    title: 'Beurteilung und Entscheidung über Informationssicherheitsereignisse',
  },
  'iso:A.5.26': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.26',
    title: 'Reaktion auf Informationssicherheitsvorfälle',
  },
  'iso:A.5.27': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.27',
    title: 'Erkenntnisse aus Informationssicherheitsvorfällen',
  },
  'iso:A.5.28': { framework: 'ISO 27001:2022', clause: 'A.5.28', title: 'Sammeln von Beweismaterial' },
  'iso:A.5.29': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.29',
    title: 'Informationssicherheit bei Störungen',
  },
  'iso:A.5.30': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.30',
    title: 'IKT-Bereitschaft für Business- Continuity',
  },
  'iso:A.5.31': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.31',
    title: 'Juristische, gesetzliche, regulatorische und vertragliche Anforderungen',
  },
  'iso:A.5.34': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.34',
    title: 'Datenschutz und Schutz von personenbezogenen Daten (PbD)',
  },
  'iso:A.5.35': {
    framework: 'ISO 27001:2022',
    clause: 'A.5.35',
    title: 'Unabhängige Überprüfung der Informationssicherheit',
  },
  'iso:A.6.3': {
    framework: 'ISO 27001:2022',
    clause: 'A.6.3',
    title: 'Informationssicherheitsbewusstsein, -ausbildung und -schulung',
  },
  'iso:A.8.13': { framework: 'ISO 27001:2022', clause: 'A.8.13', title: 'Sicherung von Informationen' },
  'iso:A.8.15': { framework: 'ISO 27001:2022', clause: 'A.8.15', title: 'Protokollierung' },
  'iso:A.8.16': { framework: 'ISO 27001:2022', clause: 'A.8.16', title: 'Überwachung von Aktivitäten' },
  'nis2:Art. 20': { framework: 'NIS2', clause: 'Art. 20', title: 'Governance' },
  'nis2:Art. 21': {
    framework: 'NIS2',
    clause: 'Art. 21',
    title: 'Risikomanagementmaßnahmen im Bereich der Cybersicherheit',
  },
  'nis2:Art. 23': { framework: 'NIS2', clause: 'Art. 23', title: 'Berichtspflichten' },
  'dsgvo:Art. 5': {
    framework: 'DSGVO',
    clause: 'Art. 5',
    title: 'Grundsätze für die Verarbeitung personenbezogener Daten',
  },
  'dsgvo:Art. 6': { framework: 'DSGVO', clause: 'Art. 6', title: 'Rechtmäßigkeit der Verarbeitung' },
  'dsgvo:Art. 9': {
    framework: 'DSGVO',
    clause: 'Art. 9',
    title: 'Verarbeitung besonderer Kategorien personenbezogener Daten',
  },
  'dsgvo:Art. 13': {
    framework: 'DSGVO',
    clause: 'Art. 13',
    title: 'Informationspflicht bei Erhebung von personenbezogenen Daten bei der betroffenen Person',
  },
  'dsgvo:Art. 15': { framework: 'DSGVO', clause: 'Art. 15', title: 'Auskunftsrecht der betroffenen Person' },
  'dsgvo:Art. 28': { framework: 'DSGVO', clause: 'Art. 28', title: 'Auftragsverarbeiter' },
  'dsgvo:Art. 30': {
    framework: 'DSGVO',
    clause: 'Art. 30',
    title: 'Verzeichnis von Verarbeitungstätigkeiten',
  },
  'dsgvo:Art. 32': { framework: 'DSGVO', clause: 'Art. 32', title: 'Sicherheit der Verarbeitung' },
  'dsgvo:Art. 33': {
    framework: 'DSGVO',
    clause: 'Art. 33',
    title: 'Meldung von Verletzungen des Schutzes personenbezogener Daten an die Aufsichtsbehörde',
  },
  'dsgvo:Art. 34': {
    framework: 'DSGVO',
    clause: 'Art. 34',
    title:
      'Benachrichtigung der von einer Verletzung des Schutzes personenbezogener Daten betroffenen Person',
  },
  'dsgvo:Art. 35': { framework: 'DSGVO', clause: 'Art. 35', title: 'Datenschutz-Folgenabschätzung' },
  'dsgvo:Art. 36': { framework: 'DSGVO', clause: 'Art. 36', title: 'Vorherige Konsultation' },
  'dsgvo:Art. 44': {
    framework: 'DSGVO',
    clause: 'Art. 44',
    title: 'Allgemeine Grundsätze der Datenübermittlung',
  },
  'dsgvo:Art. 46': {
    framework: 'DSGVO',
    clause: 'Art. 46',
    title: 'Datenübermittlung vorbehaltlich geeigneter Garantien',
  },
  'bsi:ISMS.1': { framework: 'IT-Grundschutz', clause: 'ISMS.1', title: 'Sicherheitsmanagement' },
  'bsi:ORP.1': { framework: 'IT-Grundschutz', clause: 'ORP.1', title: 'Organisation' },
  'bsi:ORP.2': { framework: 'IT-Grundschutz', clause: 'ORP.2', title: 'Personal' },
  'bsi:ORP.3': {
    framework: 'IT-Grundschutz',
    clause: 'ORP.3',
    title: 'Sensibilisierung und Schulung zur Informationssicherheit',
  },
  'bsi:ORP.4': {
    framework: 'IT-Grundschutz',
    clause: 'ORP.4',
    title: 'Identitäts- und Berechtigungsmanagement',
  },
  'bsi:CON.2': { framework: 'IT-Grundschutz', clause: 'CON.2', title: 'Datenschutz' },
  'bsi:CON.3': { framework: 'IT-Grundschutz', clause: 'CON.3', title: 'Datensicherungskonzept' },
  'bsi:DER.1': {
    framework: 'IT-Grundschutz',
    clause: 'DER.1',
    title: 'Detektion von sicherheitsrelevanten Ereignissen',
  },
  'bsi:DER.2.1': {
    framework: 'IT-Grundschutz',
    clause: 'DER.2.1',
    title: 'Behandlung von Sicherheitsvorfällen',
  },
  'bsi:DER.4': { framework: 'IT-Grundschutz', clause: 'DER.4', title: 'Notfallmanagement' },
  'bsi:OPS.1.1.5': { framework: 'IT-Grundschutz', clause: 'OPS.1.1.5', title: 'Protokollierung' },
  'bsi:200-2': {
    framework: 'BSI-Standard',
    clause: '200-2',
    title: 'BSI-Standard 200-2: IT-Grundschutz-Methodik',
  },
  'bsi:200-3': {
    framework: 'BSI-Standard',
    clause: '200-3',
    title: 'BSI-Standard 200-3: Risikoanalyse auf der Basis von IT-Grundschutz',
  },
  'bsi:200-4': {
    framework: 'BSI-Standard',
    clause: '200-4',
    title: 'BSI-Standard 200-4: Business Continuity Management',
  },
} as const;

export type NormRefKey = keyof typeof NORM_REF;
