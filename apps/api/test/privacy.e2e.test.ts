/**
 * Datenschutz: Verzeichnis von Verarbeitungstätigkeiten (Art. 30), TOM (Art. 32) und
 * Folgenabschätzung (Art. 35).
 *
 * Geprüft wird vor allem, was juristisch falsch und nicht bloß unvollständig ist:
 * besondere Kategorien ohne Art.-9-Grundlage und Drittlandübermittlung ohne Garantien.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let doris = '';
let dorisPersonId = '';
let rita = '';
let activityId = '';
let hrActivityId = '';
let measureId = '';
let petraPersonId = '';

interface Finding {
  severity: 'error' | 'warning';
  message: string;
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const errorsOf = (f: Finding[]) => f.filter((x) => x.severity === 'error').map((x) => x.message);
const warningsOf = (f: Finding[]) => f.filter((x) => x.severity === 'warning').map((x) => x.message);

async function inviteAndAccept(roleKeys: string[], email: string, displayName: string, password: string) {
  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email, displayName, roleKeys })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password })
    .expect(200);
  const me = await http.get('/api/v1/auth/me').set(bearer(accepted.body.accessToken)).expect(200);
  return { token: accepted.body.accessToken as string, personId: me.body.personId as string };
}

beforeAll(async () => {
  setTestEnv();
  await prepareTestDatabase();
  const { createApp } = await import('../src/app.factory');
  app = await createApp();
  await app.init();
  http = request(app.getHttpServer());

  const reg = await http
    .post('/api/v1/auth/register')
    .send({
      tenantName: 'Datenschutz AG',
      tenantSlug: 'dsgvo',
      email: 'carla@dsgvo.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const d = await inviteAndAccept(['dpo'], 'doris@dsgvo.test', 'Doris Dahlke', 'doris-passwort-2026-lang');
  doris = d.token;
  dorisPersonId = d.personId;
  rita = (
    await inviteAndAccept(['risk_owner'], 'rita@dsgvo.test', 'Rita Reinhardt', 'rita-passwort-2026-lang')
  ).token;

  const m = await http
    .post('/api/v1/measures')
    .set(bearer(carla))
    .send({ title: 'Verschlüsselung personenbezogener Daten im Ruhezustand', status: 'implemented' })
    .expect(201);
  measureId = m.body.id;

  // Fachverantwortung liegt in der Regel in der Abteilung, nicht beim Datenschutz.
  const petra = await http
    .post('/api/v1/persons')
    .set(bearer(carla))
    .send({ name: 'Petra Personal', department: 'Personal' })
    .expect(201);
  petraPersonId = petra.body.id;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Verzeichnis von Verarbeitungstätigkeiten', () => {
  it('meldet einen leeren Eintrag als unvollständig nach Art. 30', async () => {
    const res = await http
      .post('/api/v1/processing-activities')
      .set(bearer(doris))
      .send({ name: 'Bewerbermanagement' })
      .expect(201);
    activityId = res.body.id;

    const errors = errorsOf(res.body.findings);
    expect(errors.some((m) => m.includes('Zweck'))).toBe(true);
    expect(errors.some((m) => m.includes('Kategorien betroffener Personen'))).toBe(true);
    expect(errors.some((m) => m.includes('Rechtsgrundlage'))).toBe(true);
  });

  it('lässt einen unvollständigen Eintrag nicht aktiv stellen', async () => {
    const res = await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ status: 'active' })
      .expect(400);
    expect(res.body.detail).toContain('Art. 30');
  });

  it('verlangt beim Auftragsverarbeiter keine eigene Rechtsgrundlage', async () => {
    const res = await http
      .post('/api/v1/processing-activities')
      .set(bearer(doris))
      .send({
        name: 'Hosting im Auftrag eines Kunden',
        role: 'processor',
        purpose: 'Betrieb der Kundenanwendung',
        dataSubjectCategories: ['Kunden unseres Auftraggebers'],
        dataCategories: ['Stammdaten'],
      })
      .expect(201);
    expect(errorsOf(res.body.findings).some((m) => m.includes('Rechtsgrundlage'))).toBe(false);
  });

  it('weist Art. 6 als Grundlage für besondere Kategorien zurück', async () => {
    const res = await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({
        purpose: 'Auswahl von Bewerberinnen und Bewerbern',
        legalBasis: 'art6_1b',
        dataSubjectCategories: ['Bewerberinnen und Bewerber'],
        dataCategories: ['Kontaktdaten', 'Lebenslauf', 'Schwerbehinderteneigenschaft'],
        specialCategories: true,
        retention: '6 Monate nach Abschluss des Verfahrens',
      })
      .expect(200);
    const errors = errorsOf(res.body.findings);
    expect(errors.some((m) => m.includes('Art. 9 Abs. 2'))).toBe(true);
  });

  it('nimmt eine Grundlage nach Art. 9 an und schlägt zugleich eine DSFA vor', async () => {
    const res = await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ legalBasis: 'art9_2b' })
      .expect(200);
    expect(errorsOf(res.body.findings).some((m) => m.includes('Art. 9'))).toBe(false);
    expect(res.body.dpiaSuggested).toBe(true);
    expect(warningsOf(res.body.findings).some((m) => m.includes('Art. 35 Abs. 3'))).toBe(true);
  });

  it('verlangt bei Drittlandübermittlung die Garantien nach Kapitel V', async () => {
    const res = await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ thirdCountryTransfer: true })
      .expect(200);
    expect(errorsOf(res.body.findings).some((m) => m.includes('Kapitel V'))).toBe(true);

    const fixed = await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ safeguards: 'Standardvertragsklauseln (2021/914) mit Transfer-Impact-Assessment' })
      .expect(200);
    expect(errorsOf(fixed.body.findings).some((m) => m.includes('Kapitel V'))).toBe(false);
  });

  it('verknüpft dieselben Maßnahmen als TOM statt einer zweiten Liste', async () => {
    const before = await http
      .get(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .expect(200);
    expect(warningsOf(before.body.findings).some((m) => m.includes('Art. 32'))).toBe(true);

    const res = await http
      .post(`/api/v1/processing-activities/${activityId}/toms`)
      .set(bearer(doris))
      .send({ measureId })
      .expect(201);
    expect(res.body.toms).toHaveLength(1);
    expect(res.body.toms[0].status).toBe('implemented');
    expect(warningsOf(res.body.findings).some((m) => m.includes('Art. 32'))).toBe(false);
  });

  it('lässt Rollen ohne Datenschutzrecht nichts eintragen', async () => {
    await http
      .post('/api/v1/processing-activities')
      .set(bearer(rita))
      .send({ name: 'Heimliche Verarbeitung' })
      .expect(403);
  });

  it('führt einen vollständigen Eintrag ohne DSFA-Pflicht in den Status aktiv', async () => {
    const res = await http
      .post('/api/v1/processing-activities')
      .set(bearer(doris))
      .send({
        name: 'Entgeltabrechnung',
        purpose: 'Abrechnung der Bezüge und Meldung an Sozialversicherungsträger',
        legalBasis: 'art6_1c',
        dataSubjectCategories: ['Beschäftigte'],
        dataCategories: ['Stammdaten', 'Bankverbindung', 'Entgeltdaten'],
        recipients: ['Sozialversicherungsträger', 'Finanzamt'],
        retention: '10 Jahre nach Ende des Beschäftigungsverhältnisses',
      })
      .expect(201);
    hrActivityId = res.body.id;
    await http
      .post(`/api/v1/processing-activities/${hrActivityId}/toms`)
      .set(bearer(doris))
      .send({ measureId })
      .expect(201);

    const active = await http
      .patch(`/api/v1/processing-activities/${hrActivityId}`)
      .set(bearer(doris))
      .send({ status: 'active' })
      .expect(200);
    expect(active.body.status).toBe('active');
  });

  it('weist Drittlandübermittlungen ohne Garantien in den Kennzahlen aus', async () => {
    const res = await http.get('/api/v1/processing-activities/summary').set(bearer(doris)).expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.specialCategories).toBe(1);
    expect(res.body.thirdCountry).toBe(1);
    expect(res.body.transferWithoutSafeguards).toBe(0);
    expect(res.body.withoutToms).toBe(1); // der Auftragsverarbeiter-Eintrag
  });
});

describe('Datenschutz-Folgenabschätzung', () => {
  it('blockiert die Aktivierung, solange die pflichtige DSFA fehlt', async () => {
    await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ dpiaRequired: true })
      .expect(200);
    const res = await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ status: 'active' })
      .expect(400);
    expect(res.body.detail).toContain('Art. 35');
  });

  it('meldet eine leere Abschätzung gegen Art. 35 Abs. 7', async () => {
    const res = await http
      .put(`/api/v1/processing-activities/${activityId}/dpia`)
      .set(bearer(doris))
      .send({})
      .expect(200);
    const errors = errorsOf(res.body.findings);
    expect(errors.some((m) => m.includes('lit. a'))).toBe(true);
    expect(errors.some((m) => m.includes('lit. b'))).toBe(true);
    expect(errors.some((m) => m.includes('lit. c'))).toBe(true);
  });

  it('verlangt für ein hohes Risiko eine Abhilfemaßnahme', async () => {
    const res = await http
      .put(`/api/v1/processing-activities/${activityId}/dpia`)
      .set(bearer(doris))
      .send({
        descriptionOfProcessing: 'Bewerbungen werden im Bewerberportal erfasst und intern bewertet.',
        necessityAssessment:
          'Ohne Verarbeitung ist kein Auswahlverfahren möglich; der Umfang ist auf das Erforderliche begrenzt.',
        risks: [
          { title: 'Unbefugter Zugriff auf Gesundheitsdaten', likelihood: 4, impact: 5 },
          {
            title: 'Verspätete Löschung nach Absage',
            likelihood: 3,
            impact: 2,
            mitigation: 'Automatischer Löschlauf nach 6 Monaten',
          },
        ],
      })
      .expect(200);
    expect(res.body.risks[0].score).toBe(20);
    expect(res.body.risks[0].high).toBe(true);
    const errors = errorsOf(res.body.findings);
    expect(errors.some((m) => m.includes('Art. 36'))).toBe(true);

    // Der Weg zur Stellungnahme bleibt versperrt, solange das hohe Risiko unbehandelt ist.
    await http.post(`/api/v1/processing-activities/${activityId}/dpia/submit`).set(bearer(doris)).expect(400);
  });

  it('lässt die Abschätzung nach Ergänzung der Abhilfemaßnahme vorlegen', async () => {
    const res = await http
      .put(`/api/v1/processing-activities/${activityId}/dpia`)
      .set(bearer(doris))
      .send({
        descriptionOfProcessing: 'Bewerbungen werden im Bewerberportal erfasst und intern bewertet.',
        necessityAssessment:
          'Ohne Verarbeitung ist kein Auswahlverfahren möglich; der Umfang ist auf das Erforderliche begrenzt.',
        risks: [
          {
            title: 'Unbefugter Zugriff auf Gesundheitsdaten',
            likelihood: 4,
            impact: 5,
            mitigation: 'Getrenntes Berechtigungskonzept, Verschlüsselung, Zugriffsprotokollierung',
          },
          {
            title: 'Verspätete Löschung nach Absage',
            likelihood: 3,
            impact: 2,
            mitigation: 'Automatischer Löschlauf nach 6 Monaten',
          },
        ],
      })
      .expect(200);
    expect(errorsOf(res.body.findings)).toHaveLength(0);

    const submitted = await http
      .post(`/api/v1/processing-activities/${activityId}/dpia/submit`)
      .set(bearer(doris))
      .expect(201);
    expect(submitted.body.status).toBe('in_review');
  });

  it('nimmt keine Stellungnahme von der Person entgegen, die die Verarbeitung verantwortet', async () => {
    await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ ownerPersonId: dorisPersonId })
      .expect(200);
    await http.post(`/api/v1/processing-activities/${activityId}/dpia/submit`).set(bearer(doris)).expect(201);

    const res = await http
      .post(`/api/v1/processing-activities/${activityId}/dpia/opinion`)
      .set(bearer(doris))
      .send({ opinion: 'Aus meiner Sicht ist die Verarbeitung zulässig.', result: 'approved' })
      .expect(409);
    expect(res.body.type).toContain('sod-violation');
  });

  it('nimmt sie an, sobald die Fachverantwortung in der Abteilung liegt', async () => {
    await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ ownerPersonId: petraPersonId })
      .expect(200);
    await http.post(`/api/v1/processing-activities/${activityId}/dpia/submit`).set(bearer(doris)).expect(201);

    const res = await http
      .post(`/api/v1/processing-activities/${activityId}/dpia/opinion`)
      .set(bearer(doris))
      .send({
        opinion:
          'Die verbleibenden Risiken sind durch das Berechtigungskonzept und die Verschlüsselung hinreichend gemindert.',
        result: 'approved_with_measures',
      })
      .expect(201);
    expect(res.body.status).toBe('approved');
    expect(res.body.result).toBe('approved_with_measures');
    expect(res.body.dpoName).toBe('Doris Dahlke');
    expect(errorsOf(res.body.findings)).toHaveLength(0);
  });

  it('lässt die Stellungnahme nicht durch Rollen ohne Datenschutzrecht abgeben', async () => {
    // Die ISMS-Leitung liest den Datenschutz, verantwortet ihn aber nicht.
    await http
      .post(`/api/v1/processing-activities/${activityId}/dpia/opinion`)
      .set(bearer(carla))
      .send({ opinion: 'Sieht für mich in Ordnung aus.', result: 'approved' })
      .expect(403);
  });

  it('nimmt die Stellungnahme bei einer inhaltlichen Änderung zurück', async () => {
    const res = await http
      .put(`/api/v1/processing-activities/${activityId}/dpia`)
      .set(bearer(doris))
      .send({
        descriptionOfProcessing: 'Ergänzt um die Weitergabe an einen externen Dienstleister.',
        necessityAssessment: 'Unverändert erforderlich.',
        risks: [
          {
            title: 'Weitergabe an Dienstleister',
            likelihood: 2,
            impact: 3,
            mitigation: 'Auftragsverarbeitungsvertrag',
          },
        ],
      })
      .expect(200);
    expect(res.body.status).toBe('draft');
    expect(res.body.dpoOpinion).toBeNull();
    expect(res.body.result).toBeNull();
  });

  it('erlaubt die Aktivierung, sobald die Abschätzung abgeschlossen ist', async () => {
    await http.post(`/api/v1/processing-activities/${activityId}/dpia/submit`).set(bearer(doris)).expect(201);
    await http
      .post(`/api/v1/processing-activities/${activityId}/dpia/opinion`)
      .set(bearer(doris))
      .send({ opinion: 'Auch die Weitergabe ist durch den Vertrag abgedeckt.', result: 'approved' })
      .expect(201);

    const res = await http
      .patch(`/api/v1/processing-activities/${activityId}`)
      .set(bearer(doris))
      .send({ status: 'active' })
      .expect(200);
    expect(res.body.status).toBe('active');
  });
});

describe('Bezug zu Datenpannen', () => {
  it('führt die betroffene Verarbeitung am Vorfall und umgekehrt', async () => {
    const incident = await http
      .post('/api/v1/incidents')
      .set(bearer(carla))
      .send({ title: 'Fehlversand einer Bewerberliste', category: 'data_loss', severity: 'high' })
      .expect(201);
    await http
      .post(`/api/v1/incidents/${incident.body.id}/confirm-breach`)
      .set(bearer(carla))
      .send({ affectedPersons: 12, highRiskForIndividuals: false, processingActivityIds: [activityId] })
      .expect(201);

    const res = await http.get(`/api/v1/processing-activities/${activityId}`).set(bearer(doris)).expect(200);
    expect(res.body.breaches).toHaveLength(1);
    expect(res.body.breaches[0].refNo).toBe('INC-0001');
  });
});
