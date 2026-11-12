/**
 * Vorlagen für die ersten Richtlinien eines ISMS. Eigene Formulierungen in einfachem Deutsch,
 * kein Normtext: die ISO 27001 wird nur mit Kapitel und Kurztitel genannt (DIN-Urheberrecht).
 * Platzhalter in doppelten geschweiften Klammern füllt die API beim Anlegen:
 * {{Firma}}, {{Verantwortlich}} und {{Datum}}. Was danach noch in eckigen Klammern steht, passt
 * die Organisation selbst an.
 */
export interface PolicyTemplate {
  key: string;
  /** Vorgeschlagenes Kürzel des Dokuments, je Mandant eindeutig gemacht. */
  docKey: string;
  title: string;
  kind: 'policy' | 'procedure';
  /** ISO-27001-Bezüge als ref_code, für Anzeige und Zuordnung. */
  refs: string[];
  body: string;
}

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    key: 'security_policy',
    docKey: 'RL-01',
    title: 'Leitlinie zur Informationssicherheit',
    kind: 'policy',
    refs: ['5.2', 'A.5.1'],
    body: `# Leitlinie zur Informationssicherheit

{{Firma}}, Stand {{Datum}}, verantwortlich: {{Verantwortlich}}

## Warum wir Informationssicherheit betreiben
Unsere Kundinnen und Kunden, unsere Beschäftigten und unsere Partner vertrauen uns Informationen an. Wir schützen sie so, dass sie vertraulich bleiben, richtig sind und verfügbar, wenn sie gebraucht werden.

## Wofür diese Leitlinie gilt
Sie gilt für alle Standorte, Prozesse und Systeme im Geltungsbereich des ISMS und für alle Beschäftigten sowie für Dienstleister, die für uns arbeiten.

## Unsere Ziele
- Sicherheitsvorfälle früh erkennen und ihre Folgen klein halten.
- Gesetzliche und vertragliche Pflichten zuverlässig einhalten.
- Risiken kennen, bewerten und bewusst behandeln.
- Jedes Jahr messbar besser werden; die Ziele stehen im ISMS unter Organisation, Ziele.

## Wie wir das erreichen
- Die Geschäftsführung trägt die Verantwortung und stellt Zeit, Geld und Personal bereit.
- {{Verantwortlich}} steuert das ISMS und berichtet mindestens einmal im Jahr an die Geschäftsführung.
- Risiken werden nach einer festen Methode bewertet; Maßnahmen haben eine verantwortliche Person und einen Termin.
- Alle Beschäftigten werden geschult und wissen, wie sie einen Vorfall melden.

## Was wir von allen erwarten
Jede Person geht sorgfältig mit Informationen um, hält die Regeln dieser Leitlinie und der zugehörigen Richtlinien ein und meldet Auffälligkeiten sofort.

## Prüfung
Diese Leitlinie wird jedes Jahr und nach wesentlichen Änderungen geprüft. In Kraft gesetzt durch die Geschäftsführung am [Datum].
`,
  },
  {
    key: 'roles',
    docKey: 'RL-02',
    title: 'Rollen und Verantwortlichkeiten im ISMS',
    kind: 'policy',
    refs: ['5.3', 'A.5.2'],
    body: `# Rollen und Verantwortlichkeiten im ISMS

{{Firma}}, Stand {{Datum}}, verantwortlich: {{Verantwortlich}}

## Geschäftsführung
- Setzt die Leitlinie in Kraft und gibt die Sicherheitsziele frei.
- Stellt die nötigen Mittel bereit und nimmt an der jährlichen Managementbewertung teil.
- Entscheidet, welche Risiken bewusst getragen werden.

## Leitung des ISMS
Diese Rolle hat {{Verantwortlich}}.
- Plant und steuert das ISMS, pflegt Risiken, Maßnahmen und Richtlinien.
- Bereitet die Managementbewertung vor und berichtet über den Stand.
- Ist erste Ansprechperson bei Sicherheitsvorfällen.

## Verantwortliche für Assets und Risiken
- Kennen die Werte in ihrem Bereich und deren Schutzbedarf.
- Setzen die Maßnahmen für ihre Risiken um und melden, wenn ein Termin nicht hält.

## Interne Revision
- Prüft das ISMS unabhängig und prüft nie die eigene Arbeit.

## Alle Beschäftigten
- Nehmen an Schulungen teil, halten die Richtlinien ein und melden Vorfälle.

## Vertretung
Jede Rolle hat eine benannte Vertretung: [Namen eintragen]. Wer wen vertritt, steht im ISMS unter Einstellungen, Mitglieder & Rollen.
`,
  },
  {
    key: 'risk_method',
    docKey: 'VA-01',
    title: 'Methode des Risikomanagements',
    kind: 'procedure',
    refs: ['6.1.2', '6.1.3', '8.2'],
    body: `# Methode des Risikomanagements

{{Firma}}, Stand {{Datum}}, verantwortlich: {{Verantwortlich}}

## Wann wir Risiken bewerten
Einmal im Jahr für alle Risiken, außerdem bei neuen Systemen, Lieferanten oder Prozessen und nach jedem schweren Vorfall.

## Wie wir bewerten
Jedes Risiko bekommt eine Bewertung auf einer Matrix mit fünf mal fünf Feldern: wie wahrscheinlich es ist und wie schlimm es wäre. Bewertet wird der Stand von heute, mit den Maßnahmen, die schon wirken. Was jede Stufe bedeutet, steht im ISMS hinter dem Hinweis an der Matrix.

## Wann ein Risiko zu hoch ist
- bis 4 Punkte: niedrig, wird beobachtet
- bis 9 Punkte: mittel, eine Maßnahme ist zu planen
- bis 14 Punkte: hoch, eine Maßnahme ist mit Termin umzusetzen
- über 14 Punkte: kritisch, die Geschäftsführung wird sofort informiert

## Was wir mit einem Risiko tun
Für jedes Risiko wird eine Behandlung gewählt: mindern, akzeptieren, übertragen oder vermeiden. Akzeptiert wird nur durch ausdrückliche Freigabe der Geschäftsführung, nie durch die Person, der das Risiko gehört.

## Wer was macht
Die verantwortliche Person bewertet und schlägt die Behandlung vor, {{Verantwortlich}} prüft die Bewertung, die Geschäftsführung entscheidet über das Tragen.
`,
  },
  {
    key: 'communication',
    docKey: 'RL-03',
    title: 'Kommunikationsplan Informationssicherheit',
    kind: 'policy',
    refs: ['7.4'],
    body: `# Kommunikationsplan Informationssicherheit

{{Firma}}, Stand {{Datum}}, verantwortlich: {{Verantwortlich}}

Für jedes Thema ist festgelegt, worüber, mit wem, wann und wie wir sprechen.

| Worüber | Mit wem | Wann | Wie | Wer |
| --- | --- | --- | --- | --- |
| Stand des ISMS | Geschäftsführung | jedes Quartal | Bericht | {{Verantwortlich}} |
| Neue oder geänderte Richtlinien | alle Beschäftigten | bei Freigabe | Intranet und Lesebestätigung | {{Verantwortlich}} |
| Aktuelle Bedrohungen | alle Beschäftigten | bei Bedarf, mindestens jedes Halbjahr | E-Mail | [Name] |
| Sicherheitsvorfälle | Geschäftsführung, Betroffene | sofort | Telefon, danach schriftlich | {{Verantwortlich}} |
| Meldepflichtige Vorfälle | Aufsichtsbehörde | in den gesetzlichen Fristen | Meldeportal | [Name] |
| Sicherheitsanforderungen | Lieferanten | bei Vertragsschluss und jährlich | Vertrag, Fragebogen | [Name] |

Ergänzen Sie Zeilen, wenn weitere Gruppen informiert werden müssen.
`,
  },
  {
    key: 'incident_handling',
    docKey: 'VA-02',
    title: 'Umgang mit Sicherheitsvorfällen',
    kind: 'procedure',
    refs: ['A.5.24', 'A.5.25', 'A.5.26'],
    body: `# Umgang mit Sicherheitsvorfällen

{{Firma}}, Stand {{Datum}}, verantwortlich: {{Verantwortlich}}

## Melden
Wer etwas Auffälliges bemerkt, meldet es sofort an [Telefon oder Postfach]. Lieber einmal zu viel als zu spät. Niemand wird für eine Meldung getadelt.

## Bewerten
{{Verantwortlich}} bewertet innerhalb von [zwei] Stunden, wie schwer der Vorfall ist und ob eine Meldepflicht besteht. Die Uhrzeit der Kenntnisnahme wird im ISMS festgehalten, weil alle Fristen von ihr abhängen.

## Eindämmen und beheben
- Betroffene Systeme isolieren, Beweise sichern, nichts überschreiben.
- Ursache finden und beheben, dann geordnet wieder in Betrieb nehmen.

## Melden an Behörden
Liegt ein erheblicher Vorfall vor, gelten die gesetzlichen Fristen. Das ISMS berechnet sie und zeigt sie in den Fristen an.

## Daraus lernen
Nach jedem schweren Vorfall wird besprochen, was gut lief und was nicht. Daraus entstehen Maßnahmen mit Termin.
`,
  },
  {
    key: 'continuity',
    docKey: 'NP-01',
    title: 'Notfallplan',
    kind: 'procedure',
    refs: ['A.5.29', 'A.5.30'],
    body: `# Notfallplan

{{Firma}}, Stand {{Datum}}, verantwortlich: {{Verantwortlich}}

## Wann dieser Plan gilt
Wenn ein wichtiger Prozess länger ausfällt, als er ausfallen darf, zum Beispiel [Prozess] länger als [Stunden].

## Wer entscheidet
Den Notfall ruft {{Verantwortlich}} oder die Geschäftsführung aus. Vertretung: [Name].

## Die wichtigsten Prozesse
| Prozess | darf höchstens ausfallen | muss spätestens wieder laufen | Notbetrieb |
| --- | --- | --- | --- |
| [Prozess] | [Stunden] | [Stunden] | [z. B. Handbetrieb] |

## Erste Schritte
1. Lage feststellen und den Notfallstab einberufen.
2. Notbetrieb starten, Kundinnen, Kunden und Beschäftigte informieren.
3. Wiederanlauf nach Reihenfolge der Prozesse, Daten aus der Sicherung zurückspielen.
4. Nach dem Ende: Bericht, was gelernt wurde, Maßnahmen mit Termin.

## Üben
Der Plan wird mindestens einmal im Jahr geübt. Ein Plan, der nie geübt wurde, ist nur eine Behauptung.
`,
  },
];

/** Füllt die Platzhalter einer Vorlage. */
export function fillTemplate(body: string, values: { Firma: string; Verantwortlich: string; Datum: string }) {
  return body.replace(/\{\{(Firma|Verantwortlich|Datum)\}\}/g, (_, k: keyof typeof values) => values[k]);
}
