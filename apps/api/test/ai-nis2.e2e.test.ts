/**
 * NIS2 und AI Act: wer ist gemeint, und was folgt daraus?
 *
 * - NIS2/DSGVO: Artikel an Mitgliedstaaten und Behörden zählen nirgends; NIS2 trägt die BSIG-Fundstelle.
 * - AI Act, nur Betreiber: Pflichten entstehen erst durch ein KI-System im Register, die Einstufung
 *   wird abgeleitet, und was der Betreiber schuldet, blockiert die Inbetriebnahme.
 * - Cockpit: welche Pflicht wie erfüllt ist — direkt, indirekt über verknüpfte Anforderungen, offen.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { aiFriaRequired, aiRiskClass } from '@isms/shared';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATOR_URL, prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let ciso = '';
let auditor = '';
let cisoPersonId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
type SoaRow = { refCode: string; altRef: string | null };
const soa = async (fw: string) =>
  (await http.get(`/api/v1/soa?framework=${fw}`).set(bearer(ciso)).expect(200)).body as SoaRow[];

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
      tenantName: 'Stadtwerk KI GmbH',
      tenantSlug: 'stadtwerk-ki',
      email: 'ciso@stadtwerk.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  ciso = reg.body.accessToken;
  cisoPersonId = (await http.get('/api/v1/auth/me').set(bearer(ciso)).expect(200)).body.personId;
  for (const frameworkKey of ['NIS2', 'DSGVO', 'BSI_GS', 'EU_AI_ACT']) {
    await http.post('/api/v1/frameworks/activate').set(bearer(ciso)).send({ frameworkKey }).expect(201);
  }
  const invite = await http
    .post('/api/v1/members')
    .set(bearer(ciso))
    .send({ email: 'audit@stadtwerk.test', displayName: 'Anke Auditorin', roleKeys: ['auditor'] })
    .expect(201);
  auditor = (
    await http
      .post('/api/v1/auth/accept-invite')
      .send({ token: invite.body.inviteToken, password: 'auditor-passwort-2026' })
      .expect(200)
  ).body.accessToken;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('NIS2 und DSGVO: nur Pflichten des Unternehmens', () => {
  it('führt von NIS2 nur Leitung, Art. 21 a)–j), Meldungen und Registrierung — mit BSIG-Fundstelle', async () => {
    const rows = await soa('NIS2');
    expect(rows.map((r) => r.refCode)).toEqual([
      'Art. 20',
      ...'abcdefghij'.split('').map((l) => `Art. 21 Abs. 2 ${l})`),
      'Art. 23',
      'Art. 27',
    ]);
    expect(rows.find((r) => r.refCode === 'Art. 21 Abs. 2 j)')!.altRef).toBe('§ 30 Abs. 2 Nr. 10 BSIG');
    expect(rows.find((r) => r.refCode === 'Art. 23')!.altRef).toBe('§ 32 BSIG');
  });

  it('lässt DSGVO-Artikel an Aufsichtsbehörden weg', async () => {
    const refs = (await soa('DSGVO')).map((r) => r.refCode);
    expect(refs).toContain('Art. 30');
    expect(refs).not.toContain('Art. 51');
    expect(refs).not.toContain('Art. 1');
    expect(refs).toHaveLength(45);
  });

  it('nennt den BSIG-Paragrafen auch im Export', async () => {
    const csv = await http.get('/api/v1/exports/soa.csv?framework=NIS2').set(bearer(ciso)).expect(200);
    expect(csv.text).toContain('Art. 21 Abs. 2 j) (§ 30 Abs. 2 Nr. 10 BSIG)');
  });
});

describe('KI-Register: nur Betreiberpflichten', () => {
  let hrId = '';

  it('zählt ohne KI-System keine einzige Pflicht des AI Act', async () => {
    expect(await soa('EU_AI_ACT')).toHaveLength(0);
  });

  it('löst mit einem einfachen System nur KI-Kompetenz und das Verbot aus', async () => {
    const res = await http
      .post('/api/v1/ai-systems')
      .set(bearer(ciso))
      .send({ name: 'Lastprognose', ownerPersonId: cisoPersonId })
      .expect(201);
    expect(res.body.refNo).toBe('KI-0001');
    expect(res.body.riskClass).toBe('minimal');
    expect((await soa('EU_AI_ACT')).map((r) => r.refCode)).toEqual(['Art. 4', 'Art. 5']);
    await http
      .patch(`/api/v1/ai-systems/${res.body.id}`)
      .set(bearer(ciso))
      .send({ status: 'active' })
      .expect(200);
  });

  it('blockiert ein Hochrisiko-System, solange Betreiberpflichten fehlen', async () => {
    const res = await http
      .post('/api/v1/ai-systems')
      .set(bearer(ciso))
      .send({
        name: 'Bewerbervorauswahl',
        annexIiiArea: 'employment',
        workplaceUse: true,
        logRetentionMonths: 3,
      })
      .expect(201);
    hrId = res.body.id;
    expect(res.body.riskClass).toBe('high');

    const blocked = await http
      .patch(`/api/v1/ai-systems/${hrId}`)
      .set(bearer(ciso))
      .send({ status: 'active' })
      .expect(400);
    expect(blocked.body.detail).toMatch(/Art\. 26 Abs\. 2/);
    expect(blocked.body.detail).toMatch(/sechs Monate/);
    expect(blocked.body.detail).toMatch(/Art\. 26 Abs\. 7/);

    // Hochrisiko-Pflichten zählen schon in Vorbereitung — man bereitet sich auf sie vor.
    const refs = (await soa('EU_AI_ACT')).map((r) => r.refCode);
    expect(refs).toContain('Art. 26 Abs. 2');
    expect(refs).toContain('Art. 86');
    expect(refs).not.toContain('Art. 27'); // keine öffentliche Stelle, kein Kredit/Versicherung

    const ok = await http
      .patch(`/api/v1/ai-systems/${hrId}`)
      .set(bearer(ciso))
      .send({
        oversightPersonId: cisoPersonId,
        instructionsReceived: true,
        logRetentionMonths: 6,
        workersInformedAt: '2026-09-01',
        status: 'active',
      })
      .expect(200);
    expect(ok.body.status).toBe('active');
    expect(ok.body.findings.filter((f: { severity: string }) => f.severity === 'error')).toHaveLength(0);
  });

  it('verlangt eine Grundrechte-Folgenabschätzung bei Kreditprüfung, nicht bei kritischer Infrastruktur', async () => {
    const kredit = await http
      .post('/api/v1/ai-systems')
      .set(bearer(ciso))
      .send({
        name: 'Bonitätsprüfung Neukunden',
        annexIiiArea: 'essential_services',
        creditOrInsurance: true,
        oversightPersonId: cisoPersonId,
        instructionsReceived: true,
        logRetentionMonths: 12,
      })
      .expect(201);
    expect(kredit.body.friaRequired).toBe(true);
    expect((await soa('EU_AI_ACT')).map((r) => r.refCode)).toContain('Art. 27');
    await http
      .patch(`/api/v1/ai-systems/${kredit.body.id}`)
      .set(bearer(ciso))
      .send({ status: 'active' })
      .expect(400);

    const netz = await http
      .post('/api/v1/ai-systems')
      .set(bearer(ciso))
      .send({ name: 'Netzprognose', annexIiiArea: 'critical_infrastructure', publicService: true })
      .expect(201);
    expect(netz.body.riskClass).toBe('high');
    expect(netz.body.friaRequired).toBe(false);
  });

  it('lässt eine verbotene Praxis nie in Betrieb gehen', async () => {
    const res = await http
      .post('/api/v1/ai-systems')
      .set(bearer(ciso))
      .send({
        name: 'Stimmungsanalyse im Callcenter',
        prohibitedPractices: ['emotion_recognition_work_education'],
      })
      .expect(201);
    expect(res.body.riskClass).toBe('prohibited');
    const r = await http
      .patch(`/api/v1/ai-systems/${res.body.id}`)
      .set(bearer(ciso))
      .send({ status: 'active' })
      .expect(400);
    expect(r.body.title).toMatch(/Verbotene KI-Praktik/);
    await http
      .patch(`/api/v1/ai-systems/${res.body.id}`)
      .set(bearer(ciso))
      .send({ status: 'retired' })
      .expect(200);
  });

  it('verlangt bei personenbezogenen Daten die Verknüpfung zum Verarbeitungsverzeichnis', async () => {
    const res = await http
      .post('/api/v1/ai-systems')
      .set(bearer(ciso))
      .send({ name: 'Chatbot Kundenservice', personalData: true })
      .expect(201);
    expect(res.body.findings.map((f: { message: string }) => f.message).join(' ')).toMatch(/Art\. 30 DSGVO/);
  });

  it('rechnet die Einstufung in der Datenbank genauso wie in der Oberfläche', async () => {
    const db = new Client({ connectionString: MIGRATOR_URL });
    await db.connect();
    try {
      const rows = (
        await db.query(`
          SELECT prohibited_practices, annex_iii_area, annex_i_product, art6_exception, emotion_or_biometric,
                 deepfake_or_public_text, public_service, credit_or_insurance, risk_class, fria_required
          FROM ai_system`)
      ).rows;
      expect(rows.length).toBeGreaterThan(4);
      for (const r of rows) {
        const input = {
          prohibitedPractices: r.prohibited_practices,
          annexIiiArea: r.annex_iii_area,
          annexIProduct: r.annex_i_product,
          art6Exception: r.art6_exception,
          emotionOrBiometric: r.emotion_or_biometric,
          deepfakeOrPublicText: r.deepfake_or_public_text,
          publicService: r.public_service,
          creditOrInsurance: r.credit_or_insurance,
        };
        expect(aiRiskClass(input)).toBe(r.risk_class);
        expect(aiFriaRequired(input)).toBe(r.fria_required);
      }
    } finally {
      await db.end();
    }
  });

  it('lässt die Auditorin lesen, aber nichts erfassen', async () => {
    await http.get('/api/v1/ai-systems').set(bearer(auditor)).expect(200);
    await http.post('/api/v1/ai-systems').set(bearer(auditor)).send({ name: 'Heimlich' }).expect(403);
  });

  it('startet bei einem schwerwiegenden KI-Vorfall die Fristen des Betreibers', async () => {
    const inc = await http
      .post('/api/v1/incidents')
      .set(bearer(ciso))
      .send({ title: 'Fehlprognose führt zu Abschaltung', severity: 'high' })
      .expect(201);
    const knownAt = '2026-10-01T08:00:00.000Z';
    const res = await http
      .post(`/api/v1/incidents/${inc.body.id}/mark-ai-serious`)
      .set(bearer(ciso))
      .send({ aiSystemId: hrId, kind: 'critical_infrastructure', knownAt })
      .expect(201);
    const obligations = res.body.obligations as { regime: string; dueAt: string | null }[];
    expect(obligations.find((o) => o.regime === 'ai_provider_notice')!.dueAt).toBeNull();
    expect(new Date(obligations.find((o) => o.regime === 'ai_authority_report')!.dueAt!).toISOString()).toBe(
      '2026-10-03T08:00:00.000Z',
    );
    await http
      .post(`/api/v1/incidents/${inc.body.id}/mark-ai-serious`)
      .set(bearer(ciso))
      .send({ aiSystemId: hrId })
      .expect(400);
    const detail = await http.get(`/api/v1/ai-systems/${hrId}`).set(bearer(ciso)).expect(200);
    expect(detail.body.incidents).toHaveLength(1);
  });

  it('nimmt Pflichten eines stillgelegten Systems wieder heraus', async () => {
    for (const s of (await http.get('/api/v1/ai-systems').set(bearer(ciso)).expect(200)).body as {
      id: string;
      riskClass: string;
    }[]) {
      if (s.riskClass === 'high')
        await http
          .patch(`/api/v1/ai-systems/${s.id}`)
          .set(bearer(ciso))
          .send({ status: 'retired' })
          .expect(200);
    }
    const refs = (await soa('EU_AI_ACT')).map((r) => r.refCode);
    expect(refs).toEqual(['Art. 4', 'Art. 5']);
  });
});

describe('Cockpit', () => {
  type Row = {
    id: string;
    refCode: string;
    status: string;
    links: { framework: string; refCode: string }[];
    indirectMeasures: { id: string; viaRefCode: string }[];
  };
  const cockpit = async () =>
    (await http.get('/api/v1/coverage-map?framework=NIS2').set(bearer(ciso)).expect(200)).body.rows as Row[];

  it('verknüpft jede NIS2-Pflicht mit ISO-Controls; Grundschutz-Bausteine erst nach der Modellierung', async () => {
    let j = (await cockpit()).find((r) => r.refCode === 'Art. 21 Abs. 2 j)')!;
    expect(j.links.filter((l) => l.framework === 'ISO27001').map((l) => l.refCode)).toEqual(
      expect.arrayContaining(['A.5.17', 'A.8.5']),
    );
    expect(j.links.some((l) => l.framework === 'BSI_GS')).toBe(false);
    expect(j.status).toBe('open');

    const reqs = (await http.get('/api/v1/frameworks/BSI_GS/requirements').set(bearer(ciso)).expect(200))
      .body as { id: string; refCode: string }[];
    const orp4 = reqs.find((r) => r.refCode === 'ORP.4')!;
    await http.put(`/api/v1/modeling/modules/${orp4.id}`).set(bearer(ciso)).send({}).expect(200);
    j = (await cockpit()).find((r) => r.refCode === 'Art. 21 Abs. 2 j)')!;
    expect(j.links.find((l) => l.framework === 'BSI_GS')!.refCode).toBe('ORP.4');
  });

  it('erkennt eine Pflicht als indirekt abgedeckt und übernimmt die Zuordnung mit einem Klick', async () => {
    const iso = (await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(ciso)).expect(200))
      .body as { id: string; refCode: string }[];
    const m = await http
      .post('/api/v1/measures')
      .set(bearer(ciso))
      .send({ title: 'MFA für alle Konten', status: 'implemented' })
      .expect(201);
    await http
      .post(`/api/v1/measures/${m.body.id}/requirements`)
      .set(bearer(ciso))
      .send({ requirementId: iso.find((r) => r.refCode === 'A.8.5')!.id })
      .expect(201);

    let j = (await cockpit()).find((r) => r.refCode === 'Art. 21 Abs. 2 j)')!;
    expect(j.status).toBe('indirect');
    expect(j.indirectMeasures.map((x) => x.id)).toContain(m.body.id);

    await http
      .post(`/api/v1/measures/${m.body.id}/requirements`)
      .set(bearer(ciso))
      .send({ requirementId: j.id, coverage: 'partial', fromCrosswalk: true })
      .expect(201);
    j = (await cockpit()).find((r) => r.refCode === 'Art. 21 Abs. 2 j)')!;
    expect(j.status).toBe('covered');
  });

  it('liefert das Flussdiagramm in drei Ebenen', async () => {
    const res = await http.get('/api/v1/coverage-map/flow?framework=NIS2').set(bearer(ciso)).expect(200);
    const layers = new Set((res.body.nodes as { layer: number }[]).map((n) => n.layer));
    expect([...layers].sort()).toEqual([0, 1, 2]);
    expect(res.body.links.length).toBeGreaterThan(20);
  });
});
