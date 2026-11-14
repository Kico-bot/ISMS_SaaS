/**
 * Die Demodaten sind kein Beiwerk: sie legen einen vollständigen Mandanten über dieselben
 * Dienste an wie der laufende Betrieb. Damit sind sie zugleich ein Integrationstest über alle
 * Module hinweg — inklusive Vier-Augen-Prinzip, Prüfregeln und Zeilensicherheit.
 *
 * Bricht der Seed, bricht dieser Test. Genau das ist der Zweck: sonst fällt es erst auf, wenn
 * jemand die Anwendung vorführen will.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplicationContext;
let tenantId = '';
let query: (text: string) => Promise<Record<string, unknown>[]>;

beforeAll(async () => {
  setTestEnv();
  await prepareTestDatabase();
  const { AppModule } = await import('../src/app.module');
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const { seedDemoTenant, TENANT_SLUG } = await import('../src/demo-seed');
  await seedDemoTenant(app);

  const { DbService } = await import('../src/kernel/db/db.service');
  const dbs = app.get(DbService);
  const [tenant] = (await dbs.platform(
    async (tx) => (await tx.execute(sql`SELECT id FROM tenant WHERE slug = ${TENANT_SLUG}`)).rows,
  )) as { id: string }[];
  tenantId = tenant!.id;
  query = async (text: string) =>
    (await dbs.tenant(tenantId, async (tx) => (await tx.execute(sql.raw(text))).rows)) as Record<
      string,
      unknown
    >[];
}, 300_000);

afterAll(async () => {
  await app?.close();
});

const count = async (text: string): Promise<number> => Number((await query(text))[0]!.n);

describe('Demodaten', () => {
  it('legt den Mandanten mit Konten und Beschäftigten ohne Zugang an', async () => {
    expect(await count(`SELECT count(*)::int AS n FROM person WHERE tenant_id = '${tenantId}'`)).toBe(9);
    // Vier der neun melden sich nie an — Verantwortung muss auch ihnen zuweisbar sein.
    const ohneZugang = await count(
      `SELECT count(*)::int AS n FROM person WHERE tenant_id = '${tenantId}' AND user_id IS NULL`,
    );
    expect(ohneZugang).toBe(4);
  });

  it('bedient mit einer Maßnahme mehrere Normen zugleich', async () => {
    const rows = await query(`
      SELECT f.key, count(DISTINCT mr.requirement_id)::int AS n
      FROM measure_requirement mr
      JOIN requirement r ON r.id = mr.requirement_id
      JOIN framework f ON f.id = r.framework_id
      WHERE mr.tenant_id = '${tenantId}'
      GROUP BY f.key`);
    const byFramework = new Map(rows.map((r) => [r.key as string, Number(r.n)]));
    // Auch die abgeschalteten Regelwerke behalten ihre Zuordnungen: Zuschalten genügt.
    for (const key of ['ISO27001', 'BSI_GS', 'NIS2', 'DSGVO', 'EU_AI_ACT']) {
      expect(byFramework.get(key) ?? 0).toBeGreaterThan(0);
    }

    // Die MFA-Maßnahme allein zahlt auf mindestens drei Regelwerke ein.
    const [mfa] = await query(`
      SELECT count(DISTINCT f.key)::int AS n
      FROM measure m
      JOIN measure_requirement mr ON mr.measure_id = m.id
      JOIN requirement r ON r.id = mr.requirement_id
      JOIN framework f ON f.id = r.framework_id
      WHERE m.tenant_id = '${tenantId}' AND m.title LIKE 'Mehrfaktor%'`);
    expect(Number(mfa!.n)).toBeGreaterThanOrEqual(3);
  });

  it('hält die Vier-Augen-Regeln ein, die es selbst auslöst', async () => {
    // Freigabe einer Dokumentenfassung nie durch die Autorin.
    const selbstfreigaben = await count(`
      SELECT count(*)::int AS n FROM document_version
      WHERE tenant_id = '${tenantId}' AND approved_by_user_id = author_user_id`);
    expect(selbstfreigaben).toBe(0);

    // Risikoakzeptanz nie durch die Person, der das Risiko gehört.
    const selbstakzeptanz = await count(`
      SELECT count(*)::int AS n FROM risk r
      JOIN person p ON p.id = r.owner_person_id
      WHERE r.tenant_id = '${tenantId}' AND r.accepted_by_user_id = p.user_id`);
    expect(selbstakzeptanz).toBe(0);

    // Freigabe einer geplanten Änderung (Kap. 6.3) nie durch die planende Person.
    const selbstfreigabeAenderung = await count(`
      SELECT count(*)::int AS n FROM change_plan_entry
      WHERE tenant_id = '${tenantId}' AND approved_by_user_id = created_by_user_id`);
    expect(selbstfreigabeAenderung).toBe(0);
  });

  it('zeigt das Organigramm samt unbesetzter Stellen und belegt eine Feststellung', async () => {
    // Der Fachkräftemangel steht im PESTLE-Register — im Organigramm ist er sichtbar.
    const vakanzen = await count(
      `SELECT count(*)::int AS n FROM org_unit WHERE tenant_id = '${tenantId}' AND kind = 'vacancy'`,
    );
    expect(vakanzen).toBeGreaterThanOrEqual(2);

    // Genau ein Wurzelknoten: ein Organigramm mit zwei Spitzen wäre keines.
    const wurzeln = await count(
      `SELECT count(*)::int AS n FROM org_unit WHERE tenant_id = '${tenantId}' AND parent_id IS NULL`,
    );
    expect(wurzeln).toBe(1);

    // Kap. 10.2: an einer Feststellung hängt der Beleg, der ihre Behebung zeigt.
    const belege = await count(`
      SELECT count(*)::int AS n FROM finding_evidence fe
      JOIN finding f ON f.id = fe.finding_id
      WHERE f.tenant_id = '${tenantId}'`);
    expect(belege).toBeGreaterThanOrEqual(1);
  });

  it('erzeugt laufende Meldefristen nach NIS2 und DSGVO', async () => {
    const rows = await query(`
      SELECT DISTINCT regime::text AS regime FROM reporting_obligation WHERE tenant_id = '${tenantId}'`);
    const regimes = rows.map((r) => r.regime as string);
    expect(regimes.some((r) => r.startsWith('nis2'))).toBe(true);
    expect(regimes).toContain('gdpr_art33');
  });

  it('zeigt je ein Beispiel für Behandlung, Lieferantenbewertung und Leitlinie aus der Vorlage', async () => {
    // Kap. 6.1.3 a): jedes Risiko (nicht die Chance) trägt eine Behandlungsoption.
    expect(
      await count(`SELECT count(*)::int AS n FROM risk
                   WHERE tenant_id = '${tenantId}' AND kind = 'risk' AND treatment IS NULL`),
    ).toBe(0);
    // A.5.19 bis A.5.22: zwei bewertete Lieferanten mit nächstem Prüftermin.
    expect(
      await count(`SELECT count(*)::int AS n FROM asset
                   WHERE tenant_id = '${tenantId}' AND category = 'supplier'
                     AND supplier_assessed_at IS NOT NULL AND supplier_next_review_at IS NOT NULL`),
    ).toBe(2);
    // Kap. 5.2: die Leitlinie beginnt als Entwurf aus der Vorlage und ist als 1.0 freigegeben.
    const [v] = await query(`
      SELECT string_agg(v.version_label, ',' ORDER BY v.created_at) AS labels,
             bool_or(v.content_md LIKE '%Stadtwerke Lindenbach GmbH%') AS filled
      FROM document d JOIN document_version v ON v.document_id = d.id
      WHERE d.tenant_id = '${tenantId}' AND d.key = 'RL-01'`);
    expect(v).toMatchObject({ labels: '0.1,1.0', filled: true });
  });

  it('füllt jedes Register, das die Anwendung anzeigt', async () => {
    for (const [table, mindestens] of [
      ['asset', 6],
      ['risk', 5],
      ['measure', 9],
      ['document', 3],
      ['incident', 3],
      ['business_process', 3],
      ['processing_activity', 3],
      ['finding', 3],
      ['action', 3],
      ['kpi', 7],
      ['interested_party', 5],
      ['pestle_factor', 5],
      ['security_objective', 3],
      ['skill', 5],
      ['training', 3],
      ['communication_plan_entry', 5],
      ['change_plan_entry', 3],
      ['org_unit', 10],
    ] as [string, number][]) {
      expect(
        await count(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = '${tenantId}'`),
      ).toBeGreaterThanOrEqual(mindestens);
    }
  });

  it('legt nichts ein zweites Mal an', async () => {
    const { seedDemoTenant } = await import('../src/demo-seed');
    const vorher = await count(`SELECT count(*)::int AS n FROM measure WHERE tenant_id = '${tenantId}'`);
    await seedDemoTenant(app);
    const nachher = await count(`SELECT count(*)::int AS n FROM measure WHERE tenant_id = '${tenantId}'`);
    // Der zweite Lauf darf den Bestand nicht verdoppeln.
    expect(nachher).toBe(vorher);
  });
});

describe('Sperre gegen Produktion', () => {
  it('legt unter NODE_ENV=production keine Demodaten an, auch nicht über seedDemoTenant', async () => {
    const { seedDemoTenant } = await import('../src/demo-seed');
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seedDemoTenant(app)).rejects.toThrow(/Produktion/);
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});

/**
 * Die Vorführung: nur ISO 27001 und NIS2. Jede der 13 NIS2-Pflichten
 * hat eine Antwort, und drei Zustände sind absichtlich für die Präsentation vorbereitet: eine
 * Maßnahme in Umsetzung, die man live auf „umgesetzt“ setzt, eine indirekt erfüllte Pflicht für
 * „Zuordnung übernehmen“ und die Registrierung beim BSI, die ISO 27001 nicht abdeckt.
 */
