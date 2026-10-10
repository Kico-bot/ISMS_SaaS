/**
 * Geschäftsfortführung: BIA, Notfallpläne und Übungen (ISO 27001 A.5.29/A.5.30, ISO 22301).
 *
 * Der Wert des Moduls liegt in den Abgleichen: eine BIA, die eine Wiederanlaufzeit zusagt,
 * hinter der die Auswirkung längst kritisch ist, ist keine Analyse, sondern eine Behauptung.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let rita = '';
let ritaPersonId = '';
let carlaPersonId = '';
let processId = '';
let planId = '';
let assetId = '';
let lowAvailabilityAssetId = '';

interface Finding {
  severity: 'error' | 'warning';
  message: string;
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const errorsOf = (findings: Finding[]) =>
  findings.filter((f) => f.severity === 'error').map((f) => f.message);
const warningsOf = (findings: Finding[]) =>
  findings.filter((f) => f.severity === 'warning').map((f) => f.message);

/** Das volle Raster mit einheitlicher Bewertung — Basis für die einzelnen Fälle. */
async function fillGrid(score: number) {
  for (const dimension of ['financial', 'reputation', 'legal', 'operational']) {
    for (const horizon of ['2h', '8h', '24h', '72h', '1w']) {
      await http
        .put(`/api/v1/processes/${processId}/bia/impacts`)
        .set(bearer(carla))
        .send({ dimension, horizon, score })
        .expect(200);
    }
  }
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
      tenantName: 'BCM AG',
      tenantSlug: 'bcm',
      email: 'carla@bcm.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;
  carlaPersonId = (await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200)).body.personId;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@bcm.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;
  ritaPersonId = (await http.get('/api/v1/auth/me').set(bearer(rita)).expect(200)).body.personId;

  const a1 = await http
    .post('/api/v1/assets')
    .set(bearer(carla))
    .send({
      name: 'ERP-Produktivsystem',
      category: 'system',
      availability: 3,
      confidentiality: 3,
      integrity: 3,
    })
    .expect(201);
  assetId = a1.body.id;
  const a2 = await http
    .post('/api/v1/assets')
    .set(bearer(carla))
    .send({ name: 'Altes Reporting-Tool', category: 'system', availability: 1 })
    .expect(201);
  lowAvailabilityAssetId = a2.body.id;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Geschäftsprozesse', () => {
  it('legt einen Prozess mit Verantwortlicher und Stufe an', async () => {
    const res = await http
      .post('/api/v1/processes')
      .set(bearer(carla))
      .send({ name: 'Auftragsabwicklung', department: 'Vertrieb', tier: 1, ownerPersonId: ritaPersonId })
      .expect(201);
    expect(res.body.tier).toBe(1);
    processId = res.body.id;
  });

  it('meldet für einen Prozess ohne BIA noch nichts zu analysieren', async () => {
    await http.get(`/api/v1/processes/${processId}/bia`).set(bearer(carla)).expect(404);
  });
});

