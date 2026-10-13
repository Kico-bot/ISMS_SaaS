/**
 * Integrationstest gegen eine echte PostgreSQL (DATABASE_URL_TEST als Migrator).
 * Prüft, was das Schema garantieren muss: Mandanten-Isolation via RLS, SoD-Trigger,
 * SoA-Constraint, Referenznummern und den Katalog-Seed.
 */
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createPool, withTenant, type Db } from './client';
import { runMigrations } from './migrate';
import { seedAll } from './seed';
import { asset, framework, person, requirement, requirementCrosswalk, risk, tenant, user } from './schema';

const MIGRATOR_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://isms_migrator:isms_migrator@localhost:5432/isms_test';
const APP_URL = MIGRATOR_URL.replace('isms_migrator:isms_migrator', 'isms_app:isms_app');

let adminPool: Pool;
let appPool: Pool;
let admin: Db;
let app: Db;
let tenantA: string;
let tenantB: string;
let userA: string;
let personA: string;

beforeAll(async () => {
  const p = new Pool({ connectionString: MIGRATOR_URL, max: 1 });
  await p.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
  await p.query(
    'CREATE EXTENSION IF NOT EXISTS ltree; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;',
  );
  await p.query('GRANT USAGE ON SCHEMA public TO isms_app;');
  await p.end();
  await runMigrations(MIGRATOR_URL);

  adminPool = createPool(MIGRATOR_URL, { max: 2 });
  appPool = createPool(APP_URL, { max: 2 });
  admin = createDb(adminPool);
  app = createDb(appPool);
  await seedAll(admin, () => {});

  const [ta] = await admin
    .insert(tenant)
    .values({ slug: 'a', name: 'Tenant A' })
    .returning({ id: tenant.id });
  const [tb] = await admin
    .insert(tenant)
    .values({ slug: 'b', name: 'Tenant B' })
    .returning({ id: tenant.id });
  tenantA = ta!.id;
  tenantB = tb!.id;
  const [u] = await admin
    .insert(user)
    .values({ email: 'owner@a.test', displayName: 'Owner A', passwordHash: 'x' })
    .returning({ id: user.id });
  userA = u!.id;
  const [pa] = await admin
    .insert(person)
    .values({ tenantId: tenantA, userId: userA, name: 'Owner A' })
    .returning({ id: person.id });
  personA = pa!.id;
}, 120_000);

afterAll(async () => {
  await appPool?.end();
  await adminPool?.end();
});

describe('Katalog-Seed', () => {
  it('lädt alle Frameworks, 93 Annex-A-Controls und den Crosswalk', async () => {
    const fws = await admin.select({ key: framework.key }).from(framework);
    expect(fws.map((f) => f.key).sort()).toEqual([
      'BSI_GS',
      'BSI_STD200',
      'DSGVO',
      'EU_AI_ACT',
      'ISO27001',
      'NIS2',
    ]);
    const [{ n }] = await admin
      .select({ n: sql<number>`count(*)::int` })
      .from(requirement)
      .where(sql`kind = 'control'`);
    expect(n).toBe(93);
    const [{ x }] = await admin.select({ x: sql<number>`count(*)::int` }).from(requirementCrosswalk);
    expect(x).toBeGreaterThan(700);
  });

  it('ist idempotent', async () => {
    await seedAll(admin, () => {});
    const [{ n }] = await admin.select({ n: sql<number>`count(*)::int` }).from(requirement);
    const [{ m }] = await admin.select({ m: sql<number>`count(*)::int` }).from(requirement);
    expect(n).toBe(m);
  });
});