describe('Vorführung ISO 27001 und NIS2', () => {
  const activeFrameworks = async () =>
    (
      await query(`
      SELECT f.key, tf.is_primary AS "isPrimary" FROM tenant_framework tf
      JOIN framework f ON f.id = tf.framework_id WHERE tf.tenant_id = '${tenantId}' ORDER BY f.key`)
    ).map((r) => `${r.key as string}${r.isPrimary ? ' (führend)' : ''}`);

  it('aktiviert ISO 27001 und NIS2, alles andere bleibt aus', async () => {
    expect(await activeFrameworks()).toEqual(['ISO27001 (führend)', 'NIS2']);
  });

  it('führt ein KI-Risiko im normalen Risikoregister, mit Maßnahme nach ISO 27001', async () => {
    const [row] = await query(`
      SELECT r.status, a.likelihood, a.impact, m.title AS measure FROM risk r
      JOIN risk_assessment a ON a.risk_id = r.id
      JOIN risk_measure rm ON rm.risk_id = r.id JOIN measure m ON m.id = rm.measure_id
      WHERE r.tenant_id = '${tenantId}' AND r.title LIKE '%öffentliche KI-Chatbots%'`);
    expect(row).toMatchObject({
      likelihood: 3,
      impact: 4,
      measure: 'Richtlinie zur Nutzung von KI-Diensten',
    });
  });

  it('behält Modellierung und Verarbeitungsverzeichnis der abgeschalteten Regelwerke', async () => {
    expect(
      await count(`SELECT count(*)::int AS n FROM tenant_module WHERE tenant_id = '${tenantId}'`),
    ).toBeGreaterThan(5);
    expect(
      await count(`SELECT count(*)::int AS n FROM processing_activity WHERE tenant_id = '${tenantId}'`),
    ).toBeGreaterThan(0);
  });

  it('beantwortet jede NIS2-Pflicht, mit den vorbereiteten Zuständen für die Präsentation', async () => {
    const { CoverageMapService } = await import('../src/modules/soa/coverage-map.service');
    const map = await app.get(CoverageMapService).map(tenantId, 'NIS2');
    const status = new Map(map.rows.map((r) => [r.refCode, r.status]));
    expect(map.rows.filter((r) => r.status === 'open').map((r) => r.refCode)).toEqual([]);
    expect(map.rows.filter((r) => r.status === 'covered').length).toBeGreaterThanOrEqual(9);
    // „Zuordnung übernehmen“: ein umgesetztes Berechtigungskonzept hängt nur an ISO-Controls.
    expect(status.get('Art. 21 Abs. 2 i)')).toBe('indirect');
    // Was ISO 27001 nicht abdeckt: die Registrierung beim BSI ist geplant, nicht erledigt.
    expect(status.get('Art. 27')).toBe('in_progress');
  });

  it('bereitet eine technische Maßnahme vor, die live auf „umgesetzt“ gesetzt wird', async () => {
    const rows = await query(`
      SELECT m.status::text AS status, f.key || ' ' || r.ref_code AS ref
      FROM measure m
      JOIN measure_requirement mr ON mr.measure_id = m.id
      JOIN requirement r ON r.id = mr.requirement_id
      JOIN framework f ON f.id = r.framework_id
      WHERE m.tenant_id = '${tenantId}' AND m.title LIKE 'Schwachstellen%'`);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(['in_progress']));
    expect(rows.map((r) => r.ref)).toEqual(
      expect.arrayContaining(['ISO27001 A.8.8', 'NIS2 Art. 21 Abs. 2 e)']),
    );
  });

  it('zeigt auf der Startseite die Maßnahmen, die mehrere aktive Regelwerke zugleich erfüllen', async () => {
    const { DashboardService } = await import('../src/modules/dashboard/dashboard.service');
    const shared = await app.get(DashboardService).sharedMeasures(tenantId);
    expect(shared.total).toBeGreaterThan(0);
    expect(shared.shared).toBeGreaterThanOrEqual(8);
    const mfa = shared.items.find((m) => m.title.startsWith('Mehrfaktor'));
    expect(mfa?.frameworks.map((f) => f.key)).toEqual(['ISO27001', 'NIS2']);
    expect(mfa?.frameworks[1]!.refs).toContainEqual({
      refCode: 'Art. 21 Abs. 2 j)',
      altRef: '§ 30 Abs. 2 Nr. 10 BSIG',
    });
    // Abgeschaltete Regelwerke erscheinen nicht, ihre Zuordnungen bleiben trotzdem gespeichert.
    const keys = new Set(shared.items.flatMap((m) => m.frameworks.map((f) => f.key)));
    expect(keys.has('BSI_GS') || keys.has('DSGVO')).toBe(false);
  });

  it('zeigt in der Maßnahmenliste nur aktive Regelwerke', async () => {
    const { MeasuresService } = await import('../src/modules/measures/measures.service');
    const list = await app.get(MeasuresService).list(tenantId, { page: 1, size: 100 } as never);
    const mfa = (list.items as { title: string; frameworks: string[] }[]).find((m) =>
      m.title.startsWith('Mehrfaktor'),
    );
    expect(mfa?.frameworks.sort()).toEqual(['ISO27001', 'NIS2']);
  });
});

