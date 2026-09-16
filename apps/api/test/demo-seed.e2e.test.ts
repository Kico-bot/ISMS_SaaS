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
    // Alle vier aktivierten Regelwerke sind belegt — sonst führt die Demo den Kern nicht vor.
    for (const key of ['ISO27001', 'BSI_GS', 'NIS2', 'DSGVO']) {
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
