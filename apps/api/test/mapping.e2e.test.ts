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
  const res = await http
    .get(`/api/v1/frameworks/${frameworkKey}/requirements`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
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
    .send({
      tenantName: 'Mapping AG',
      tenantSlug: 'mapping',
      email: 'ciso@mapping.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  token = reg.body.accessToken;

  // Alle vier Frameworks aktivieren — erst dann schlägt der Crosswalk über sie hinweg vor.
  for (const key of ['BSI_GS', 'NIS2', 'DSGVO']) {
    await http
      .post('/api/v1/frameworks/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ frameworkKey: key })
      .expect(201);
  }
  for (const key of ['ISO27001', 'BSI_GS', 'NIS2', 'DSGVO']) await loadRequirements(key);

  // IT-Grundschutz zählt nur in modellierten Bausteinen — ORP.4 ist der, um den es hier geht.
  await http
    .put(`/api/v1/modeling/modules/${reqIds.get('BSI_GS ORP.4')}`)
    .set('Authorization', `Bearer ${token}`)
    .send({})
    .expect(200);
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
    const nis2 = (res.body.suggestions as { framework: string; refCode: string }[]).filter(
      (s) => s.framework === 'NIS2',
    );
    expect(nis2.some((s) => s.refCode.includes('Art. 21 Abs. 2 j'))).toBe(true);
  });

  it('übernimmt die Vorschläge und deckt damit vier Frameworks mit einer Maßnahme ab', async () => {
    const iso = reqIds.get('ISO27001 A.5.17')!;
    const suggestions = await http
      .get(`/api/v1/measures/${measureId}/requirements/${iso}/suggestions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Die BSI-Zuordnungstabelle verweist auf Bausteine (ORP.4); die kennzeichnet die API als Gruppe.
    expect(
      (suggestions.body as { framework: string; isGroup: boolean }[]).some(
        (s) => s.framework === 'BSI_GS' && s.isGroup,
      ),
    ).toBe(true);

    for (const s of suggestions.body as { requirementId: string }[]) {
      await http
        .post(`/api/v1/measures/${measureId}/requirements`)
        .set('Authorization', `Bearer ${token}`)
        .send({ requirementId: s.requirementId, coverage: 'partial', fromCrosswalk: true })
        .expect(201);
    }

    const detail = await http
      .get(`/api/v1/measures/${measureId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const mapped = new Set((detail.body.mappings as { framework: string }[]).map((m) => m.framework));
    expect([...mapped].sort()).toEqual(['BSI_GS', 'DSGVO', 'ISO27001', 'NIS2']);
    expect(detail.body.mappings.some((m: { createdVia: string }) => m.createdVia === 'crosswalk')).toBe(true);
  });

  it('zeigt die Maßnahme in der SoA-Zeile des Controls', async () => {
    const soa = await http
      .get('/api/v1/soa?framework=ISO27001&kind=control')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = (
      soa.body as {
        refCode: string;
        measureCount: number;
        implementedCount: number;
        measures: { refNo: string }[];
      }[]
    ).find((r) => r.refCode === 'A.5.17')!;
    expect(row.measureCount).toBe(1);
    expect(row.implementedCount).toBe(1);
    expect(row.measures[0]!.refNo).toBe('M-0001');
    expect(soa.body).toHaveLength(93);

    // Ohne kind-Filter kommen die Normkapitel 4–10 dazu: sie sind zertifizierungsrelevant und bewertbar.
    const full = await http
      .get('/api/v1/soa?framework=ISO27001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Jeder Normpunkt ist erfassbar: 30 Unterkapitel aus Kap. 4 bis 10 und 93 aus Anhang A
    // (docs/iso27001-abdeckung.md). Fehlt einer, hat ein Auditor eine Frage ohne Antwortfeld.
    expect(full.body).toHaveLength(123);
    expect((full.body as { refCode: string }[]).map((r) => r.refCode)).toEqual(
      expect.arrayContaining(['4.3', '6.1.2', '7.5.3', '9.2.2', '9.3.3', '10.2', 'A.8.34']),
    );
    expect((full.body as { refCode: string }[]).some((r) => r.refCode === '4.1')).toBe(true);
    // Reine Gliederungsknoten (Kapitel "6", Anhang "A") erscheinen nicht — sonst zählten sie doppelt.
    expect((full.body as { refCode: string }[]).some((r) => r.refCode === '6' || r.refCode === 'A')).toBe(
      false,
    );
  });

  it('schlägt bereits gemappte Anforderungen nicht erneut vor', async () => {
    const iso = reqIds.get('ISO27001 A.5.17')!;
    const res = await http
      .get(`/api/v1/measures/${measureId}/requirements/${iso}/suggestions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(0);
  });

  it('rechnet die Abdeckung je Framework im Dashboard aus', async () => {
    const res = await http
      .get('/api/v1/dashboard/coverage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const byKey = Object.fromEntries(
      (res.body as { key: string; covered: number; applicable: number; pct: number }[]).map((r) => [
        r.key,
        r,
      ]),
    );
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

    const res = await http
      .get('/api/v1/dashboard/coverage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const bsiRow = (res.body as { key: string; covered: number }[]).find((r) => r.key === 'BSI_GS')!;
    expect(bsiRow.covered).toBe(1);
  });
});

describe('Statement of Applicability', () => {
  it('verlangt eine Begründung, wenn ein Control als nicht anwendbar erklärt wird', async () => {
    const req = reqIds.get('ISO27001 A.7.9')!;
    await http
      .patch(`/api/v1/soa/${req}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ applicability: 'not_applicable' })
      .expect(400);
  });

  it('speichert Nichtanwendbarkeit mit Begründung und nimmt sie aus der Abdeckung heraus', async () => {
    const req = reqIds.get('ISO27001 A.7.9')!;
    const prev = await http
      .get('/api/v1/dashboard/coverage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const before = (prev.body as { key: string; applicable: number }[]).find((r) => r.key === 'ISO27001')!;
    await http
      .patch(`/api/v1/soa/${req}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        applicability: 'not_applicable',
        justification: 'Keine Werte außerhalb der Betriebsgelände im Einsatz.',
      })
      .expect(200);

    const res = await http
      .get('/api/v1/dashboard/coverage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const iso = (res.body as { key: string; applicable: number; notApplicable: number }[]).find(
      (r) => r.key === 'ISO27001',
    )!;
    expect(iso.applicable).toBe(before.applicable - 1);
    expect(iso.notApplicable).toBe(1);
  });

  it('speichert die Selbstbewertung (Reifegrad 0–5) und liefert sie je Kapitel aggregiert', async () => {
    const req = reqIds.get('ISO27001 A.5.17')!;
    await http
      .patch(`/api/v1/soa/${req}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ maturity: 4, targetMaturity: 5 })
      .expect(200);
    await http
      .patch(`/api/v1/soa/${req}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ maturity: 6 })
      .expect(400);

    const chapters = await http
      .get('/api/v1/soa/by-chapter?framework=ISO27001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const a5 = (chapters.body as { refCode: string; avgMaturity: string | null; covered: number }[]).find(
      (c) => c.refCode === 'A.5',
    )!;
    expect(Number(a5.avgMaturity)).toBe(4);
    expect(a5.covered).toBe(1);
  });

  it('behält nicht übergebene Felder beim Teil-Update', async () => {
    const req = reqIds.get('ISO27001 A.5.17')!;
    const res = await http
      .patch(`/api/v1/soa/${req}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Rollout Q4' })
      .expect(200);
    expect(res.body.maturity).toBe(4);
    expect(res.body.targetMaturity).toBe(5);
    expect(res.body.notes).toBe('Rollout Q4');
  });
});

describe('Aktivierung der Frameworks', () => {
  it('führt jedes Framework mit Status, Hauptnorm und Anzahl der Anforderungen', async () => {
    const res = await http.get('/api/v1/frameworks').set('Authorization', `Bearer ${token}`).expect(200);
    const rows = res.body as {
      key: string;
      isActive: boolean;
      isPrimary: boolean;
      requirementCount: number;
    }[];
    const iso = rows.find((f) => f.key === 'ISO27001')!;
    expect(iso.isActive).toBe(true);
    expect(iso.isPrimary).toBe(true);
    expect(iso.requirementCount).toBeGreaterThan(50);
    expect(rows.find((f) => f.key === 'NIS2')!.isActive).toBe(true);
  });

  it('lässt die Hauptnorm nicht abwählen, solange sie die Hauptnorm ist', async () => {
    const res = await http
      .delete('/api/v1/frameworks/ISO27001/activate')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.detail).toContain('Hauptnorm');
  });

  it('verschiebt die Hauptnorm und wählt danach ab — die SoA-Einträge bleiben erhalten', async () => {
    const req = reqIds.get('ISO27001 A.7.9')!;
    await http
      .patch(`/api/v1/soa/${req}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ applicability: 'not_applicable', justification: 'Keine Werte außerhalb des Geländes.' })
      .expect(200);

    await http
      .post('/api/v1/frameworks/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ frameworkKey: 'BSI_GS', isPrimary: true })
      .expect(201);
    await http
      .delete('/api/v1/frameworks/ISO27001/activate')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const rows = (await http.get('/api/v1/frameworks').set('Authorization', `Bearer ${token}`).expect(200))
      .body as { key: string; isActive: boolean; isPrimary: boolean }[];
    expect(rows.find((f) => f.key === 'ISO27001')!.isActive).toBe(false);
    expect(rows.find((f) => f.key === 'BSI_GS')!.isPrimary).toBe(true);

    // Wieder aktivieren: die Begründung steht unverändert da, sie hing nie an der Aktivierung.
    await http
      .post('/api/v1/frameworks/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ frameworkKey: 'ISO27001' })
      .expect(201);
    const soa = await http
      .get('/api/v1/soa?framework=ISO27001')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const a79 = (soa.body as { refCode: string; applicability: string; justification: string | null }[]).find(
      (r) => r.refCode === 'A.7.9',
    )!;
    expect(a79.applicability).toBe('not_applicable');
    expect(a79.justification).toContain('Geländes');
  });

  it('lässt das letzte aktive Framework nicht abwählen', async () => {
    for (const key of ['NIS2', 'DSGVO', 'ISO27001']) {
      await http
        .delete(`/api/v1/frameworks/${key}/activate`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    }
    const res = await http
      .delete('/api/v1/frameworks/BSI_GS/activate')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.detail).toContain('normative Grundlage');
  });
});

describe('IT-Grundschutz: Modellierung', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  type Row = { refCode: string; level: string | null; checkStatus: string };
  const bsiSoa = async () =>
    (await http.get('/api/v1/soa?framework=BSI_GS').set(auth()).expect(200)).body as Row[];
  const modeling = async () =>
    (await http.get('/api/v1/modeling?framework=BSI_GS').set(auth()).expect(200)).body as {
      protectionVariant: string;
      inScopeCount: number;
      modules: { refCode: string; modeled: boolean; basisCount: number; standardCount: number }[];
    };

  it('zeigt im Check nur die Anforderungen modellierter Bausteine', async () => {
    const m = await modeling();
    expect(m.modules.length).toBeGreaterThan(100);
    expect(m.modules.filter((x) => x.modeled).map((x) => x.refCode)).toEqual(['ORP.4']);
    const orp4 = m.modules.find((x) => x.refCode === 'ORP.4')!;
    // Standard-Absicherung: Basis + Standard, ohne erhöhten Schutzbedarf
    expect(m.protectionVariant).toBe('standard');
    expect(m.inScopeCount).toBe(orp4.basisCount + orp4.standardCount);

    const rows = await bsiSoa();
    expect(rows).toHaveLength(m.inScopeCount);
    expect(rows.every((r) => r.refCode.startsWith('ORP.4.'))).toBe(true);
    expect(rows.some((r) => r.level === 'erhoeht')).toBe(false);
  });

  it('leitet den Check-Status aus den Maßnahmen ab', async () => {
    const rows = await bsiSoa();
    // ORP.4.A9 hängt mit „teilweise“ an einer umgesetzten Maßnahme
    expect(rows.find((r) => r.refCode === 'ORP.4.A9')!.checkStatus).toBe('partial');
    expect(rows.some((r) => r.checkStatus === 'no')).toBe(true);
  });

  it('schränkt die Basis-Absicherung auf Basis-Anforderungen ein', async () => {
    await http
      .patch('/api/v1/modeling/variant')
      .set(auth())
      .send({ framework: 'BSI_GS', protectionVariant: 'basis' })
      .expect(200);
    const rows = await bsiSoa();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.level === 'basis')).toBe(true);
    await http
      .patch('/api/v1/modeling/variant')
      .set(auth())
      .send({ framework: 'BSI_GS', protectionVariant: 'standard' })
      .expect(200);
  });

  it('schaltet erhöhten Schutzbedarf je Baustein zu', async () => {
    await http
      .put(`/api/v1/modeling/modules/${reqIds.get('BSI_GS ORP.4')}`)
      .set(auth())
      .send({ elevated: true, note: 'Administrative Konten' })
      .expect(200);
    expect((await bsiSoa()).some((r) => r.level === 'erhoeht')).toBe(true);
    await http
      .put(`/api/v1/modeling/modules/${reqIds.get('BSI_GS ORP.4')}`)
      .set(auth())
      .send({ elevated: false })
      .expect(200);
  });

  it('zählt eine Zuordnung erst, wenn ihr Baustein modelliert ist — und vergisst sie nicht', async () => {
    const coverage = async () =>
      (
        (await http.get('/api/v1/dashboard/coverage').set(auth()).expect(200)).body as {
          key: string;
          covered: number;
          applicable: number;
        }[]
      ).find((r) => r.key === 'BSI_GS')!;
    const m = await http
      .post('/api/v1/measures')
      .set(auth())
      .send({ title: 'Datensicherungskonzept', status: 'implemented' })
      .expect(201);
    await http
      .post(`/api/v1/measures/${m.body.id}/requirements`)
      .set(auth())
      .send({ requirementId: reqIds.get('BSI_GS CON.3.A5'), coverage: 'full' })
      .expect(201);
    const before = await coverage();

    await http
      .put(`/api/v1/modeling/modules/${reqIds.get('BSI_GS CON.3')}`)
      .set(auth())
      .send({})
      .expect(200);
    const after = await coverage();
    expect(after.covered).toBe(before.covered + 1);
    expect(after.applicable).toBeGreaterThan(before.applicable);
    expect((await bsiSoa()).find((r) => r.refCode === 'CON.3.A5')!.checkStatus).toBe('yes');

    // Abwählen nimmt CON.3 aus dem Check, die Zuordnung an der Maßnahme bleibt bestehen.
    await http
      .delete(`/api/v1/modeling/modules/${reqIds.get('BSI_GS CON.3')}`)
      .set(auth())
      .expect(204);
    expect((await coverage()).covered).toBe(before.covered);
    const detail = await http.get(`/api/v1/measures/${m.body.id}`).set(auth()).expect(200);
    expect(detail.body.mappings).toHaveLength(1);
  });

  it('modelliert nur Bausteine, keine Einzelanforderungen', async () => {
    await http
      .put(`/api/v1/modeling/modules/${reqIds.get('BSI_GS ORP.4.A1')}`)
      .set(auth())
      .send({})
      .expect(400);
  });

  it('übernimmt auf Wunsch die Prozess-Bausteine für den ganzen Informationsverbund', async () => {
    const res = await http.post('/api/v1/modeling/baseline?framework=BSI_GS').set(auth()).expect(201);
    expect(res.body.added).toBeGreaterThan(10); // ORP.4 war schon modelliert und zählt nicht doppelt
    const modeled = (await modeling()).modules.filter((x) => x.modeled).map((x) => x.refCode);
    expect(modeled).toEqual(expect.arrayContaining(['ISMS.1', 'ORP.4', 'DER.2.1']));
    expect(modeled.some((r) => r.startsWith('SYS.'))).toBe(false);
  });

  it('exportiert statt einer SoA Modellierung und IT-Grundschutz-Check', async () => {
    const csv = await http.get('/api/v1/exports/soa.csv?framework=BSI_GS').set(auth()).expect(200);
    expect(csv.headers['content-disposition']).toContain('grundschutz-check-bsi_gs');
    expect(csv.text).toContain('Umsetzung');
    const doc = await http.get('/api/v1/exports/soa.html?framework=BSI_GS').set(auth()).expect(200);
    expect(doc.text).toContain('Modellierung');
    expect(doc.text).toContain('ISMS.1');
  });
});