/**
 * Programme: Stand, Schritte und nächster Schritt für ISO 27001, NIS2 und AI Act, abgeleitet aus
 * den vorhandenen Daten. Niemand setzt eine Phase von Hand.
 */
describe('Programme auf dem Lagebild', () => {
  type Programmes = Awaited<
    ReturnType<import('../src/modules/programmes/programmes.service').ProgrammesService['list']>
  >;
  let programmes: Programmes;
  const byKey = (k: string) => programmes.find((p) => p.key === k)!;

  beforeAll(async () => {
    const { ProgrammesService } = await import('../src/modules/programmes/programmes.service');
    programmes = await app.get(ProgrammesService).list(tenantId);
  });

  it('führt die drei Programme in fester Reihenfolge', () => {
    expect(programmes.map((p) => [p.key, p.active])).toEqual([
      ['ISO27001', true],
      ['NIS2', true],
      ['EU_AI_ACT', false],
    ]);
  });

  it('leitet den Weg zu ISO 27001 aus Kontext, Gap-Analyse, Risiken, Audit und Bewertung ab', () => {
    const iso = byKey('ISO27001');
    expect(iso.steps.map((s) => s.key)).toEqual([
      'context',
      'gap',
      'risks',
      'implementation',
      'audit',
      'review',
      'certification',
    ]);
    const done = Object.fromEntries(iso.steps.map((s) => [s.key, s.done]));
    // Ein stimmiger Stand im ersten Jahr: Gap-Analyse abgeschlossen, Umsetzung läuft, das erste
    // interne Audit ist noch nicht berichtet, die Managementbewertung angesetzt. Kein Schritt ist
    // erledigt, bevor die Schritte davor es sind.
    expect(done).toMatchObject({
      context: true,
      gap: true,
      risks: true,
      implementation: false,
      audit: false,
      review: false,
      certification: false,
    });
    expect(iso.current).toBe('implementation');
    const firstOpen = iso.steps.findIndex((st) => !st.done);
    expect(iso.steps.slice(firstOpen).some((st) => st.done)).toBe(false);
    expect(iso.next?.to).toBe('/measures');
    expect(iso.score).toMatchObject({ unit: 'pct' });
    expect(iso.score.value).toBeGreaterThan(0);
  });

  it('entscheidet jeden der 123 Normpunkte und schließt Kapitel 4 bis 10 nie aus', async () => {
    const [r] = (await query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM measure_requirement mr
                                 WHERE mr.requirement_id = v.id AND mr.tenant_id = '${tenantId}')
                              OR EXISTS (SELECT 1 FROM tenant_requirement tr
                                 WHERE tr.requirement_id = v.id AND tr.tenant_id = '${tenantId}'
                                   AND tr.applicability = 'not_applicable'))::int AS decided,
               count(*) FILTER (WHERE v.kind = 'clause' AND EXISTS (SELECT 1 FROM tenant_requirement tr
                                 WHERE tr.requirement_id = v.id AND tr.tenant_id = '${tenantId}'
                                   AND tr.applicability = 'not_applicable'))::int AS "clausesExcluded"
        FROM v_assessable_requirement v JOIN framework f ON f.id = v.framework_id
        WHERE f.key = 'ISO27001'`)) as { total: number; decided: number; clausesExcluded: number }[];
    expect(r).toEqual({ total: 123, decided: 123, clausesExcluded: 0 });
  });

  it('zählt bei NIS2 die erfüllten Pflichten wie das Cockpit und stellt laufende Meldefristen nach vorn', () => {
    const nis2 = byKey('NIS2');
    expect(nis2.score).toMatchObject({ value: 9, of: 13, unit: 'count' });
    const registration = nis2.steps.find((s) => s.key === 'registration')!;
    expect(registration.done).toBe(false);
    expect(nis2.steps.find((s) => s.key === 'measures')!.detail).toMatch(/von 10/);
    // Im Demomandanten läuft eine NIS2-Meldefrist: Die geht jedem Ausbauschritt vor.
    expect(nis2.next).toMatchObject({ to: '/incidents', urgent: true });
  });

  it('zeigt beim AI Act Register, verbotene Praktiken, Prüfpunkte und Betreiberpflichten', async () => {
    // Der AI Act ist im Demo abgeschaltet; seine Daten sind da und zählen, sobald er aktiv ist.
    const { CatalogService } = await import('../src/modules/catalog/catalog.service');
    const { ProgrammesService } = await import('../src/modules/programmes/programmes.service');
    const catalog = app.get(CatalogService);
    await catalog.activate(tenantId, { frameworkKey: 'EU_AI_ACT', isPrimary: false });
    let ai!: Programmes[number];
    let tasks!: { key: string; count: number; to: string }[];
    try {
      ai = (await app.get(ProgrammesService).list(tenantId)).find((p) => p.key === 'EU_AI_ACT')!;
      tasks = await app.get(ProgrammesService).tasks(tenantId);
    } finally {
      await catalog.deactivate(tenantId, 'EU_AI_ACT');
    }
    expect(tasks.find((t) => t.key === 'aiBlocked')).toMatchObject({ count: 1, to: '/ai' });
    expect(ai.steps.map((s) => s.key)).toEqual(['register', 'prohibited', 'checks', 'obligations']);
    expect(ai.steps.find((s) => s.key === 'register')!.done).toBe(true);
    expect(ai.score.unit).toBe('count');
    expect(ai.score.of).toBeGreaterThan(0);
  });
});

/**
 * Aufgaben entstehen aus den Daten: eine überfällige Maßnahme, eine indirekt abgedeckte
 * NIS2-Pflicht, ein KI-System mit offenen Prüfpunkten. Niemand pflegt eine zweite Aufgabenliste.
 */
describe('Aufgaben aus den Daten', () => {
  it('leitet die offenen Aufgaben ab, jede mit Anzahl und Ziel', async () => {
    const { ProgrammesService } = await import('../src/modules/programmes/programmes.service');
    const tasks = await app.get(ProgrammesService).tasks(tenantId);
    const byKey = new Map(tasks.map((t) => [t.key, t]));
    // Nur was offen ist, steht da; eine Aufgabe ohne Anzahl wäre Lärm.
    expect(tasks.every((t) => t.count > 0 && t.to.startsWith('/'))).toBe(true);
    // Die Gap-Analyse ist abgeschlossen: kein Control ohne Entscheidung.
    expect(byKey.has('isoUndecided')).toBe(false);
    expect(byKey.get('nis2Indirect')).toMatchObject({ count: 1, to: '/cockpit?framework=NIS2' });
    expect(byKey.has('aiBlocked')).toBe(false);
  });
});

/** „Mein Bereich“: was einer Person gehört, an einer Stelle; dazu der Anteil verantworteter Assets. */
describe('Verantwortung', () => {
  it('zeigt einer Person ihre Assets, Risiken und offenen Maßnahmen', async () => {
    const [bastian] = await query(
      `SELECT id FROM person WHERE tenant_id = '${tenantId}' AND email = 'bastian.olwig@lindenbach.example'`,
    );
    const { ProgrammesService } = await import('../src/modules/programmes/programmes.service');
    const mine = await app.get(ProgrammesService).myArea(tenantId, bastian!.id as string);
    expect(mine.measures.map((m) => m.title)).toContain('Netzsegmentierung zwischen Büro-IT und Leittechnik');
    // Umgesetzte Maßnahmen sind erledigt und gehören nicht in die Arbeitsliste.
    expect(mine.measures.every((m) => !['implemented', 'verified'].includes(m.status))).toBe(true);
    expect(mine.risks.length).toBeGreaterThan(0);
    expect(mine.assets.every((a) => a.ownerPersonId === bastian!.id)).toBe(true);
  });

  it('liefert für eine Person ohne eigene Einträge leere Listen statt eines Fehlers', async () => {
    const { ProgrammesService } = await import('../src/modules/programmes/programmes.service');
    const none = await app.get(ProgrammesService).myArea(tenantId, null);
    expect(none).toEqual({ assets: [], risks: [], measures: [] });
  });

  it('zählt im Lagebild, wie viele Assets eine verantwortliche Person haben', async () => {
    const { DashboardService } = await import('../src/modules/dashboard/dashboard.service');
    const s = (await app.get(DashboardService).summary(tenantId)) as { assets: number; assetsOwned: number };
    expect(s.assetsOwned).toBeGreaterThan(0);
    expect(s.assetsOwned).toBeLessThanOrEqual(s.assets);
  });
});
