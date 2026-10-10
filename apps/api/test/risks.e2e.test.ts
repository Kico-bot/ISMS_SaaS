/**
 * Asset-Inventar und Risikoregister: eine Bewertung auf der 5×5-Matrix, Behandlungsplan,
 * Restrisiko-Übernahme mit Vier-Augen-Prinzip und die Traceability-Kette bis zur Norm.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let ciso = '';
let owner = '';
let ownerPersonId = '';
let assetId = '';
let riskId = '';
let measureId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

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
      tenantName: 'Risiko GmbH',
      tenantSlug: 'risiko',
      email: 'ciso@risiko.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  ciso = reg.body.accessToken;

  // Zweiter Nutzer als Asset-/Risk-Owner — für Ownership-Scoping und Funktionstrennung.
  const invite = await http
    .post('/api/v1/members')
    .set(bearer(ciso))
    .send({ email: 'owner@risiko.test', displayName: 'Olaf Owner', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'owner-passwort-2026' })
    .expect(200);
  owner = accepted.body.accessToken;
  const me = await http.get('/api/v1/auth/me').set(bearer(owner)).expect(200);
  ownerPersonId = me.body.personId;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Asset-Inventar', () => {
  it('legt ein Asset mit CIA-Bewertung an und vergibt eine Referenznummer', async () => {
    const res = await http
      .post('/api/v1/assets')
      .set(bearer(ciso))
      .send({
        name: 'PLM-Server-Cluster',
        category: 'system',
        type: 'supporting',
        classification: 'confidential',
        confidentiality: 3,
        integrity: 3,
        availability: 3,
        ownerPersonId,
        tags: ['plm', 'prod'],
      })
      .expect(201);
    expect(res.body.refNo).toBe('A-0001');
    assetId = res.body.id;
  });

  it('weist CIA-Werte außerhalb von 1–3 ab', async () => {
    await http
      .post('/api/v1/assets')
      .set(bearer(ciso))
      .send({ name: 'Ungültig', category: 'system', confidentiality: 5 })
      .expect(400);
  });

  it('lässt den Risk-Owner nur eigene Assets ändern', async () => {
    await http
      .patch(`/api/v1/assets/${assetId}`)
      .set(bearer(owner))
      .send({ description: 'Von mir gepflegt' })
      .expect(200);

    const fremd = await http
      .post('/api/v1/assets')
      .set(bearer(ciso))
      .send({ name: 'Fremdes Asset', category: 'application' })
      .expect(201);
    await http
      .patch(`/api/v1/assets/${fremd.body.id}`)
      .set(bearer(owner))
      .send({ description: 'nicht meins' })
      .expect(403);
  });

  it('verknüpft Assets mit einer Abhängigkeit', async () => {
    const db = await http
      .post('/api/v1/assets')
      .set(bearer(ciso))
      .send({ name: 'PLM-Datenbank', category: 'application' })
      .expect(201);
    await http
      .post(`/api/v1/assets/${assetId}/relations`)
      .set(bearer(ciso))
      .send({ toAssetId: db.body.id, relation: 'hosts' })
      .expect(204);
    const detail = await http.get(`/api/v1/assets/${assetId}`).set(bearer(ciso)).expect(200);
    expect(detail.body.relations).toHaveLength(1);
    expect(detail.body.relations[0].relation).toBe('hosts');
  });
});

describe('Risikoregister', () => {
  it('legt ein Risiko mit Asset-Bezug an', async () => {
    const res = await http
      .post('/api/v1/risks')
      .set(bearer(ciso))
      .send({ title: 'Ransomware auf PLM-Cluster', source: 'manual', ownerPersonId, assetIds: [assetId] })
      .expect(201);
    expect(res.body.refNo).toBe('R-0001');
    riskId = res.body.id;
  });

  it('berechnet Score und Stufe aus Eintrittswahrscheinlichkeit × Auswirkung', async () => {
    const res = await http
      .post(`/api/v1/risks/${riskId}/assessments`)
      .set(bearer(owner))
      .send({ likelihood: 3, impact: 5, note: 'Vor Maßnahmen' })
      .expect(201);
    expect(res.body.score).toBe(15);
    expect(res.body.level).toBe('critical');
    expect(res.body.status).toBe('assessed');
  });

  it('weist Werte außerhalb der 5×5-Matrix ab', async () => {
    await http
      .post(`/api/v1/risks/${riskId}/assessments`)
      .set(bearer(owner))
      .send({ likelihood: 6, impact: 3 })
      .expect(400);
  });

  it('verknüpft eine Maßnahme; die neue Bewertung zeigt, was sie gebracht hat', async () => {
    const m = await http
      .post('/api/v1/measures')
      .set(bearer(ciso))
      .send({ title: 'Immutable Backups + Wiederherstellungstests', status: 'implemented' })
      .expect(201);
    measureId = m.body.id;
    await http
      .post(`/api/v1/risks/${riskId}/measures`)
      .set(bearer(owner))
      .send({ measureId, effect: 'reduces_impact' })
      .expect(204);

    const res = await http
      .post(`/api/v1/risks/${riskId}/assessments`)
      .set(bearer(owner))
      .send({ likelihood: 2, impact: 4, note: 'Nach Backups' })
      .expect(201);
    expect(res.body.score).toBe(8);
    expect(res.body.level).toBe('medium');

    const detail = await http.get(`/api/v1/risks/${riskId}`).set(bearer(ciso)).expect(200);
    expect(detail.body.measures).toHaveLength(1);
    // Die Historie hält beide Bewertungen fest — vorher 15, heute 8.
    expect(
      (detail.body.history as { likelihood: number; impact: number }[]).map((h) => h.likelihood * h.impact),
    ).toEqual([8, 15]);
    expect(detail.body.treatment).toBe('mitigate');
  });

  it('belegt die Heatmap mit der aktuellen Bewertung', async () => {
    const res = await http.get('/api/v1/risks/matrix').set(bearer(ciso)).expect(200);
    expect(res.body.size).toBe(5);
    const cells = res.body.cells as { likelihood: number; impact: number; n: number }[];
    expect(cells.map((c) => [c.likelihood, c.impact])).toEqual([[2, 4]]);
    expect(res.body.byLevel.medium).toBe(1);
  });

  it('rechnet die Jahresschadenserwartung aus (FAIR-light)', async () => {
    const res = await http
      .patch(`/api/v1/risks/${riskId}/quantification`)
      .set(bearer(owner))
      .send({ aleFrequency: 0.5, lossMin: 10000, lossLikely: 80000, lossMax: 500000 })
      .expect(200);
    expect(res.body.ale).toBe(40000);
  });
});

describe('Restrisiko-Übernahme (Funktionstrennung)', () => {
  it('verweigert die Übernahme durch den Risk-Owner selbst', async () => {
    // Der Owner hat ohnehin kein risk.accept — geprüft wird, dass die Rolle das trennt.
    await http
      .post(`/api/v1/risks/${riskId}/accept`)
      .set(bearer(owner))
      .send({ validUntil: '2027-12-31', rationale: 'Ich übernehme das selbst.' })
      .expect(403);
  });

  it('blockiert sie auch dann, wenn der Freigebende zugleich Risk-Owner ist (DB-Trigger)', async () => {
    const eigen = await http
      .post('/api/v1/risks')
      .set(bearer(ciso))
      .send({
        title: 'Eigenes Risiko der CISO',
        ownerPersonId: (await http.get('/api/v1/auth/me').set(bearer(ciso))).body.personId,
      })
      .expect(201);
    await http
      .post(`/api/v1/risks/${eigen.body.id}/assessments`)
      .set(bearer(ciso))
      .send({ likelihood: 1, impact: 2 })
      .expect(201);

    const res = await http
      .post(`/api/v1/risks/${eigen.body.id}/accept`)
      .set(bearer(ciso))
      .send({ validUntil: '2027-12-31', rationale: 'Freigabe der eigenen Arbeit — muss scheitern.' })
      .expect(409);
    expect(res.body.type).toMatch(/sod-violation/);
  });

  it('erlaubt die Übernahme durch die CISO und friert die Bewertungsgrundlage ein', async () => {
    const res = await http
      .post(`/api/v1/risks/${riskId}/accept`)
      .set(bearer(ciso))
      .send({ validUntil: '2027-07-13', rationale: 'Restrisiko liegt im Risikoappetit; Backups getestet.' })
      .expect(201);
    expect(res.body.status).toBe('accepted');
    expect(res.body.acceptanceSnapshot.score).toBe(8);
    expect(res.body.acceptanceSnapshot.level).toBe('medium');
    expect(res.body.acceptanceSnapshot.thresholds).toEqual({ low: 4, medium: 9, high: 14 });
  });

  it('lässt die Übernahme stehen, wenn eine Überprüfung dieselbe Bewertung bestätigt', async () => {
    await http
      .post(`/api/v1/risks/${riskId}/assessments`)
      .set(bearer(owner))
      .send({ likelihood: 2, impact: 4, note: 'Jährliche Überprüfung: unverändert' })
      .expect(201);
    const detail = await http.get(`/api/v1/risks/${riskId}`).set(bearer(ciso)).expect(200);
    expect(detail.body.acceptedAt).not.toBeNull();
    expect(detail.body.status).toBe('accepted');
  });

  it('hebt die Übernahme auf, sobald sich die Bewertung ändert', async () => {
    await http
      .post(`/api/v1/risks/${riskId}/assessments`)
      .set(bearer(owner))
      .send({ likelihood: 3, impact: 4 })
      .expect(201);
    const detail = await http.get(`/api/v1/risks/${riskId}`).set(bearer(ciso)).expect(200);
    expect(detail.body.acceptedAt).toBeNull();
    expect(detail.body.acceptanceSnapshot).toBeNull();
  });
});

describe('Traceability Asset → Risiko → Maßnahme → Norm', () => {
  it('führt die Kette bis zur Framework-Anforderung', async () => {
    const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(ciso)).expect(200);
    const a813 = (reqs.body as { id: string; refCode: string }[]).find((r) => r.refCode === 'A.8.13')!;
    await http
      .post(`/api/v1/measures/${measureId}/requirements`)
      .set(bearer(ciso))
      .send({ requirementId: a813.id })
      .expect(201);

    const res = await http
      .get(`/api/v1/dashboard/traceability/asset/${assetId}`)
      .set(bearer(ciso))
      .expect(200);
    const row = (res.body as { refCode: string; riskRefNo: string; measureRefNo: string }[]).find(
      (r) => r.refCode === 'A.8.13',
    )!;
    expect(row.riskRefNo).toBe('R-0001');
    expect(row.measureRefNo).toBe('M-0001');
  });

  it('zählt die offenen Risiken in der Dashboard-Übersicht', async () => {
    const res = await http.get('/api/v1/dashboard/summary').set(bearer(ciso)).expect(200);
    expect(res.body.assets).toBe(3);
    expect(res.body.openRisks).toBe(2);
    expect(res.body.measuresImplemented).toBe(1);
  });
});