describe('Row-Level-Security', () => {
  it('App-Rolle sieht ohne Mandantenkontext keine Zeilen und kann keine schreiben', async () => {
    await withTenant(app, tenantA, async (tx) => {
      await tx
        .insert(asset)
        .values({ tenantId: tenantA, refNo: 'A-0001', name: 'Server A', category: 'system' });
    });
    const rows = await app.select().from(asset);
    expect(rows).toHaveLength(0);
    await expect(
      app.insert(asset).values({ tenantId: tenantA, refNo: 'A-9999', name: 'leak', category: 'system' }),
    ).rejects.toThrow(/row-level security/);
  });

  it('Mandant B sieht die Assets von Mandant A nicht — auch nicht per expliziter WHERE-Klausel', async () => {
    const fromB = await withTenant(app, tenantB, (tx) =>
      tx
        .select()
        .from(asset)
        .where(sql`tenant_id = ${tenantA}`),
    );
    expect(fromB).toHaveLength(0);
    const fromA = await withTenant(app, tenantA, (tx) => tx.select().from(asset));
    expect(fromA).toHaveLength(1);
  });

  it('verhindert das Einschleusen fremder tenant_id (WITH CHECK)', async () => {
    await expect(
      withTenant(app, tenantB, (tx) =>
        tx.insert(asset).values({ tenantId: tenantA, refNo: 'A-0002', name: 'spoof', category: 'system' }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('Systemrollen (tenant_id NULL) sind im Mandantenkontext lesbar', async () => {
    const roles = await withTenant(app, tenantA, (tx) =>
      tx.execute(sql`SELECT key FROM role WHERE tenant_id IS NULL`),
    );
    expect(roles.rows.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Funktionstrennung (Trigger)', () => {
  it('Restrisiko darf nicht vom Risk-Owner selbst übernommen werden', async () => {
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.insert(risk).values({
          tenantId: tenantA,
          refNo: 'R-0001',
          title: 'Ransomware',
          ownerPersonId: personA,
          acceptedByUserId: userA,
        }),
      ),
    ).rejects.toThrow(/sod_violation/);
  });

  it('Score-Spalten werden generiert', async () => {
    const [r] = await withTenant(app, tenantA, (tx) =>
      tx
        .insert(risk)
        .values({
          tenantId: tenantA,
          refNo: 'R-0002',
          title: 'Ausfall',
          likelihood: 3,
          impact: 5,
        })
        .returning({ score: risk.score }),
    );
    expect(r!.score).toBe(15);
  });
});

describe('Freigaben nur mit handelnder Person', () => {
  it('eine Maßnahme wird ohne bestätigende Person nicht bestätigt', async () => {
    const [m] = await withTenant(app, tenantA, async (tx) => {
      const r = await tx.execute(
        sql`INSERT INTO measure (tenant_id, ref_no, title) VALUES (${tenantA}, 'M-9001', 'Härtung') RETURNING id`,
      );
      return r.rows as { id: string }[];
    });
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(sql`UPDATE measure SET status = 'verified' WHERE id = ${m!.id}`),
      ),
    ).rejects.toThrow(/approval_without_actor/);
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(
          sql`INSERT INTO measure (tenant_id, ref_no, title, status) VALUES (${tenantA}, 'M-9002', 'Gleich bestätigt', 'verified')`,
        ),
      ),
    ).rejects.toThrow(/approval_without_actor/);
  });

  it('ein Risiko wird ohne übernehmende Person nicht getragen', async () => {
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(
          sql`INSERT INTO risk (tenant_id, ref_no, title, status) VALUES (${tenantA}, 'R-9001', 'Getragen', 'accepted')`,
        ),
      ),
    ).rejects.toThrow(/approval_without_actor/);
  });

  it('eine KVP-Maßnahme wird ohne bestätigende Person nicht bestätigt', async () => {
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(
          sql`INSERT INTO "action" (tenant_id, ref_no, title, status) VALUES (${tenantA}, 'KVP-9001', 'Bestätigt', 'verified')`,
        ),
      ),
    ).rejects.toThrow(/approval_without_actor/);
  });

  it('eine geplante Änderung wird ohne freigebende Person nicht freigegeben', async () => {
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(
          sql`INSERT INTO change_plan_entry (tenant_id, title, status) VALUES (${tenantA}, 'Freigegeben', 'approved')`,
        ),
      ),
    ).rejects.toThrow(/approval_without_actor/);
  });
});

describe('Abgeschlossene Audits', () => {
  it('ein abgeschlossenes Audit und sein Umfang ändern sich nicht mehr', async () => {
    const [a] = await withTenant(app, tenantA, async (tx) => {
      const r = await tx.execute(
        sql`INSERT INTO "audit" (tenant_id, ref_no, title, status, planned_to)
            VALUES (${tenantA}, 'AUD-9001', 'Abgeschlossen', 'closed', '2026-01-31') RETURNING id`,
      );
      return r.rows as { id: string }[];
    });
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(sql`UPDATE "audit" SET planned_to = '2026-02-28' WHERE id = ${a!.id}`),
      ),
    ).rejects.toThrow(/audit_locked/);
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(
          sql`INSERT INTO audit_requirement (audit_id, requirement_id)
              SELECT ${a!.id}, id FROM requirement LIMIT 1`,
        ),
      ),
    ).rejects.toThrow(/audit_locked/);
  });
});

describe('Referenznummern & SoA-Constraint', () => {
  it('next_ref_no zählt je Mandant und Typ lückenlos', async () => {
    const a1 = await withTenant(app, tenantA, (tx) =>
      tx.execute(sql`SELECT next_ref_no(${tenantA}::uuid, 'incident', 'INC') AS r`),
    );
    const a2 = await withTenant(app, tenantA, (tx) =>
      tx.execute(sql`SELECT next_ref_no(${tenantA}::uuid, 'incident', 'INC') AS r`),
    );
    const b1 = await withTenant(app, tenantB, (tx) =>
      tx.execute(sql`SELECT next_ref_no(${tenantB}::uuid, 'incident', 'INC') AS r`),
    );
    expect(a1.rows[0]!.r).toBe('INC-0001');
    expect(a2.rows[0]!.r).toBe('INC-0002');
    expect(b1.rows[0]!.r).toBe('INC-0001');
  });

  it('"nicht anwendbar" ohne Begründung wird abgelehnt', async () => {
    const [req] = await admin
      .select({ id: requirement.id })
      .from(requirement)
      .where(sql`ref_code = 'A.7.9'`);
    await expect(
      withTenant(app, tenantA, (tx) =>
        tx.execute(
          sql`INSERT INTO tenant_requirement (tenant_id, requirement_id, applicability) VALUES (${tenantA}, ${req!.id}, 'not_applicable')`,
        ),
      ),
    ).rejects.toThrow(/tenant_requirement_soa_chk/);
  });
});
