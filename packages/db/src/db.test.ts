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

describe('Globale Rollen und SoD-Regeln', () => {
  /** Führt `stmt` im Mandantenkontext aus, liefert die Zeilenzahl und rollt immer zurück. */
  async function rowsAffected(stmt: ReturnType<typeof sql>): Promise<number> {
    let n = -1;
    await withTenant(app, tenantA, async (tx) => {
      n = (await tx.execute(stmt)).rowCount ?? 0;
      throw new Error('rollback');
    }).catch((e: Error) => {
      if (e.message !== 'rollback') throw e;
    });
    return n;
  }

  it('ein Mandant löscht keine globale SoD-Regel', async () => {
    expect(await rowsAffected(sql`DELETE FROM sod_rule WHERE tenant_id IS NULL`)).toBe(0);
  });

  it('ein Mandant löscht keine Systemrolle und zieht keine in seinen Mandanten', async () => {
    expect(await rowsAffected(sql`DELETE FROM role WHERE tenant_id IS NULL AND key = 'dpo'`)).toBe(0);
    expect(
      await rowsAffected(
        sql`UPDATE role SET tenant_id = ${tenantA} WHERE key = 'auditor' AND tenant_id IS NULL`,
      ),
    ).toBe(0);
  });

  it('eigene Rollen bleiben im eigenen Mandanten schreibbar', async () => {
    expect(
      await rowsAffected(
        sql`INSERT INTO role (tenant_id, key, name) VALUES (${tenantA}, 'eigene', 'Eigene')`,
      ),
    ).toBe(1);
  });
});

describe('Änderungsprotokoll', () => {
  async function freshTenant(slug: string): Promise<string> {
    const [t] = await admin.insert(tenant).values({ slug, name: slug }).returning({ id: tenant.id });
    return t!.id;
  }

  it('die App-Rolle löscht weder Mandanten noch Konten', async () => {
    const c = await freshTenant('protokoll-c');
    // Zurückgerollt, falls das Löschen heute noch gelingt: die übrigen Tests brauchen die Zeilen.
    const tryDelete = (stmt: ReturnType<typeof sql>) =>
      app.transaction(async (tx) => {
        await tx.execute(stmt);
        throw new Error('gelöscht');
      });
    await expect(tryDelete(sql`DELETE FROM tenant WHERE id = ${c}`)).rejects.toThrow(/permission denied/);
    await expect(tryDelete(sql`DELETE FROM "user" WHERE id = ${userA}`)).rejects.toThrow(/permission denied/);
  });

  it('Mandant und Konto mit Protokollzeilen lassen sich auch als Eigentümerin nicht löschen', async () => {
    const d = await freshTenant('protokoll-d');
    await admin.execute(
      sql`INSERT INTO audit_log (tenant_id, action, entity_type) VALUES (${d}, 'create', 'risks')`,
    );
    await expect(admin.execute(sql`DELETE FROM tenant WHERE id = ${d}`)).rejects.toThrow(
      /audit_log_tenant_id_tenant_id_fk/,
    );
    const [u] = await admin
      .insert(user)
      .values({ email: 'protokoll@d.test', displayName: 'Protokoll', passwordHash: 'x' })
      .returning({ id: user.id });
    await admin.execute(
      sql`INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type) VALUES (${d}, ${u!.id}, 'login', 'auth')`,
    );
    await expect(admin.execute(sql`DELETE FROM "user" WHERE id = ${u!.id}`)).rejects.toThrow(
      /audit_log_actor_user_id_user_id_fk/,
    );
  });

  it('der Zeitpunkt einer Protokollzeile ist immer der Zeitpunkt des Schreibens', async () => {
    const [row] = await withTenant(app, tenantA, async (tx) => {
      const r = await tx.execute(
        sql`INSERT INTO audit_log (tenant_id, action, entity_type, at)
            VALUES (${tenantA}, 'update', 'risks', '2020-01-01T00:00:00Z') RETURNING at`,
      );
      return r.rows as { at: string | Date }[];
    });
    expect(Math.abs(new Date(row!.at).getTime() - Date.now())).toBeLessThan(60_000);
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

describe('Suchpfad der Funktionen', () => {
  it('jede Funktion in public legt ihren Suchpfad fest und sucht pg_temp zuletzt', async () => {
    const r = await admin.execute(sql`
      SELECT p.oid::regprocedure::text AS fn, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`);
    const rows = r.rows as { fn: string; proconfig: string[] | null }[];
    expect(rows.length).toBeGreaterThan(10);
    const ohne = rows
      .filter((f) => !(f.proconfig ?? []).some((c) => /^search_path=.*\bpg_temp$/.test(c)))
      .map((f) => f.fn);
    expect(ohne).toEqual([]);
  });

  it('eine temporäre Tabelle "action" hebelt die Prüfung der Feststellung nicht aus', async () => {
    const [f] = await withTenant(admin, tenantA, async (tx) => {
      const r = await tx.execute(
        sql`INSERT INTO finding (tenant_id, ref_no, title, raised_by_user_id)
            VALUES (${tenantA}, 'F-9001', 'Schatten', ${userA}) RETURNING id`,
      );
      await tx.execute(
        sql`INSERT INTO "action" (tenant_id, ref_no, title, finding_id, owner_person_id)
            VALUES (${tenantA}, 'KVP-9101', 'Korrektur', ${(r.rows[0] as { id: string }).id}, ${personA})`,
      );
      return r.rows as { id: string }[];
    });
    // Als Migrator, weil isms_app keine temporären Tabellen mehr anlegen darf (nächster Test).
    await expect(
      admin.transaction(async (tx) => {
        await tx.execute(
          sql`CREATE TEMP TABLE "action" (finding_id uuid, owner_person_id uuid) ON COMMIT DROP`,
        );
        await tx.execute(sql`UPDATE finding SET verified_by_user_id = ${userA} WHERE id = ${f!.id}`);
      }),
    ).rejects.toThrow(/sod_violation/);
  });

  it('die App-Rolle darf keine temporären Tabellen anlegen', async () => {
    await expect(
      app.transaction((tx) => tx.execute(sql`CREATE TEMP TABLE probe (id uuid) ON COMMIT DROP`)),
    ).rejects.toThrow(/permission denied/);
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
