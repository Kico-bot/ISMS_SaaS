/**
 * Wiedervorlage über das ganze ISMS (ISO 27001 Kap. 9.1 / 10.2).
 *
 * Zwei Dinge stehen hier unter Test: dass wirklich jede datierte Verpflichtung auftaucht,
 * und dass die Liste den Leserechten folgt — mit der Ausnahme, dass eigene Pflichten
 * (Lesebestätigung, zugewiesene Schulung) auch ohne Modulrecht sichtbar bleiben.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let mika = '';
let rita = '';
let ritaPersonId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
/** Ein Datum in `n` Tagen, als YYYY-MM-DD. */
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

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
      tenantName: 'Frist GmbH',
      tenantSlug: 'frist',
      email: 'carla@frist.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  // Zweite ISMS-Managerin, damit eine Fassung im Vier-Augen-Prinzip freigegeben werden kann.
  const inviteMika = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'mika@frist.test', displayName: 'Mika Mertens', roleKeys: ['isms_manager'] })
    .expect(201);
  mika = (
    await http
      .post('/api/v1/auth/accept-invite')
      .send({ token: inviteMika.body.inviteToken, password: 'mika-passwort-2026-lang' })
      .expect(200)
  ).body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@frist.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;
  const me = await http.get('/api/v1/auth/me').set(bearer(rita)).expect(200);
  ritaPersonId = me.body.personId;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Wiedervorlage', () => {
  it('sammelt Maßnahme, KVP-Maßnahme und Sicherheitsziel mit ihren Fristen ein', async () => {
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({
        title: 'Notfallhandbuch aktualisieren',
        status: 'planned',
        dueDate: inDays(5),
        ownerPersonId: ritaPersonId,
      })
      .expect(201);
    await http
      .post('/api/v1/actions')
      .set(bearer(carla))
      .send({ title: 'Protokollierung erweitern', kind: 'improvement', dueAt: inDays(-3) })
      .expect(201);
    await http
      .post('/api/v1/context/objectives')
      .set(bearer(carla))
      .send({ title: 'Phishing-Quote unter 5 %', dueDate: inDays(20), direction: 'lower_is_better' })
      .expect(201);

    const res = await http.get('/api/v1/deadlines').set(bearer(carla)).expect(200);
    const kinds = (res.body as { kind: string }[]).map((r) => r.kind);
    expect(kinds).toContain('measure');
    expect(kinds).toContain('action');
    expect(kinds).toContain('objective');

    // Nach Fälligkeit sortiert: die überfällige KVP-Maßnahme steht vorn.
    expect(res.body[0].kind).toBe('action');
    expect(res.body[0].daysLeft).toBeLessThan(0);
  });

  it('stuft eine Meldefrist als kritisch ein', async () => {
    const incident = await http
      .post('/api/v1/incidents')
      .set(bearer(carla))
      .send({
        title: 'Verschlüsselungstrojaner im Dateiserver',
        severity: 'high',
        detectedAt: new Date().toISOString(),
      })
      .expect(201);
    // Erheblich nach NIS2: setzt die 24-Stunden-Frühwarnung und die 72-Stunden-Meldung.
    await http
      .post(`/api/v1/incidents/${incident.body.id}/mark-significant`)
      .set(bearer(carla))
      .send({ knownAt: new Date().toISOString() })
      .expect(201);

    const res = await http.get('/api/v1/deadlines').set(bearer(carla)).expect(200);
    const rows = (res.body as { kind: string; severity: string; title: string; context: string }[]).filter(
      (r) => r.kind === 'reporting_obligation',
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.severity === 'critical')).toBe(true);
    // Die Behörde ist bei allen NIS2-Fristen dieselbe — der Eintrag nennt deshalb die Frist selbst.
    expect(rows.map((r) => r.title)).toContain('NIS2-Frühwarnung (24 Stunden)');
    expect(rows.map((r) => r.title)).toContain('NIS2-Meldung (72 Stunden)');
    expect(rows[0].context).toContain('Verschlüsselungstrojaner im Dateiserver');
  });

  it('achtet den Horizont', async () => {
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({ title: 'Rezertifizierung vorbereiten', status: 'planned', dueDate: inDays(200) })
      .expect(201);

    const near = await http.get('/api/v1/deadlines?horizonDays=30').set(bearer(carla)).expect(200);
    const far = await http.get('/api/v1/deadlines?horizonDays=365').set(bearer(carla)).expect(200);
    const titles = (b: unknown) => (b as { title: string }[]).map((r) => r.title);
    expect(titles(near.body)).not.toContain('Rezertifizierung vorbereiten');
    expect(titles(far.body)).toContain('Rezertifizierung vorbereiten');
  });

  it('filtert auf die eigenen Verpflichtungen', async () => {
    const mine = await http.get('/api/v1/deadlines?mine=true').set(bearer(rita)).expect(200);
    const titles = (mine.body as { title: string; ownerPersonId: string }[]).map((r) => r.title);
    expect(titles).toContain('Notfallhandbuch aktualisieren');
    expect(titles).not.toContain('Protokollierung erweitern');
    for (const row of mine.body as { ownerPersonId: string }[]) {
      expect(row.ownerPersonId).toBe(ritaPersonId);
    }
  });

  it('führt ein geplantes Audit mit seinem Endtermin', async () => {
    const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(carla)).expect(200);
    const a517 = (reqs.body as { id: string; refCode: string }[]).find((r) => r.refCode === 'A.5.17')!;
    await http
      .post('/api/v1/audits')
      .set(bearer(carla))
      .send({
        title: 'Internes Audit 2026',
        frameworkKey: 'ISO27001',
        plannedTo: inDays(10),
        requirementIds: [a517.id],
      })
      .expect(201);

    const res = await http.get('/api/v1/deadlines').set(bearer(carla)).expect(200);
    const row = (res.body as { kind: string; title: string }[]).find((r) => r.kind === 'audit')!;
    expect(row.title).toBe('Internes Audit 2026');
  });

  it('zeigt eine Lesebestätigung auch ohne Dokumentenrecht — sie richtet sich an die Person', async () => {
    const doc = await http
      .post('/api/v1/documents')
      .set(bearer(carla))
      .send({ key: 'POL-01', title: 'Informationssicherheitsleitlinie', kind: 'policy' })
      .expect(201);
    const version = await http
      .post(`/api/v1/documents/${doc.body.id}/versions`)
      .set(bearer(carla))
      .send({ versionLabel: '1.0', contentMd: 'Leitlinie der Geschäftsführung.' })
      .expect(201);
    await http
      .post(`/api/v1/documents/${doc.body.id}/versions/${version.body.id}/submit`)
      .set(bearer(carla))
      .expect(201);
    await http
      .post(`/api/v1/documents/${doc.body.id}/versions/${version.body.id}/approve`)
      .set(bearer(mika))
      .expect(201);

    await http
      .post(`/api/v1/documents/${doc.body.id}/acknowledgements`)
      .set(bearer(carla))
      .send({ subject: 'Bitte bestätigen', dueAt: inDays(7) })
      .expect(201);

    const forRita = await http.get('/api/v1/deadlines').set(bearer(rita)).expect(200);
    const own = (forRita.body as { kind: string; title: string; ownerPersonId: string }[]).filter(
      (r) => r.kind === 'acknowledgement',
    );
    expect(own).toHaveLength(1);
    expect(own[0].title).toBe('Informationssicherheitsleitlinie');
    // Nur die eigene — die offenen Bestätigungen der Belegschaft gehen die Risk-Ownerin nichts an.
    expect(own[0].ownerPersonId).toBe(ritaPersonId);

    // Wer die Kampagne führt, sieht dagegen alle drei.
    const forCarla = await http.get('/api/v1/deadlines').set(bearer(carla)).expect(200);
    expect((forCarla.body as { kind: string }[]).filter((r) => r.kind === 'acknowledgement')).toHaveLength(3);
  });

  it('verdichtet die Lage für die Startseite', async () => {
    const res = await http.get('/api/v1/deadlines/summary').set(bearer(carla)).expect(200);
    expect(res.body.overdue).toBeGreaterThanOrEqual(1);
    expect(res.body.critical).toBeGreaterThanOrEqual(1);
    expect(res.body.next.length).toBeGreaterThan(0);
    expect(res.body.dueThisMonth).toBeGreaterThanOrEqual(res.body.dueThisWeek);
  });
});
