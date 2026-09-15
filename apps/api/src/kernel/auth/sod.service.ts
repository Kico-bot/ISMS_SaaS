import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema, type Tx } from '@isms/db';

export interface SodCheckResult {
  blocking: { roleA: string; roleB: string; reason: string | null }[];
  warnings: { roleA: string; roleB: string; reason: string | null }[];
}

/** Statische Funktionstrennung: prüft eine geplante Rollenkombination gegen `sod_rule`. */
@Injectable()
export class SodService {
  async check(tx: Tx, tenantId: string, roleIds: string[]): Promise<SodCheckResult> {
    if (roleIds.length < 2) return { blocking: [], warnings: [] };
    const rules = await tx
      .select({ a: schema.sodRule.roleA, b: schema.sodRule.roleB, mode: schema.sodRule.mode, reason: schema.sodRule.reason })
      .from(schema.sodRule)
      .where(
        and(
          or(isNull(schema.sodRule.tenantId), eq(schema.sodRule.tenantId, tenantId)),
          inArray(schema.sodRule.roleA, roleIds),
          inArray(schema.sodRule.roleB, roleIds),
        ),
      );
    if (rules.length === 0) return { blocking: [], warnings: [] };
    const names = await tx
      .select({ id: schema.role.id, key: schema.role.key })
      .from(schema.role)
      .where(inArray(schema.role.id, [...new Set(rules.flatMap((r) => [r.a, r.b]))]));
    const key = (id: string) => names.find((n) => n.id === id)?.key ?? id;
    const mapped = rules.map((r) => ({ roleA: key(r.a), roleB: key(r.b), reason: r.reason, mode: r.mode }));
    return {
      blocking: mapped.filter((r) => r.mode === 'block'),
      warnings: mapped.filter((r) => r.mode === 'warn'),
    };
  }
}
