import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type { AuthContext, CompetenceProfileDto, PersonSkillDto, SkillDto } from '@isms/shared';
import { and, eq, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Kompetenzregister nach ISO 27001 Kap. 7.2.
 *
 * Der Kern ist der Soll-Ist-Abgleich: ein Kompetenzprofil beschreibt, welche Fähigkeiten eine
 * Rolle in welcher Stufe braucht; die Lücke zum tatsächlichen Stand liefert die View
 * `v_skill_gap`. Erst dadurch wird aus „wir schulen gelegentlich“ ein belegbarer Nachweis.
 */
@Injectable()
export class CompetenceService {
  constructor(private readonly dbs: DbService) {}

  // --- Fähigkeiten ----------------------------------------------------------------------
  async listSkills(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT s.id, s.name, s.description,
               (SELECT count(*)::int FROM profile_skill_requirement psr WHERE psr.skill_id = s.id) AS "profileCount",
               (SELECT count(*)::int FROM person_skill ps WHERE ps.skill_id = s.id) AS "personCount"
        FROM skill s WHERE s.tenant_id = ${tenantId}
        ORDER BY s.name`);
      return res.rows;
    });
  }

  async createSkill(ctx: AuthContext, dto: SkillDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [dupe] = await tx
        .select({ id: schema.skill.id })
        .from(schema.skill)
        .where(and(eq(schema.skill.tenantId, tenantId), eq(schema.skill.name, dto.name)));
      if (dupe) throw new ConflictException({ title: `Die Fähigkeit „${dto.name}“ ist bereits erfasst` });
      const [s] = await tx
        .insert(schema.skill)
        .values({ tenantId, name: dto.name, description: dto.description ?? null })
        .returning();
      return s;
    });
  }

  async deleteSkill(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      const [s] = await tx
        .select()
        .from(schema.skill)
        .where(and(eq(schema.skill.id, id), eq(schema.skill.tenantId, tenantId)));
      if (!s) throw new NotFoundException({ title: 'Fähigkeit nicht gefunden' });
      await tx.delete(schema.skill).where(eq(schema.skill.id, id));
    });
  }

  // --- Kompetenzprofile -----------------------------------------------------------------
  async listProfiles(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT p.id, p.name, p.description,
               (SELECT count(*)::int FROM person_profile pp WHERE pp.profile_id = p.id) AS "personCount",
               COALESCE(
                 (SELECT json_agg(json_build_object('skillId', s.id, 'name', s.name, 'minLevel', psr.min_level) ORDER BY s.name)
                  FROM profile_skill_requirement psr JOIN skill s ON s.id = psr.skill_id
                  WHERE psr.profile_id = p.id),
                 '[]'::json) AS requirements
        FROM competence_profile p WHERE p.tenant_id = ${tenantId}
        ORDER BY p.name`);
      return res.rows;
    });
  }

  async createProfile(ctx: AuthContext, dto: CompetenceProfileDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [dupe] = await tx
        .select({ id: schema.competenceProfile.id })
        .from(schema.competenceProfile)
        .where(
          and(eq(schema.competenceProfile.tenantId, tenantId), eq(schema.competenceProfile.name, dto.name)),
        );
      if (dupe) throw new ConflictException({ title: `Das Profil „${dto.name}“ ist bereits erfasst` });
      const [p] = await tx
        .insert(schema.competenceProfile)
        .values({ tenantId, name: dto.name, description: dto.description ?? null })
        .returning();
      await this.setProfileRequirements(tx, tenantId, p!.id, dto.requirements);
      return p;
    });
  }

  async setRequirements(
    ctx: AuthContext,
    profileId: string,
    requirements: { skillId: string; minLevel: number }[],
  ) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.requireProfile(tx, tenantId, profileId);
      await this.setProfileRequirements(tx, tenantId, profileId, requirements);
      return { profileId, requirements: requirements.length };
    });
  }

  async deleteProfile(ctx: AuthContext, id: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.requireProfile(tx, tenantId, id);
      await tx.delete(schema.competenceProfile).where(eq(schema.competenceProfile.id, id));
    });
  }

  /** Profile einer Person zuweisen — daraus ergibt sich ihr Sollprofil. */
  async assignProfiles(ctx: AuthContext, personId: string, profileIds: string[]) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.requirePerson(tx, tenantId, personId);
      for (const profileId of profileIds) await this.requireProfile(tx, tenantId, profileId);
      await tx.delete(schema.personProfile).where(eq(schema.personProfile.personId, personId));
      if (profileIds.length) {
        await tx
          .insert(schema.personProfile)
          .values(profileIds.map((profileId) => ({ personId, profileId })));
      }
      return this.personDetail(tx, tenantId, personId);
    });
  }

  // --- Ist-Stand je Person ---------------------------------------------------------------
  async setPersonSkill(ctx: AuthContext, personId: string, dto: PersonSkillDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.requirePerson(tx, tenantId, personId);
      const [skill] = await tx
        .select({ id: schema.skill.id })
        .from(schema.skill)
        .where(and(eq(schema.skill.id, dto.skillId), eq(schema.skill.tenantId, tenantId)));
      if (!skill) throw new BadRequestException({ title: 'Fähigkeit gehört nicht zu diesem Mandanten' });

      await tx
        .insert(schema.personSkill)
        .values({
          personId,
          skillId: dto.skillId,
          tenantId,
          level: dto.level,
          evidenceNote: dto.evidenceNote ?? null,
          validUntil: dto.validUntil ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.personSkill.personId, schema.personSkill.skillId],
          set: {
            level: dto.level,
            evidenceNote: dto.evidenceNote ?? null,
            validUntil: dto.validUntil ?? null,
            updatedAt: new Date(),
          },
        });
      return this.personDetail(tx, tenantId, personId);
    });
  }

  async getPerson(tenantId: string, personId: string) {
    return this.dbs.tenant(tenantId, (tx) => this.personDetail(tx, tenantId, personId));
  }

  private async personDetail(tx: TenantTx, tenantId: string, personId: string) {
    const person = await this.requirePerson(tx, tenantId, personId);
    const profiles = await tx.execute(sql`
      SELECT p.id, p.name FROM person_profile pp JOIN competence_profile p ON p.id = pp.profile_id
      WHERE pp.person_id = ${personId} ORDER BY p.name`);
    const skills = await tx.execute(sql`
      SELECT s.id AS "skillId", s.name, ps.level, ps.evidence_note AS "evidenceNote",
             ps.valid_until AS "validUntil", ps.updated_at AS "updatedAt",
             (ps.valid_until < current_date) AS expired
      FROM person_skill ps JOIN skill s ON s.id = ps.skill_id
      WHERE ps.person_id = ${personId} AND ps.tenant_id = ${tenantId}
      ORDER BY s.name`);
    const gaps = await tx.execute(sql`
      SELECT s.id AS "skillId", s.name, g.min_level AS "minLevel", g.actual_level AS "actualLevel", g.gap,
             p.name AS "profileName"
      FROM v_skill_gap g
      JOIN skill s ON s.id = g.skill_id
      JOIN competence_profile p ON p.id = g.profile_id
      WHERE g.person_id = ${personId} AND s.tenant_id = ${tenantId}
      ORDER BY g.gap DESC, s.name`);
    return { ...person, profiles: profiles.rows, skills: skills.rows, gaps: gaps.rows };
  }

  /**
   * Qualifikationsmatrix: eine Zeile je Person mit Sollprofil, größter Lücke und abgelaufenen
   * Nachweisen. Das ist die Ansicht, die im Audit zu Kap. 7.2 verlangt wird.
   */
  async matrix(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT p.id, p.name, p.department,
               COALESCE((SELECT string_agg(cp.name, ', ' ORDER BY cp.name)
                         FROM person_profile pp JOIN competence_profile cp ON cp.id = pp.profile_id
                         WHERE pp.person_id = p.id), '') AS "profileNames",
               (SELECT count(*)::int FROM person_profile pp WHERE pp.person_id = p.id) AS "profileCount",
               COALESCE(g.required, 0) AS "requiredSkills",
               COALESCE(g.gaps, 0) AS "openGaps",
               COALESCE(g.max_gap, 0) AS "maxGap",
               (SELECT count(*)::int FROM person_skill ps
                 WHERE ps.person_id = p.id AND ps.valid_until < current_date) AS "expiredEvidence",
               (SELECT count(*)::int FROM training_assignment ta
                 WHERE ta.person_id = p.id AND ta.completed_at IS NULL) AS "openTrainings"
        FROM person p
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS required,
                 count(*) FILTER (WHERE g.gap > 0)::int AS gaps,
                 COALESCE(max(g.gap), 0)::int AS max_gap
          FROM (
            SELECT psr.skill_id, psr.min_level - COALESCE(ps.level, 0) AS gap
            FROM person_profile pp
            JOIN profile_skill_requirement psr ON psr.profile_id = pp.profile_id
            LEFT JOIN person_skill ps ON ps.person_id = pp.person_id AND ps.skill_id = psr.skill_id
            WHERE pp.person_id = p.id
          ) g
        ) g ON true
        WHERE p.tenant_id = ${tenantId} AND p.is_active
        ORDER BY COALESCE(g.max_gap, 0) DESC, p.name`);
      return res.rows;
    });
  }

  /** Alle offenen Lücken über den Mandanten — der Ausgangspunkt für den Schulungsplan. */
  async gaps(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT s.id AS "skillId", s.name,
               count(*)::int AS "affectedPersons",
               max(g.gap)::int AS "maxGap",
               string_agg(DISTINCT p.name, ', ' ORDER BY p.name) AS "personNames"
        FROM v_skill_gap g
        JOIN skill s ON s.id = g.skill_id
        JOIN person p ON p.id = g.person_id
        WHERE s.tenant_id = ${tenantId} AND p.is_active
        GROUP BY s.id, s.name
        ORDER BY count(*) DESC, s.name`);
      return res.rows;
    });
  }

  private async setProfileRequirements(
    tx: TenantTx,
    tenantId: string,
    profileId: string,
    requirements: { skillId: string; minLevel: number }[],
  ) {
    await tx
      .delete(schema.profileSkillRequirement)
      .where(eq(schema.profileSkillRequirement.profileId, profileId));
    if (!requirements.length) return;
    const owned = await tx
      .select({ id: schema.skill.id })
      .from(schema.skill)
      .where(eq(schema.skill.tenantId, tenantId));
    const ownedIds = new Set(owned.map((s) => s.id));
    const foreign = requirements.find((r) => !ownedIds.has(r.skillId));
    if (foreign) throw new BadRequestException({ title: 'Fähigkeit gehört nicht zu diesem Mandanten' });
    await tx
      .insert(schema.profileSkillRequirement)
      .values(requirements.map((r) => ({ profileId, skillId: r.skillId, minLevel: r.minLevel })));
  }

  private async requireProfile(tx: TenantTx, tenantId: string, id: string) {
    const [p] = await tx
      .select()
      .from(schema.competenceProfile)
      .where(and(eq(schema.competenceProfile.id, id), eq(schema.competenceProfile.tenantId, tenantId)));
    if (!p) throw new NotFoundException({ title: 'Kompetenzprofil nicht gefunden' });
    return p;
  }

  private async requirePerson(tx: TenantTx, tenantId: string, id: string) {
    const [p] = await tx
      .select()
      .from(schema.person)
      .where(and(eq(schema.person.id, id), eq(schema.person.tenantId, tenantId)));
    if (!p) throw new NotFoundException({ title: 'Person nicht gefunden' });
    return p;
  }
}
