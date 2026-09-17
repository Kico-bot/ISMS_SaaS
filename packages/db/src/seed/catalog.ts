import { loadCatalogs, loadCrosswalks, type CatalogFile } from '@isms/catalog';
import { and, eq, sql } from 'drizzle-orm';
import type { Db, Tx } from '../client';
import { framework, requirement, requirementCrosswalk } from '../schema';

/**
 * Idempotentes Einspielen der Framework-Kataloge.
 * Upsert auf (framework.key, version) und (requirement.framework_id, ref_code); Crosswalk auf (source, target).
 */
export async function seedCatalog(db: Db | Tx, log: (m: string) => void = () => {}): Promise<void> {
  const catalogs = loadCatalogs();
  const idByKeyRef = new Map<string, string>(); // `${frameworkKey}|${ref_code}` -> requirement.id

  for (const cat of catalogs) {
    const fwId = await upsertFramework(db, cat);
    // Eltern zuerst: nach path-Tiefe sortieren, dann sort_order
    const rows = [...cat.requirements].sort(
      (a, b) => a.path.split('.').length - b.path.split('.').length || a.sort_order - b.sort_order,
    );
    let n = 0;
    for (const r of rows) {
      const parentId = r.parent_ref ? (idByKeyRef.get(`${cat.framework.key}|${r.parent_ref}`) ?? null) : null;
      const [row] = await db
        .insert(requirement)
        .values({
          frameworkId: fwId,
          parentId,
          refCode: r.ref_code,
          title: r.title,
          body: r.body ?? null,
          kind: r.kind,
          level: r.level ?? null,
          domain: r.domain ?? null,
          path: r.path,
          sortOrder: r.sort_order,
        })
        .onConflictDoUpdate({
          target: [requirement.frameworkId, requirement.refCode],
          set: {
            parentId,
            title: r.title,
            body: r.body ?? null,
            kind: r.kind,
            level: r.level ?? null,
            domain: r.domain ?? null,
            path: r.path,
            sortOrder: r.sort_order,
          },
        })
        .returning({ id: requirement.id });
      idByKeyRef.set(`${cat.framework.key}|${r.ref_code}`, row!.id);
      n++;
    }
    log(`catalog ${cat.framework.key} ${cat.framework.version}: ${n} requirements`);
  }

  let xw = 0;
  let skipped = 0;
  for (const row of loadCrosswalks()) {
    const src = idByKeyRef.get(`${row.source_framework}|${row.source_ref}`);
    const tgt = idByKeyRef.get(`${row.target_framework}|${row.target_ref}`);
    if (!src || !tgt || src === tgt) {
      skipped++;
      continue;
    }
    await db
      .insert(requirementCrosswalk)
      .values({
        sourceRequirementId: src,
        targetRequirementId: tgt,
        relation: row.relation,
        source: row.source,
      })
      .onConflictDoUpdate({
        target: [requirementCrosswalk.sourceRequirementId, requirementCrosswalk.targetRequirementId],
        set: { relation: row.relation, source: row.source },
      });
    xw++;
  }
  log(`crosswalk: ${xw} rows (${skipped} skipped: unknown refs)`);
}

async function upsertFramework(db: Db | Tx, cat: CatalogFile): Promise<string> {
  const f = cat.framework;
  const existing = await db
    .select({ id: framework.id })
    .from(framework)
    .where(and(eq(framework.key, f.key), eq(framework.version, f.version)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(framework)
      .set({
        name: f.name,
        publisher: f.publisher,
        jurisdiction: f.jurisdiction,
        licenseNote: f.license_note,
        updatedAt: sql`now()`,
      })
      .where(eq(framework.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db
    .insert(framework)
    .values({
      key: f.key,
      version: f.version,
      name: f.name,
      publisher: f.publisher,
      jurisdiction: f.jurisdiction,
      licenseNote: f.license_note,
    })
    .returning({ id: framework.id });
  return row!.id;
}
