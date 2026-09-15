import { PERMISSION_META, SOD_RULES, SYSTEM_ROLES } from '@isms/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db, Tx } from '../client';
import { permission, role, rolePermission, sodRule } from '../schema';

/** Permissions, Systemrollen (tenant_id IS NULL) und globale SoD-Regeln — idempotent. */
export async function seedRbac(db: Db | Tx, log: (m: string) => void = () => {}): Promise<void> {
  for (const p of PERMISSION_META) {
    await db
      .insert(permission)
      .values({ key: p.key, module: p.module, action: p.action, description: p.description })
      .onConflictDoUpdate({ target: permission.key, set: { module: p.module, action: p.action, description: p.description } });
  }
  log(`permissions: ${PERMISSION_META.length}`);

  const roleIds = new Map<string, string>();
  for (const r of SYSTEM_ROLES) {
    const existing = await db
      .select({ id: role.id })
      .from(role)
      .where(and(isNull(role.tenantId), eq(role.key, r.key)))
      .limit(1);
    let id = existing[0]?.id;
    if (id) {
      await db.update(role).set({ name: r.name, description: r.description, isSystem: true }).where(eq(role.id, id));
    } else {
      const [row] = await db
        .insert(role)
        .values({ tenantId: null, key: r.key, name: r.name, description: r.description, isSystem: true })
        .returning({ id: role.id });
      id = row!.id;
    }
    roleIds.set(r.key, id);
    // Rechte exakt auf den Katalogstand bringen (hinzufügen + entfernen)
    const current = await db.select({ key: rolePermission.permissionKey }).from(rolePermission).where(eq(rolePermission.roleId, id));
    const want = new Set(r.permissions);
    const have = new Set(current.map((c) => c.key));
    const toAdd = [...want].filter((k) => !have.has(k));
    const toRemove = [...have].filter((k) => !want.has(k as never));
    if (toAdd.length) await db.insert(rolePermission).values(toAdd.map((k) => ({ roleId: id!, permissionKey: k })));
    if (toRemove.length)
      await db.delete(rolePermission).where(and(eq(rolePermission.roleId, id), inArray(rolePermission.permissionKey, toRemove)));
  }
  log(`system roles: ${SYSTEM_ROLES.length}`);

  for (const s of SOD_RULES) {
    const a = roleIds.get(s.roleA)!;
    const b = roleIds.get(s.roleB)!;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    await db
      .insert(sodRule)
      .values({ tenantId: null, roleA: lo, roleB: hi, mode: s.mode, reason: s.reason })
      .onConflictDoUpdate({ target: [sodRule.tenantId, sodRule.roleA, sodRule.roleB], set: { mode: s.mode, reason: s.reason } });
  }
  log(`sod rules: ${SOD_RULES.length}`);
}
