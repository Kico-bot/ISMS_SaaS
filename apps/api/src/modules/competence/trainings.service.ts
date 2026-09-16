import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type {
  AssignTrainingDto,
  AuthContext,
  CompleteTrainingDto,
  TrainingDto,
  TrainingPatchDto,
} from '@isms/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Sensibilisierung und Schulung nach ISO 27001 Kap. 7.3. Zuweisungen werden wie die
 * Lesebestätigungen sofort je Person aufgelöst — „wer hat noch nicht teilgenommen?“ bleibt
 * damit eine einfache Abfrage statt einer Rekonstruktion aus Teilnehmerlisten.
 */
@Injectable()
export class TrainingsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT t.id, t.title, t.kind::text AS kind, t.description, t.is_active AS "isActive",
               COALESCE(a.total, 0) AS "assigned",
               COALESCE(a.done, 0) AS "completed",
               COALESCE(a.overdue, 0) AS "overdue",
               a.next_due AS "nextDueAt"
        FROM training t
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE ta.completed_at IS NOT NULL)::int AS done,
                 count(*) FILTER (WHERE ta.completed_at IS NULL AND ta.due_at < current_date)::int AS overdue,
                 min(ta.due_at) FILTER (WHERE ta.completed_at IS NULL) AS next_due
          FROM training_assignment ta WHERE ta.training_id = t.id
        ) a ON true
        WHERE t.tenant_id = ${tenantId}
        ORDER BY t.is_active DESC, t.title`);
      return res.rows;
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const t = await this.require(tx, tenantId, id);
    const participants = await tx.execute(sql`
      SELECT p.id AS "personId", p.name, p.department, ta.due_at AS "dueAt",
             ta.completed_at AS "completedAt", ta.score,
             (ta.completed_at IS NULL AND ta.due_at < current_date) AS overdue
      FROM training_assignment ta JOIN person p ON p.id = ta.person_id
      WHERE ta.training_id = ${id} AND ta.tenant_id = ${tenantId}
      ORDER BY (ta.completed_at IS NOT NULL), p.name`);
    return { ...t, participants: participants.rows };
  }

  async create(ctx: AuthContext, dto: TrainingDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [t] = await tx
        .insert(schema.training)
        .values({
          tenantId,
          title: dto.title,
          kind: dto.kind,
          description: dto.description ?? null,
          contentMd: dto.contentMd ?? null,
          isActive: dto.isActive,
        })
        .returning();
      return t;
    });
  }

  async update(ctx: AuthContext, id: string, dto: TrainingPatchDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const existing = await this.require(tx, tenantId, id);
      const set: Record<string, unknown> = {};
      for (const k of ['title', 'kind', 'description', 'contentMd', 'isActive'] as const) {
        if (dto[k] !== undefined) set[k] = dto[k];
      }
      if (Object.keys(set).length)
        await tx.update(schema.training).set(set).where(eq(schema.training.id, id));
      return Object.keys(set).length ? this.loadDetail(tx, tenantId, id) : { ...existing, participants: [] };
    });
  }

  /** Zuweisen. Ohne Personenauswahl gilt die Schulung für alle aktiven Beschäftigten. */
  async assign(ctx: AuthContext, id: string, dto: AssignTrainingDto) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, id);
      const recipients = dto.personIds.length
        ? await tx
            .select({ id: schema.person.id })
            .from(schema.person)
            .where(
              and(
                eq(schema.person.tenantId, tenantId),
                eq(schema.person.isActive, true),
                inArray(schema.person.id, dto.personIds),
              ),
            )
        : await tx
            .select({ id: schema.person.id })
            .from(schema.person)
            .where(and(eq(schema.person.tenantId, tenantId), eq(schema.person.isActive, true)));
      if (recipients.length === 0) {
        throw new BadRequestException({
          title: 'Keine Teilnehmenden',
          detail: 'Im Mandanten sind keine aktiven Beschäftigten hinterlegt.',
        });
      }
      // Bereits Zugewiesene behalten ihren Stand — eine erneute Zuweisung darf
      // eine abgeschlossene Teilnahme nicht zurücksetzen.
      await tx
        .insert(schema.trainingAssignment)
        .values(
          recipients.map((r) => ({ tenantId, trainingId: id, personId: r.id, dueAt: dto.dueAt ?? null })),
        )
        .onConflictDoNothing({
          target: [schema.trainingAssignment.trainingId, schema.trainingAssignment.personId],
        });
      return this.loadDetail(tx, tenantId, id);
    });
  }

  /** Teilnahme festhalten — ohne personId die eigene. */
  async complete(ctx: AuthContext, id: string, dto: CompleteTrainingDto) {
    const tenantId = ctx.tenantId!;
    const target = dto.personId ?? ctx.personId;
    if (!target) {
      throw new BadRequestException({
        title: 'Keine Person verknüpft',
        detail: 'Das Konto ist keinem Beschäftigten zugeordnet; eine Teilnahme ist daher nicht zuordenbar.',
      });
    }
    return this.dbs.tenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.trainingAssignment)
        .set({
          completedAt: dto.completedAt ? new Date(dto.completedAt) : new Date(),
          score: dto.score ?? null,
        })
        .where(
          and(
            eq(schema.trainingAssignment.trainingId, id),
            eq(schema.trainingAssignment.personId, target),
            eq(schema.trainingAssignment.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row)
        throw new NotFoundException({
          title: 'Für diese Person liegt keine Zuweisung zu dieser Schulung vor',
        });
      return row;
    });
  }

  /** „Was muss ich noch absolvieren?“ — offene Schulungen der aufrufenden Person. */
  async myOpen(tenantId: string, personId: string | null) {
    if (!personId) return [];
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT t.id AS "trainingId", t.title, t.kind::text AS kind, ta.due_at AS "dueAt",
               (ta.due_at < current_date) AS overdue
        FROM training_assignment ta JOIN training t ON t.id = ta.training_id
        WHERE ta.person_id = ${personId} AND ta.completed_at IS NULL AND ta.tenant_id = ${tenantId}
        ORDER BY ta.due_at NULLS LAST`);
      return res.rows;
    });
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [t] = await tx
      .select()
      .from(schema.training)
      .where(and(eq(schema.training.id, id), eq(schema.training.tenantId, tenantId)));
    if (!t) throw new NotFoundException({ title: 'Schulung nicht gefunden' });
    return t;
  }
}
