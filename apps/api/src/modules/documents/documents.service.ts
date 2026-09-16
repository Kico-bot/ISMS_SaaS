import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { schema } from '@isms/db';
import { type AuthContext, can, type ListQuery, P } from '@isms/shared';
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

export interface DocumentDtoInput {
  key: string;
  title: string;
  kind: string;
  classification: string;
  ownerPersonId?: string | null;
  reviewIntervalMonths?: number;
}

/**
 * Dokumentenlenkung nach ISO 27001 Kap. 7.5: gelenkte Dokumente mit unveränderlichen Versionen,
 * Freigabe im Vier-Augen-Prinzip und nachweisbarer Kenntnisnahme.
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string, q: ListQuery & { kind?: string; status?: string }) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const where = and(
        eq(schema.document.tenantId, tenantId),
        q.kind ? eq(schema.document.kind, q.kind as never) : undefined,
        q.status ? eq(schema.document.status, q.status as never) : undefined,
        q.q
          ? or(ilike(schema.document.title, `%${q.q}%`), ilike(schema.document.key, `%${q.q}%`))
          : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(schema.document).where(where);
      const items = await tx.execute(sql`
        SELECT d.id, d.key, d.title, d.kind::text AS kind, d.status::text AS status,
               d.classification::text AS classification, d.next_review_at AS "nextReviewAt",
               (d.next_review_at < current_date) AS "reviewOverdue",
               p.name AS "ownerName",
               v.version_label AS "currentVersion", v.published_at AS "publishedAt",
               ack.total AS "ackTotal", ack.done AS "ackDone"
        FROM document d
        LEFT JOIN person p ON p.id = d.owner_person_id
        LEFT JOIN document_version v ON v.id = d.current_version_id
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS total, count(*) FILTER (WHERE a.acknowledged_at IS NOT NULL)::int AS done
          FROM acknowledgement_campaign c JOIN acknowledgement a ON a.campaign_id = c.id
          WHERE c.document_version_id = d.current_version_id
        ) ack ON true
        WHERE d.tenant_id = ${tenantId}
          ${q.kind ? sql`AND d.kind = ${q.kind}::document_kind` : sql``}
          ${q.status ? sql`AND d.status = ${q.status}::document_status` : sql``}
          ${q.q ? sql`AND (d.title ILIKE ${'%' + q.q + '%'} OR d.key ILIKE ${'%' + q.q + '%'})` : sql``}
        ORDER BY d.kind, d.title
        LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`);
      return { items: items.rows, total: total?.n ?? 0, page: q.page, size: q.size };
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const doc = await this.require(tx, tenantId, id);
    const versions = await tx
      .select()
      .from(schema.documentVersion)
      .where(eq(schema.documentVersion.documentId, id))
      .orderBy(desc(schema.documentVersion.createdAt));
    const campaigns = await tx.execute(sql`
      SELECT c.id, c.subject, c.due_at AS "dueAt", c.created_at AS "createdAt", v.version_label AS "versionLabel",
             count(a.*)::int AS total,
             count(a.*) FILTER (WHERE a.acknowledged_at IS NOT NULL)::int AS done
      FROM acknowledgement_campaign c
      JOIN document_version v ON v.id = c.document_version_id
      LEFT JOIN acknowledgement a ON a.campaign_id = c.id
      WHERE v.document_id = ${id} AND c.tenant_id = ${tenantId}
      GROUP BY c.id, c.subject, c.due_at, c.created_at, v.version_label
      ORDER BY c.created_at DESC`);
    const requirements = await tx.execute(sql`
      SELECT r.id, f.key AS framework, r.ref_code AS "refCode", r.title
      FROM document_requirement dr JOIN requirement r ON r.id = dr.requirement_id JOIN framework f ON f.id = r.framework_id
      WHERE dr.document_id = ${id} ORDER BY f.key, r.sort_order`);
    return { ...doc, versions, campaigns: campaigns.rows, requirements: requirements.rows };
  }

  async create(ctx: AuthContext, dto: DocumentDtoInput) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: schema.document.id })
        .from(schema.document)
        .where(and(eq(schema.document.tenantId, tenantId), eq(schema.document.key, dto.key)));
      if (existing) throw new ConflictException({ title: `Kürzel „${dto.key}“ ist bereits vergeben` });
      const [doc] = await tx
        .insert(schema.document)
        .values({
          tenantId,
          key: dto.key,
          title: dto.title,
          kind: dto.kind as never,
          classification: dto.classification as never,
          ownerPersonId: dto.ownerPersonId ?? null,
          reviewIntervalMonths: dto.reviewIntervalMonths ?? 12,
        })
        .returning();
      return doc;
    });
  }

  /** Neue Version anlegen — immer im Entwurf, nie direkt veröffentlicht. */
  async addVersion(
    ctx: AuthContext,
    documentId: string,
    dto: { versionLabel: string; changeNote?: string; contentMd?: string },
  ) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, documentId);
      const [dupe] = await tx
        .select({ id: schema.documentVersion.id })
        .from(schema.documentVersion)
        .where(
          and(
            eq(schema.documentVersion.documentId, documentId),
            eq(schema.documentVersion.versionLabel, dto.versionLabel),
          ),
        );
      if (dupe) throw new ConflictException({ title: `Version ${dto.versionLabel} existiert bereits` });

      const [v] = await tx
        .insert(schema.documentVersion)
        .values({
          tenantId,
          documentId,
          versionLabel: dto.versionLabel,
          changeNote: dto.changeNote ?? null,
          contentMd: dto.contentMd ?? null,
          authorUserId: ctx.userId,
        })
        .returning();
      await tx.update(schema.document).set({ status: 'draft' }).where(eq(schema.document.id, documentId));
      return v;
    });
  }

  async submitForReview(ctx: AuthContext, documentId: string, versionId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, documentId);
      await tx
        .update(schema.documentVersion)
        .set({ submittedAt: new Date() })
        .where(eq(schema.documentVersion.id, versionId));
      await tx.update(schema.document).set({ status: 'in_review' }).where(eq(schema.document.id, documentId));
      return this.loadDetail(tx, tenantId, documentId);
    });
  }

  /**
   * Freigeben und veröffentlichen. Vier-Augen-Prinzip: nie durch den Autor der Version
   * (zusätzlich per CHECK-Constraint in der Datenbank abgesichert).
   * Setzt zugleich die nächste Prüffrist nach dem Überprüfungsintervall des Dokuments.
   */
  async approve(ctx: AuthContext, documentId: string, versionId: string) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const doc = await this.require(tx, tenantId, documentId);
      const [version] = await tx
        .select()
        .from(schema.documentVersion)
        .where(
          and(eq(schema.documentVersion.id, versionId), eq(schema.documentVersion.documentId, documentId)),
        );
      if (!version) throw new NotFoundException({ title: 'Version nicht gefunden' });
      if (version.authorUserId === ctx.userId) {
        throw new ConflictException({
          type: 'https://isms.example/problems/sod-violation',
          title: 'Funktionstrennung verletzt',
          detail: 'Eine Dokumentversion darf nicht von ihrer Autorin oder ihrem Autor freigegeben werden.',
        });
      }

      const now = new Date();
      const nextReview = new Date(now);
      nextReview.setMonth(nextReview.getMonth() + doc.reviewIntervalMonths);

      await tx
        .update(schema.documentVersion)
        .set({ approvedByUserId: ctx.userId, approvedAt: now, publishedAt: now })
        .where(eq(schema.documentVersion.id, versionId));
      await tx
        .update(schema.document)
        .set({
          status: 'published',
          currentVersionId: versionId,
          nextReviewAt: nextReview.toISOString().slice(0, 10),
        })
        .where(eq(schema.document.id, documentId));
      return this.loadDetail(tx, tenantId, documentId);
    });
  }

  /**
   * Lesebestätigung anfordern. Die Zielgruppe wird sofort in einzelne Einträge aufgelöst —
   * so ist die Frage „wer fehlt noch?“ eine einfache Abfrage und Nachzügler lassen sich ergänzen.
   */
  async requestAcknowledgement(
    ctx: AuthContext,
    documentId: string,
    dto: {
      subject?: string;
      message?: string;
      dueAt?: string;
      target?: { mode: 'all' | 'persons'; personIds?: string[] };
    },
  ) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const doc = await this.require(tx, tenantId, documentId);
      if (!doc.currentVersionId) {
        throw new BadRequestException({
          title: 'Keine freigegebene Version',
          detail: 'Eine Lesebestätigung lässt sich nur zu einer veröffentlichten Version anfordern.',
        });
      }
      const target = dto.target ?? { mode: 'all' as const };
      const [campaign] = await tx
        .insert(schema.acknowledgementCampaign)
        .values({
          tenantId,
          documentVersionId: doc.currentVersionId,
          subject: dto.subject ?? `Bitte lesen: ${doc.title}`,
          message: dto.message ?? null,
          target,
          dueAt: dto.dueAt ?? null,
          createdByUserId: ctx.userId,
        })
        .returning();

      const recipients =
        target.mode === 'persons' && target.personIds?.length
          ? await tx
              .select({ id: schema.person.id })
              .from(schema.person)
              .where(
                and(
                  eq(schema.person.tenantId, tenantId),
                  eq(schema.person.isActive, true),
                  inArray(schema.person.id, target.personIds),
                ),
              )
          : await tx
              .select({ id: schema.person.id })
              .from(schema.person)
              .where(and(eq(schema.person.tenantId, tenantId), eq(schema.person.isActive, true)));

      if (recipients.length === 0) {
        throw new BadRequestException({
          title: 'Keine Empfänger',
          detail: 'Im Mandanten sind keine aktiven Personen hinterlegt.',
        });
      }
      await tx
        .insert(schema.acknowledgement)
        .values(
          recipients.map((r) => ({ campaignId: campaign!.id, personId: r.id, tenantId, sentAt: new Date() })),
        );
      return { campaignId: campaign!.id, recipients: recipients.length };
    });
  }

  /**
   * Bestätigung einer Person — ohne Angabe die eigene. Für andere darf nur bestätigen,
   * wer die Dokumentenlenkung pflegt (Nachtragen einer Bestätigung auf Papier).
   */
  async acknowledge(ctx: AuthContext, campaignId: string, personId?: string) {
    const tenantId = ctx.tenantId!;
    const target = personId ?? ctx.personId;
    if (!target) {
      throw new BadRequestException({
        title: 'Keine Person verknüpft',
        detail:
          'Das Konto ist keinem Beschäftigten zugeordnet; eine Lesebestätigung ist daher nicht zuordenbar.',
      });
    }
    if (target !== ctx.personId && !can(ctx, P.DOCUMENT_WRITE)) {
      throw new ForbiddenException({ title: 'Nur die eigene Lesebestätigung darf bestätigt werden' });
    }
    return this.dbs.tenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.acknowledgement)
        .set({ acknowledgedAt: new Date() })
        .where(
          and(eq(schema.acknowledgement.campaignId, campaignId), eq(schema.acknowledgement.personId, target)),
        )
        .returning();
      if (!row) throw new NotFoundException({ title: 'Für diese Person liegt keine Leseanforderung vor' });
      return row;
    });
  }

  /** Wer hat noch nicht bestätigt — die Frage, die vor jedem Audit gestellt wird. */
  async pending(tenantId: string, campaignId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT p.id, p.name, p.email, p.department, a.sent_at AS "sentAt", a.acknowledged_at AS "acknowledgedAt"
        FROM acknowledgement a JOIN person p ON p.id = a.person_id
        WHERE a.campaign_id = ${campaignId} AND a.tenant_id = ${tenantId}
        ORDER BY (a.acknowledged_at IS NOT NULL), p.name`);
      return res.rows;
    });
  }

  /** Offene Leseanforderungen der aufrufenden Person — „was muss ich noch lesen?“ */
  async myPending(tenantId: string, personId: string | null) {
    if (!personId) return [];
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT c.id AS "campaignId", c.subject, c.due_at AS "dueAt", d.id AS "documentId", d.title, v.version_label AS "versionLabel",
               (c.due_at < current_date) AS overdue
        FROM acknowledgement a
        JOIN acknowledgement_campaign c ON c.id = a.campaign_id
        JOIN document_version v ON v.id = c.document_version_id
        JOIN document d ON d.id = v.document_id
        WHERE a.person_id = ${personId} AND a.acknowledged_at IS NULL AND a.tenant_id = ${tenantId}
        ORDER BY c.due_at NULLS LAST`);
      return res.rows;
    });
  }

  async linkRequirement(ctx: AuthContext, documentId: string, requirementId: string) {
    const tenantId = ctx.tenantId!;
    await this.dbs.tenant(tenantId, async (tx) => {
      await this.require(tx, tenantId, documentId);
      await tx.insert(schema.documentRequirement).values({ documentId, requirementId }).onConflictDoNothing();
    });
  }

  private async require(tx: TenantTx, tenantId: string, id: string) {
    const [d] = await tx
      .select()
      .from(schema.document)
      .where(and(eq(schema.document.id, id), eq(schema.document.tenantId, tenantId)));
    if (!d) throw new NotFoundException({ title: 'Dokument nicht gefunden' });
    return d;
  }
}
