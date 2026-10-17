/**
 * Zertifizierungsreife nach ISO 27001 auf der Startseite: Anteil der 123 prüfbaren Punkte
 * (Kap. 4 bis 10 und Anhang A), die erfüllt oder begründet ausgeschlossen sind, dazu die
 * Kernnachweise, nach denen ein Auditor im Zertifizierungsaudit zuerst fragt.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let token = '';
const reqIds = new Map<string, string>();

interface Readiness {
  framework: string;
  total: number;
  fulfilled: number;
  partial: number;
  open: number;
  notApplicable: number;
  pct: number;
  evidence: { key: string; label: string; ok: boolean }[];
  evidenceMet: number;
}

const auth = () => ({ Authorization: `Bearer ${token}` });
const readiness = async () =>
  (await http.get('/api/v1/dashboard/certification-readiness').set(auth()).expect(200)).body as Readiness;

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
      tenantName: 'Reife AG',
      tenantSlug: 'reife',
      email: 'ciso@reife.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  token = reg.body.accessToken;
  const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(auth()).expect(200);
  for (const r of reqs.body as { id: string; refCode: string }[]) reqIds.set(r.refCode, r.id);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

async function implementedMeasure(title: string, refCode: string, coverage: 'full' | 'partial') {
  const m = await http.post('/api/v1/measures').set(auth()).send({ title }).expect(201);
  await http
    .post(`/api/v1/measures/${m.body.id}/requirements`)
    .set(auth())
    .send({ requirementId: reqIds.get(refCode), coverage })
    .expect(201);
  await http.patch(`/api/v1/measures/${m.body.id}`).set(auth()).send({ status: 'implemented' }).expect(200);
}

describe('Zertifizierungsreife ISO 27001', () => {
  it('zählt bei einem neuen Mandanten alle 123 Punkte als offen', async () => {
    const r = await readiness();
    expect(r.framework).toBe('ISO27001');
    expect(r.total).toBe(123);
    expect(r).toMatchObject({ fulfilled: 0, partial: 0, notApplicable: 0, open: 123, pct: 0 });
    expect(r.evidence.length).toBeGreaterThanOrEqual(8);
    const byKey = Object.fromEntries(r.evidence.map((e) => [e.key, e.ok]));
    expect(byKey.scope).toBe(false);
    expect(byKey.internalAudit).toBe(false);
    expect(byKey.managementReview).toBe(false);
    // Ohne Feststellungen gibt es auch keine offene Hauptabweichung.
    expect(byKey.noOpenMajorFindings).toBe(true);
  });

  it('zählt umgesetzte Maßnahmen voll, teilweise Abdeckung halb und begründete Ausschlüsse als erfüllt', async () => {
    await implementedMeasure('Mehrfaktor-Anmeldung', 'A.5.17', 'full');
    await implementedMeasure('Protokollierung teilweise', 'A.8.15', 'partial');
    await http
      .patch(`/api/v1/soa/${reqIds.get('A.7.9')}`)
      .set(auth())
      .send({ applicability: 'not_applicable', justification: 'Keine Werte außerhalb der Gelände.' })
      .expect(200);

    const r = await readiness();
    expect(r).toMatchObject({ fulfilled: 1, partial: 1, notApplicable: 1, open: 120 });
    // (1 + 1 + 0,5) / 123 = 2,03 % → gerundet 2
    expect(r.pct).toBe(2);
  });

  it('erkennt den festgelegten Geltungsbereich als Kernnachweis', async () => {
    await http
      .put('/api/v1/context/scope')
      .set(auth())
      .send({ statement: 'Netzbetrieb und Kundenservice am Standort Lindenbach.' })
      .expect(200);
    const r = await readiness();
    expect(r.evidence.find((e) => e.key === 'scope')?.ok).toBe(true);
    expect(r.evidenceMet).toBe(r.evidence.filter((e) => e.ok).length);
  });
});