describe('Business-Impact-Analyse', () => {
  it('weist eine Wiederanlaufzeit über der MTPD schon im Schema zurück', async () => {
    await http
      .put(`/api/v1/processes/${processId}/bia`)
      .set(bearer(carla))
      .send({ mtpdHours: 24, rtoHours: 48 })
      .expect(400);
  });

  it('legt die BIA an und meldet das leere Raster als Widerspruch', async () => {
    const res = await http
      .put(`/api/v1/processes/${processId}/bia`)
      .set(bearer(carla))
      .send({
        mtpdHours: 48,
        rtoHours: 24,
        rpoHours: 4,
        mbco: 'Auftragserfassung auf Papier, Versand am Folgetag',
      })
      .expect(200);
    expect(res.body.status).toBe('draft');
    expect(errorsOf(res.body.findings).join(' ')).toContain('Auswirkungsraster ist leer');
  });

  it('verweigert die Freigabe, solange Widersprüche bestehen', async () => {
    const res = await http.post(`/api/v1/processes/${processId}/bia/approve`).set(bearer(carla)).expect(400);
    expect(res.body.detail).toContain('Auswirkungsraster');
  });

  it('erkennt eine Wiederanlaufzeit hinter dem kritischen Zeitpunkt', async () => {
    await fillGrid(0);
    // Ab 8 Stunden ist der Ausfall rechtlich kritisch — die zugesagten 24 Stunden sind damit zu spät.
    const res = await http
      .put(`/api/v1/processes/${processId}/bia/impacts`)
      .set(bearer(carla))
      .send({ dimension: 'legal', horizon: '8h', score: 4 })
      .expect(200);

    const errors = errorsOf(res.body.findings);
    expect(errors.some((m) => m.includes('Wiederanlaufzeit von 24 Stunden'))).toBe(true);
    expect(errors.some((m) => m.includes('MTPD ist aber mit 48 Stunden'))).toBe(true);
  });

  it('löst den Widerspruch, sobald die Zusagen zum Raster passen', async () => {
    const res = await http
      .put(`/api/v1/processes/${processId}/bia`)
      .set(bearer(carla))
      .send({ mtpdHours: 8, rtoHours: 4, rpoHours: 1 })
      .expect(200);
    expect(errorsOf(res.body.findings)).toHaveLength(0);
  });

  it('meldet eine überhaupt nicht bewertete Dimension', async () => {
    const fresh = await http
      .post('/api/v1/processes')
      .set(bearer(carla))
      .send({ name: 'Versandabwicklung' })
      .expect(201);
    await http
      .put(`/api/v1/processes/${fresh.body.id}/bia`)
      .set(bearer(carla))
      .send({ mtpdHours: 24, rtoHours: 8 })
      .expect(200);
    for (const horizon of ['2h', '8h', '24h', '72h', '1w']) {
      await http
        .put(`/api/v1/processes/${fresh.body.id}/bia/impacts`)
        .set(bearer(carla))
        .send({ dimension: 'financial', horizon, score: 1 })
        .expect(200);
    }
    const res = await http.get(`/api/v1/processes/${fresh.body.id}/bia`).set(bearer(carla)).expect(200);
    const warnings = warningsOf(res.body.findings);
    expect(warnings.some((m) => m.includes('„Reputation“ ist überhaupt nicht bewertet'))).toBe(true);
    expect(warnings.some((m) => m.includes('„Finanziell“'))).toBe(false);
  });

  it('warnt, wenn ein Prozess mit kurzer Wiederanlaufzeit auf gering verfügbaren Assets ruht', async () => {
    await http
      .put(`/api/v1/processes/${processId}/bia/resources`)
      .set(bearer(carla))
      .send({ assetId, criticality: 1 })
      .expect(200);
    const res = await http
      .put(`/api/v1/processes/${processId}/bia/resources`)
      .set(bearer(carla))
      .send({ assetId: lowAvailabilityAssetId, criticality: 2 })
      .expect(200);
    expect(res.body.resources).toHaveLength(2);
    expect(warningsOf(res.body.findings).some((m) => m.includes('Altes Reporting-Tool'))).toBe(true);
    // Das hochverfügbare Asset taucht in den Warnungen nicht auf.
    expect(warningsOf(res.body.findings).some((m) => m.includes('ERP-Produktivsystem'))).toBe(false);
  });

  it('lässt die BIA nicht von der Person freigeben, die den Prozess verantwortet', async () => {
    // Carla hat volles Schreibrecht; sobald ihr der Prozess gehört, greift die Funktionstrennung.
    await http
      .patch(`/api/v1/processes/${processId}`)
      .set(bearer(carla))
      .send({ ownerPersonId: carlaPersonId })
      .expect(200);
    const res = await http.post(`/api/v1/processes/${processId}/bia/approve`).set(bearer(carla)).expect(409);
    expect(res.body.type).toContain('sod-violation');
    await http
      .patch(`/api/v1/processes/${processId}`)
      .set(bearer(carla))
      .send({ ownerPersonId: ritaPersonId })
      .expect(200);
  });

  it('gibt durch eine zweite Person frei', async () => {
    const res = await http.post(`/api/v1/processes/${processId}/bia/approve`).set(bearer(carla)).expect(201);
    expect(res.body.status).toBe('approved');
    expect(res.body.approvedByName).toBe('Carla CISO');
  });

  it('setzt die Freigabe bei einer inhaltlichen Änderung zurück', async () => {
    const res = await http
      .put(`/api/v1/processes/${processId}/bia`)
      .set(bearer(carla))
      .send({ mtpdHours: 8, rtoHours: 2, rpoHours: 1 })
      .expect(200);
    expect(res.body.status).toBe('draft');
    expect(res.body.approvedAt).toBeNull();
  });
});

