/**
 * Der Kern der Plattform: Eine Maßnahme erfüllt Anforderungen mehrerer Frameworks gleichzeitig.
 * Getestet am Beispiel MFA — ISO A.5.17 zieht per Crosswalk BSI-, NIS2- und DSGVO-Anforderungen nach sich.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let token = '';

interface Requirement {
  id: string;
  refCode: string;
  kind: string;
}
const reqIds = new Map<string, string>(); // "FRAMEWORK refCode" -> requirement.id

async function loadRequirements(frameworkKey: string): Promise<void> {
  const res = await http.get(`/api/v1/frameworks/${frameworkKey}/requirements`).set('Authorization', `Bearer ${token}`).expect(200);
  for (const r of res.body as Requirement[]) reqIds.set(`${frameworkKey} ${r.refCode}`, r.id);
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
    .send({ tenantName: 'Mapping AG', tenantSlug: 'mapping', email: 'ciso@mapping.test', password: 'korrekt-pferd-batterie-1', displayName: 'Carla CISO' })
    .expect(201);
  token = reg.body.accessToken;

  // Alle vier Frameworks aktivieren — erst dann schlägt der Crosswalk über sie hinweg vor.
  for (const key of ['BSI_GS', 'NIS2', 'DSGVO']) {
    await http.post('/api/v1/frameworks/activate').set('Authorization', `Bearer ${token}`).send({ frameworkKey: key }).expect(201);
  }
  for (const key of ['ISO27001', 'BSI_GS', 'NIS2', 'DSGVO']) await loadRequirements(key);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Multi-Framework-Mapping', () => {
  let measureId = '';

  it('legt die Maßnahme „MFA für alle Konten“ an', async () => {
    const res = await http
      .post('/api/v1/measures')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'MFA für alle Konten', domain: 'technological', status: 'implemented' })
      .expect(201);
    expect(res.body.refNo).toBe('M-0001');
    measureId = res.body.id;
  });

  it('schlägt beim Mappen auf ISO A.5.17 Anforderungen der anderen Frameworks vor', async () => {
    const iso = reqIds.get('ISO27001 A.5.17')!;
    expect(iso).toBeTruthy();
    const res = await http
      .post(`/api/v1/measures/${measureId}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requirementId: iso, coverage: 'full' })
      .expect(201);

    const frameworks = new Set((res.body.suggestions as { framework: string }[]).map((s) => s.framework));
    // BSI über die Zuordnungstabelle, NIS2/DSGVO über den kuratierten Crosswalk
    expect(frameworks.has('BSI_GS')).toBe(true);
    expect(frameworks.has('NIS2')).toBe(true);
    expect(frameworks.has('DSGVO')).toBe(true);
    const nis2 = (res.body.suggestions as { framework: string; refCode: string }[]).filter((s) => s.framework === 'NIS2');
    expect(nis2.some((s) => s.refCode.includes('Art. 21 Abs. 2 j'))).toBe(true);
  });

  it('übernimmt die Vorschläge und deckt damit vier Frameworks mit einer Maßnahme ab', async () => {
    const iso = reqIds.get('ISO27001 A.5.17')!;
    const suggestions = await http
      .get(`/api/v1/measures/${measureId}/requirements/${iso}/suggestions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Die BSI-Zuordnungstabelle verweist auf Bausteine (ORP.4); die kennzeichnet die API als Gruppe.
    expect((suggestions.body as { framework: string; isGroup: boolean }[]).some((s) => s.framework === 'BSI_GS' && s.isGroup)).toBe(true);

    for (const s of suggestions.body as { requirementId: string }[]) {
      await http
        .post(`/api/v1/measures/${measureId}/requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ requirementId: s.requirementId, coverage: 'partial', fromCrosswalk: true })
        .expect(201);
    }

    const detail = await http.get(`/api/v1/measures/${measureId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const mapped = new Set((detail.body.mappings as { framework: string }[]).map((m) => m.framework));
    expect([...mapped].sort()).toEqual(['BSI_GS', 'DSGVO', 'ISO27001', 'NIS2']);
    expect(detail.body.mappings.some((m: { createdVia: string }) => m.createdVia === 'crosswalk')).toBe(true);
  });

  it('zeigt die Maßnahme in der SoA-Zeile des Controls', async () => {
    const soa = await http.get('/api/v1/soa?framework=ISO27001&kind=control').set('Authorization', `Bearer ${token}`).expect(200);
    const row = (soa.body as { refCode: string; measureCount: number; implementedCount: number; measures: { refNo: string }[] }[]).find(
      (r) => r.refCode === 'A.5.17',
    )!;
    expect(row.measureCount).toBe(1);
    expect(row.implementedCount).toBe(1);
    expect(row.measures[0]!.refNo).toBe('M-0001');
    expect(soa.body).toHaveLength(93);

    // Ohne kind-Filter kommen die Normkapitel 4–10 dazu: sie sind zertifizierungsrelevant und bewertbar.
    const full = await http.get('/api/v1/soa?framework=ISO27001').set('Authorization', `Bearer ${token}`).expect(200);
    expect(full.body.length).toBeGreaterThan(93);
    expect((full.body as { refCode: string }[]).some((r) => r.refCode === '4.1')).toBe(true);
    // Reine Gliederungsknoten (Kapitel "6", Anhang "A") erscheinen nicht — sonst zählten sie doppelt.
    expect((full.body as { refCode: string }[]).some((r) => r.refCode === '6' || r.refCode === 'A')).toBe(false);
  });

  it('schlägt bereits gemappte Anforderungen nicht erneut vor', async () => {
    const iso = reqIds.get('ISO27001 A.5.17')!;
    const res = await http.get(`/api/v1/measures/${measureId}/requirements/${iso}/suggestions`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toHaveLength(0);
  });

  it('rechnet die Abdeckung je Framework im Dashboard aus', async () => {
    const res = await http.get('/api/v1/dashboard/coverage').set('Authorization', `Bearer ${token}`).expect(200);
    const byKey = Object.fromEntries((res.body as { key: string; covered: number; applicable: number; pct: number }[]).map((r) => [r.key, r]));
    expect(byKey.ISO27001!.applicable).toBeGreaterThan(93); // Annex A + Kapitel 4–10
    expect(byKey.ISO27001!.covered).toBe(1);
    expect(byKey.NIS2!.covered).toBeGreaterThan(0);
    expect(byKey.DSGVO!.covered).toBeGreaterThan(0);
    // Ein Mapping auf den Baustein ORP.4 zählt bewusst nicht als Abdeckung seiner Anforderungen …
    expect(byKey.BSI_GS!.covered).toBe(0);
  });

  it('zählt erst das Mapping auf eine konkrete BSI-Anforderung in die Abdeckung', async () => {
    // … erst die konkrete Anforderung ORP.4.A9 (Identitäts- und Berechtigungsmanagement) tut das.
    const bsi = reqIds.get('BSI_GS ORP.4.A9')!;
    expect(bsi).toBeTruthy();
    await http
      .post(`/api/v1/measures/${measureId}/requirements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requirementId: bsi, coverage: 'partial' })
      .expect(201);

    const res = await http.get('/api/v1/dashboard/coverage').set('Authorization', `Bearer ${token}`).expect(200);
    const bsiRow = (res.body as { key: string; covered: number }[]).find((r) => r.key === 'BSI_GS')!;
    expect(bsiRow.covered).toBe(1);
  });
});

describe('Statement of Applicability', () => {
  it('verlangt eine Begründung, wenn ein Control als nicht anwendbar erklärt wird', async () => {
    const req = reqIds.get('ISO27001 A.7.9')!;
    await http.patch(`/api/v1/soa/${req}`).set('Authorization', `Bearer ${token}`).send({ applicability: 'not_applicable' }).expect(400);
  });

  it('speichert Nichtanwendbarkeit mit Begründung und nimmt sie aus der Abdeckung heraus', async () => {
    const req = reqIds.get('ISO27001 A.7.9')!;
    const prev = await http.get('/api/v1/dashboard/coverage').set('Authorization', `Bearer ${token}`).expect(200);
    const before = (prev.body as { key: string; applicable: number }[]).find((r) => r.key === 'ISO27001')!;
    await http
      .patch(`/api/v1/soa/${req}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ applicability: 'not_applicable', justification: 'Keine Werte außerhalb der Betriebsgelände im Einsatz.' })
      .expect(200);

    const res = await http.get('/api/v1/dashboard/coverage').set('Authorization', `Bearer ${token}`).expect(200);
    const iso = (res.body as { key: string; applicable: number; notApplicable: number }[]).find((r) => r.key === 'ISO27001')!;
    expect(iso.applicable).toBe(before.applicable - 1);
    expect(iso.notApplicable).toBe(1);
  });

  it('speichert die Selbstbewertung (Reifegrad 0–5) und liefert sie je Kapitel aggregiert', async () => {
    const req = reqIds.get('ISO27001 A.5.17')!;
    await http.patch(`/api/v1/soa/${req}`).set('Authorization', `Bearer ${token}`).send({ maturity: 4, targetMaturity: 5 }).expect(200);
    await http.patch(`/api/v1/soa/${req}`).set('Authorization', `Bearer ${token}`).send({ maturity: 6 }).expect(400);

    const chapters = await http.get('/api/v1/soa/by-chapter?framework=ISO27001').set('Authorization', `Bearer ${token}`).expect(200);
    const a5 = (chapters.body as { refCode: string; avgMaturity: string | null; covered: number }[]).find((c) => c.refCode === 'A.5')!;
    expect(Number(a5.avgMaturity)).toBe(4);
    expect(a5.covered).toBe(1);
  });

  it('behält nicht übergebene Felder beim Teil-Update', async () => {
    const req = reqIds.get('ISO27001 A.5.17')!;
    const res = await http.patch(`/api/v1/soa/${req}`).set('Authorization', `Bearer ${token}`).send({ notes: 'Rollout Q4' }).expect(200);
    expect(res.body.maturity).toBe(4);
    expect(res.body.targetMaturity).toBe(5);
    expect(res.body.notes).toBe('Rollout Q4');
  });
});
