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
 * Die Vorführung: ISO 27001 und NIS2 im Mittelpunkt, der AI Act dazu. Jede der 13 NIS2-Pflichten
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

  it('aktiviert ISO 27001, NIS2 und den AI Act, alles andere bleibt aus', async () => {
    expect(await activeFrameworks()).toEqual(['EU_AI_ACT', 'ISO27001 (führend)', 'NIS2']);
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