describe('Notfallpläne und Übungen', () => {
  it('verlangt für einen Plan eine vorhandene BIA', async () => {
    const other = await http
      .post('/api/v1/processes')
      .set(bearer(carla))
      .send({ name: 'Kantine', tier: 3 })
      .expect(201);
    const res = await http
      .post(`/api/v1/processes/${other.body.id}/plans`)
      .set(bearer(carla))
      .send({ title: 'Ersatzverpflegung' })
      .expect(400);
    expect(res.body.detail).toContain('Business Impact Analyse');
  });

  it('legt einen Plan mit Schritten an', async () => {
    const res = await http
      .post(`/api/v1/processes/${processId}/plans`)
      .set(bearer(carla))
      .send({
        title: 'Wiederanlauf Auftragsabwicklung',
        activationCriteria: 'ERP länger als 60 Minuten nicht erreichbar',
        strategy: 'Umschaltung auf das gespiegelte System im zweiten Rechenzentrum',
        testIntervalMonths: 12,
      })
      .expect(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.rtoHours).toBe(2);
    planId = res.body.id;

    for (const step of [
      { seq: 1, phase: 'Alarmierung', title: 'Krisenstab einberufen', responsiblePersonId: ritaPersonId },
      { seq: 2, phase: 'Umschaltung', title: 'Schwenk auf RZ 2 auslösen' },
      { seq: 3, phase: 'Wiederanlauf', title: 'Datenbestand gegen letzte Sicherung prüfen' },
    ]) {
      await http.put(`/api/v1/continuity-plans/${planId}/steps`).set(bearer(carla)).send(step).expect(200);
    }
    const detail = await http.get(`/api/v1/continuity-plans/${planId}`).set(bearer(carla)).expect(200);
    expect(detail.body.steps).toHaveLength(3);
    expect(detail.body.steps[0].responsibleName).toBe('Rita Reinhardt');
  });

  it('ersetzt einen Schritt an derselben Position statt ihn zu verdoppeln', async () => {
    const res = await http
      .put(`/api/v1/continuity-plans/${planId}/steps`)
      .set(bearer(carla))
      .send({ seq: 2, phase: 'Umschaltung', title: 'Schwenk auf RZ 2 auslösen und bestätigen' })
      .expect(200);
    expect(res.body.steps).toHaveLength(3);
    expect(res.body.steps[1].title).toContain('bestätigen');
  });

  it('setzt einen nie geübten Plan nicht aktiv', async () => {
    const res = await http
      .patch(`/api/v1/continuity-plans/${planId}`)
      .set(bearer(carla))
      .send({ status: 'active' })
      .expect(400);
    expect(res.body.detail).toContain('Übung');
  });

  it('terminiert mit der Übung zugleich die nächste Fälligkeit', async () => {
    const res = await http
      .post(`/api/v1/continuity-plans/${planId}/exercises`)
      .set(bearer(carla))
      .send({
        heldAt: '2026-09-01',
        kind: 'tabletop',
        result: 'Schwenk in 95 Minuten, RTO eingehalten',
        lessonsLearned: 'Kontaktliste war veraltet',
      })
      .expect(201);
    expect(res.body.lastTestAt).toBe('2026-09-01');
    expect(res.body.nextTestAt).toBe('2027-09-01');
    expect(res.body.exercises).toHaveLength(1);
  });

  it('erlaubt nach der Übung das Aktivsetzen', async () => {
    const res = await http
      .patch(`/api/v1/continuity-plans/${planId}`)
      .set(bearer(carla))
      .send({ status: 'active' })
      .expect(200);
    expect(res.body.status).toBe('active');
  });

  it('verschiebt den Termin nicht, wenn eine ältere Übung nachgetragen wird', async () => {
    const res = await http
      .post(`/api/v1/continuity-plans/${planId}/exercises`)
      .set(bearer(carla))
      .send({ heldAt: '2025-03-10', kind: 'walkthrough', result: 'Nachtrag der Vorjahresübung' })
      .expect(201);
    expect(res.body.lastTestAt).toBe('2026-09-01');
    expect(res.body.nextTestAt).toBe('2027-09-01');
    expect(res.body.exercises).toHaveLength(2);
  });

  it('führt Pläne mit fälliger Übung im Programm', async () => {
    const early = await http
      .post(`/api/v1/continuity-plans/${planId}/exercises`)
      .set(bearer(carla))
      .send({ heldAt: '2026-09-10', kind: 'simulation', nextInMonths: 1 })
      .expect(201);
    expect(early.body.nextTestAt).toBe('2026-10-10');

    const due = await http.get('/api/v1/continuity-plans/due').set(bearer(carla)).expect(200);
    expect((due.body as { planId: string }[]).some((p) => p.planId === planId)).toBe(true);
  });

  it('zeigt Prozess, Kennzahlen und Übungsstand in einer Übersicht', async () => {
    const res = await http.get('/api/v1/processes/overview').set(bearer(carla)).expect(200);
    const row = (
      res.body as {
        processId: string;
        rtoHours: number;
        planCount: number;
        maxImpact: number;
        resourceCount: number;
      }[]
    ).find((p) => p.processId === processId)!;
    expect(row.rtoHours).toBe(2);
    expect(row.planCount).toBe(1);
    expect(row.maxImpact).toBe(4);
    expect(row.resourceCount).toBe(2);

    // Der Prozess ohne BIA steht ebenfalls in der Liste — die Lücke soll sichtbar bleiben.
    const kantine = (res.body as { processName: string; biaId: string | null }[]).find(
      (p) => p.processName === 'Kantine',
    )!;
    expect(kantine.biaId).toBeNull();
  });

  it('erlaubt der verantwortlichen Person die Pflege ihres eigenen Prozesses', async () => {
    // Rita hat nur continuity.write_own — für den Prozess, den sie verantwortet, genügt das.
    await http.post('/api/v1/processes').set(bearer(rita)).send({ name: 'Retourenbearbeitung' }).expect(201);
    await http
      .post(`/api/v1/continuity-plans/${planId}/exercises`)
      .set(bearer(rita))
      .send({ heldAt: '2026-09-15' })
      .expect(201);
  });

  it('verwehrt ihr denselben Zugriff auf fremde Prozesse', async () => {
    const fremd = await http
      .post('/api/v1/processes')
      .set(bearer(carla))
      .send({ name: 'Lohnbuchhaltung', ownerPersonId: carlaPersonId })
      .expect(201);
    await http.patch(`/api/v1/processes/${fremd.body.id}`).set(bearer(rita)).send({ tier: 1 }).expect(403);
    await http
      .put(`/api/v1/processes/${fremd.body.id}/bia`)
      .set(bearer(rita))
      .send({ mtpdHours: 24, rtoHours: 8 })
      .expect(403);
    await http
      .post(`/api/v1/processes/${fremd.body.id}/plans`)
      .set(bearer(rita))
      .send({ title: 'Fremder Plan' })
      .expect(403);
  });

  it('verlangt für die Freigabe der BIA das volle Schreibrecht', async () => {
    // Ownership genügt hier gerade nicht — die Freigabe ist der Gegenpart zur Verantwortung.
    await http.post(`/api/v1/processes/${processId}/bia/approve`).set(bearer(rita)).expect(403);
  });
});
