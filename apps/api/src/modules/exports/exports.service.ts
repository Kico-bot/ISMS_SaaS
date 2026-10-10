import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  APPLICABILITY_LABEL,
  BSI_CHECK_LABEL,
  LEGAL_BASIS_LABEL,
  MEASURE_STATUS_LABEL,
  PROCESSING_ROLE_LABEL,
  PROTECTION_VARIANT_LABEL,
  REQUIREMENT_LEVEL_LABEL,
} from '@isms/shared';
import { DbService } from '../../kernel/db/db.service';
import { toCsv } from './csv';
import { escapeHtml, htmlTable, renderDocument } from './document';

/** „Art. 21 Abs. 2 j) (§ 30 Abs. 2 Nr. 10 BSIG)“ — ein deutscher Prüfer fragt nach dem Paragrafen. */
const withAltRef = (r: Record<string, unknown>) =>
  r.altRef ? `${String(r.refCode)} (${String(r.altRef)})` : r.refCode;

export interface ExportResult {
  filename: string;
  contentType: string;
  body: string;
}

/**
 * Ausleitungen für Auditoren und Aufsichtsbehörden.
 *
 * Beide Formate bedienen denselben Datenstand: CSV für alle, die filtern und kommentieren
 * wollen, ein druckfertiges Dokument für alle, die ein unterschriebenes Blatt Papier erwarten.
 * Nichts davon wird gepflegt — beides entsteht bei jedem Abruf neu aus dem ISMS.
 */
@Injectable()
export class ExportsService {
  constructor(private readonly dbs: DbService) {}

  // --- Erklärung zur Anwendbarkeit (ISO 27001 Kap. 6.1.3 d) -------------------------------
  private async soaRows(tenantId: string, frameworkKey: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [framework] = (
        await tx.execute(sql`
          SELECT f.key, f.name, f.version,
                 EXISTS (SELECT 1 FROM requirement b WHERE b.framework_id = f.id AND b.kind = 'baustein') AS modular,
                 COALESCE(tf.protection_variant::text, 'standard') AS "protectionVariant"
          FROM framework f
          LEFT JOIN tenant_framework tf ON tf.framework_id = f.id AND tf.tenant_id = ${tenantId}
          WHERE f.key = ${frameworkKey}`)
      ).rows as {
        key: string;
        name: string;
        version: string | null;
        modular: boolean;
        protectionVariant: string;
      }[];
      if (!framework) throw new NotFoundException({ title: `Framework ${frameworkKey} ist nicht bekannt` });

      const [tenant] = (await tx.execute(sql`SELECT name FROM tenant WHERE id = ${tenantId}`)).rows as {
        name: string;
      }[];

      const rows = await tx.execute(sql`
        SELECT r.group_ref_code AS "groupRefCode", r.group_title AS "groupTitle",
               r.ref_code AS "refCode", req.alt_ref AS "altRef", r.title, r.level::text AS level,
               requirement_check_status(${tenantId}, r.id) AS "checkStatus",
               COALESCE(tr.applicability::text, 'applicable') AS applicability,
               tr.justification, tr.maturity, tr.target_maturity AS "targetMaturity", tr.notes,
               COALESCE(
                 (SELECT string_agg(m.ref_no || ' ' || m.title, E'\n' ORDER BY m.ref_no)
                  FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
                  WHERE mr.requirement_id = r.id AND mr.tenant_id = ${tenantId}),
                 '') AS measures,
               COALESCE(
                 (SELECT string_agg(DISTINCT m.status::text, ', ')
                  FROM measure_requirement mr JOIN measure m ON m.id = mr.measure_id
                  WHERE mr.requirement_id = r.id AND mr.tenant_id = ${tenantId}),
                 '') AS "measureStatus"
        FROM v_assessable_requirement r
        JOIN requirement req ON req.id = r.id
        JOIN framework f ON f.id = r.framework_id
        LEFT JOIN tenant_requirement tr ON tr.requirement_id = r.id AND tr.tenant_id = ${tenantId}
        WHERE f.key = ${frameworkKey}
          AND requirement_in_scope(${tenantId}, r.id)
        ORDER BY r.group_sort_order, r.sort_order`);

      // Modellierung (Referenzdokument A.3) — nur bei Katalogen mit Bausteinen.
      const modules = framework.modular
        ? ((
            await tx.execute(sql`
              SELECT b.ref_code AS "refCode", b.title, tm.elevated, tm.note
              FROM tenant_module tm JOIN requirement b ON b.id = tm.requirement_id
              JOIN framework f ON f.id = b.framework_id
              WHERE tm.tenant_id = ${tenantId} AND f.key = ${frameworkKey}
              ORDER BY b.sort_order`)
          ).rows as { refCode: string; title: string; elevated: boolean; note: string | null }[])
        : [];

      return {
        framework,
        tenantName: tenant?.name ?? 'Mandant',
        rows: rows.rows as Record<string, unknown>[],
        modules,
      };
    });
  }

  async soaCsv(tenantId: string, frameworkKey: string): Promise<ExportResult> {
    const { framework, rows } = await this.soaRows(tenantId, frameworkKey);
    if (framework.modular) {
      const body = toCsv(
        [
          'Baustein',
          'Bausteintitel',
          'Referenz',
          'Anforderung',
          'Stufe',
          'Umsetzung',
          'Begründung',
          'Maßnahmen',
        ],
        rows.map((r) => [
          r.groupRefCode,
          r.groupTitle,
          r.refCode,
          r.title,
          REQUIREMENT_LEVEL_LABEL[r.level as string] ?? r.level,
          BSI_CHECK_LABEL[r.checkStatus as string] ?? r.checkStatus,
          [r.justification, r.notes].filter(Boolean).join(' — '),
          r.measures,
        ]),
      );
      return {
        filename: `grundschutz-check-${framework.key.toLowerCase()}`,
        contentType: 'text/csv; charset=utf-8',
        body,
      };
    }
    const body = toCsv(
      [
        'Kapitel',
        'Kapiteltitel',
        'Referenz',
        'Anforderung',
        'Anwendbarkeit',
        'Begründung',
        'Reifegrad',
        'Zielreifegrad',
        'Maßnahmen',
        'Status der Maßnahmen',
        'Anmerkung',
      ],
      rows.map((r) => [
        r.groupRefCode,
        r.groupTitle,
        withAltRef(r),
        r.title,
        APPLICABILITY_LABEL[r.applicability as string] ?? r.applicability,
        r.justification,
        r.maturity,
        r.targetMaturity,
        r.measures,
        String(r.measureStatus ?? '')
          .split(', ')
          .filter(Boolean)
          .map((s) => MEASURE_STATUS_LABEL[s] ?? s)
          .join(', '),
        r.notes,
      ]),
    );
    return { filename: `soa-${framework.key.toLowerCase()}`, contentType: 'text/csv; charset=utf-8', body };
  }

  async soaDocument(tenantId: string, frameworkKey: string): Promise<ExportResult> {
    const data = await this.soaRows(tenantId, frameworkKey);
    if (data.framework.modular) return this.checkDocument(data);
    const { framework, tenantName, rows } = data;

    // Nach Kapiteln gliedern — so liest sich das Dokument wie die Norm selbst.
    const groups = new Map<string, { title: string; rows: Record<string, unknown>[] }>();
    for (const r of rows) {
      const key = String(r.groupRefCode ?? '—');
      if (!groups.has(key)) groups.set(key, { title: String(r.groupTitle ?? ''), rows: [] });
      groups.get(key)!.rows.push(r);
    }

    const sections = [...groups.entries()]
      .map(
        ([code, group]) =>
          `<h2>${escapeHtml(code)} ${escapeHtml(group.title)}</h2>` +
          htmlTable(
            [
              'Referenz',
              'Anforderung',
              'Anwendbarkeit',
              'Begründung / Anmerkung',
              'Umsetzende Maßnahmen',
              'Reifegrad',
            ],
            group.rows.map((r) => [
              withAltRef(r),
              r.title,
              APPLICABILITY_LABEL[r.applicability as string] ?? r.applicability,
              [r.justification, r.notes].filter(Boolean).join(' — '),
              r.measures,
              r.maturity == null ? '' : `${r.maturity} von 5`,
            ]),
            [7, 26, 10, 25, 24, 8],
          ),
      )
      .join('\n');

    const applicable = rows.filter((r) => (r.applicability ?? 'applicable') === 'applicable').length;
    const notApplicable = rows.length - applicable;
    const covered = rows.filter((r) => String(r.measures ?? '').length > 0).length;

    const summary = htmlTable(
      ['Anforderungen gesamt', 'davon anwendbar', 'davon nicht anwendbar', 'mit mindestens einer Maßnahme'],
      [[rows.length, applicable, notApplicable, covered]],
    );

    return {
      filename: `erklaerung-zur-anwendbarkeit-${framework.key.toLowerCase()}`,
      contentType: 'text/html; charset=utf-8',
      body: renderDocument(
        {
          title: 'Erklärung zur Anwendbarkeit',
          tenantName,
          // Der Name trägt die Ausgabe meist schon („ISO/IEC 27001:2022“) — dann nicht doppeln.
          subtitle:
            framework.version && !framework.name.includes(framework.version)
              ? `${framework.name} ${framework.version}`
              : framework.name,
          note: 'Dokumentierte Information nach ISO/IEC 27001 Kap. 6.1.3 d). Für jede Anforderung ist die Anwendbarkeit ausgewiesen; bei „nicht anwendbar“ ist die Begründung Pflicht. Die Spalte „Umsetzende Maßnahmen“ zeigt die Maßnahmen, die im ISMS auf diese Anforderung zahlen.',
        },
        summary + sections,
      ),
    };
  }

  /**
   * IT-Grundschutz kennt keine Anwendbarkeitserklärung. Seine Entsprechung sind Modellierung
   * (welche Bausteine gelten) und IT-Grundschutz-Check (Stand je Anforderung) — die
   * Referenzdokumente A.3 und A.4 einer Zertifizierung auf Basis von IT-Grundschutz.
   */
  private checkDocument({
    framework,
    tenantName,
    rows,
    modules,
  }: Awaited<ReturnType<ExportsService['soaRows']>>): ExportResult {
    const modeling = htmlTable(
      ['Baustein', 'Titel', 'Erhöhter Schutzbedarf', 'Zielobjekte / Begründung'],
      modules.map((m) => [m.refCode, m.title, m.elevated ? 'ja' : '', m.note ?? '']),
      [12, 38, 12, 38],
    );

    const groups = new Map<string, { title: string; rows: Record<string, unknown>[] }>();
    for (const r of rows) {
      const key = String(r.groupRefCode ?? '—');
      if (!groups.has(key)) groups.set(key, { title: String(r.groupTitle ?? ''), rows: [] });
      groups.get(key)!.rows.push(r);
    }
    const sections = [...groups.entries()]
      .map(
        ([code, group]) =>
          `<h3>${escapeHtml(code)} ${escapeHtml(group.title)}</h3>` +
          htmlTable(
            ['Referenz', 'Anforderung', 'Stufe', 'Umsetzung', 'Begründung / Anmerkung', 'Maßnahmen'],
            group.rows.map((r) => [
              r.refCode,
              r.title,
              REQUIREMENT_LEVEL_LABEL[r.level as string] ?? r.level,
              BSI_CHECK_LABEL[r.checkStatus as string] ?? r.checkStatus,
              [r.justification, r.notes].filter(Boolean).join(' — '),
              r.measures,
            ]),
            [10, 30, 9, 9, 20, 22],
          ),
      )
      .join('\n');

    const count = (status: string) => rows.filter((r) => r.checkStatus === status).length;
    const summary = htmlTable(
      ['Bausteine modelliert', 'Anforderungen', 'ja', 'teilweise', 'nein', 'entbehrlich'],
      [[modules.length, rows.length, count('yes'), count('partial'), count('no'), count('dispensable')]],
    );

    return {
      filename: `grundschutz-check-${framework.key.toLowerCase()}`,
      contentType: 'text/html; charset=utf-8',
      body: renderDocument(
        {
          title: 'Modellierung und IT-Grundschutz-Check',
          tenantName,
          subtitle: `${framework.name} · ${PROTECTION_VARIANT_LABEL[framework.protectionVariant] ?? framework.protectionVariant}`,
          note: 'Nach BSI-Standard 200-2. Aufgeführt sind nur die Anforderungen der modellierten Bausteine in der gewählten Absicherungsvariante. Der Umsetzungsstatus ergibt sich aus den zugeordneten Maßnahmen: „ja“ — eine umgesetzte Maßnahme deckt die Anforderung vollständig ab, „teilweise“ — nur zum Teil, „entbehrlich“ — mit Begründung.',
        },
        summary + '<h2>Modellierung</h2>' + modeling + '<h2>IT-Grundschutz-Check</h2>' + sections,
      ),
    };
  }

  // --- Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) ---------------------------
  private async processingRows(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [tenant] = (await tx.execute(sql`SELECT name FROM tenant WHERE id = ${tenantId}`)).rows as {
        name: string;
      }[];
      const rows = await tx.execute(sql`
        SELECT pa.name, pa.purpose, pa.role::text AS role, pa.legal_basis::text AS "legalBasis",
               pa.legal_basis_note AS "legalBasisNote",
               pa.data_subject_categories AS "dataSubjectCategories", pa.data_categories AS "dataCategories",
               pa.special_categories AS "specialCategories", pa.recipients,
               pa.third_country_transfer AS "thirdCountryTransfer", pa.safeguards, pa.retention,
               pa.status::text AS status, o.name AS "ownerName",
               COALESCE(
                 (SELECT string_agg(m.ref_no || ' ' || m.title, E'\n' ORDER BY m.ref_no)
                  FROM processing_tom t JOIN measure m ON m.id = t.measure_id
                  WHERE t.processing_activity_id = pa.id),
                 '') AS toms
        FROM processing_activity pa
        LEFT JOIN person o ON o.id = pa.owner_person_id
        WHERE pa.tenant_id = ${tenantId}
        ORDER BY pa.status, pa.name`);
      return { tenantName: tenant?.name ?? 'Mandant', rows: rows.rows as Record<string, unknown>[] };
    });
  }

  async processingCsv(tenantId: string): Promise<ExportResult> {
    const { rows } = await this.processingRows(tenantId);
    const body = toCsv(
      [
        'Verarbeitungstätigkeit',
        'Zweck (lit. b)',
        'Rolle',
        'Rechtsgrundlage',
        'Anmerkung zur Rechtsgrundlage',
        'Kategorien betroffener Personen (lit. c)',
        'Kategorien personenbezogener Daten (lit. c)',
        'Besondere Kategorien (Art. 9)',
        'Empfänger (lit. d)',
        'Drittlandübermittlung (lit. e)',
        'Garantien nach Kapitel V',
        'Löschfrist (lit. f)',
        'Technische und organisatorische Maßnahmen (Art. 32)',
        'Fachverantwortung',
        'Status',
      ],
      rows.map((r) => [
        r.name,
        r.purpose,
        PROCESSING_ROLE_LABEL[r.role as string] ?? r.role,
        r.legalBasis ? (LEGAL_BASIS_LABEL[r.legalBasis as string] ?? r.legalBasis) : '',
        r.legalBasisNote,
        r.dataSubjectCategories,
        r.dataCategories,
        r.specialCategories,
        r.recipients,
        r.thirdCountryTransfer,
        r.safeguards,
        r.retention,
        r.toms,
        r.ownerName,
        r.status,
      ]),
    );
    return { filename: 'verarbeitungsverzeichnis', contentType: 'text/csv; charset=utf-8', body };
  }

  async processingDocument(tenantId: string): Promise<ExportResult> {
    const { tenantName, rows } = await this.processingRows(tenantId);
    const table = htmlTable(
      [
        'Verarbeitung',
        'Zweck',
        'Rolle',
        'Rechtsgrundlage',
        'Betroffene / Daten',
        'Empfänger',
        'Drittland',
        'Löschfrist',
        'Maßnahmen (Art. 32)',
      ],
      rows.map((r) => [
        r.name,
        r.purpose,
        PROCESSING_ROLE_LABEL[r.role as string] ?? r.role,
        r.legalBasis ? (LEGAL_BASIS_LABEL[r.legalBasis as string] ?? r.legalBasis) : 'nicht angegeben',
        [
          (r.dataSubjectCategories as string[])?.join(', '),
          (r.dataCategories as string[])?.join(', '),
          r.specialCategories ? 'besondere Kategorien nach Art. 9' : '',
        ]
          .filter(Boolean)
          .join(' — '),
        r.recipients,
        r.thirdCountryTransfer ? `ja — ${r.safeguards ?? 'ohne Garantien'}` : 'nein',
        r.retention,
        r.toms,
      ]),
    );
    return {
      filename: 'verarbeitungsverzeichnis',
      contentType: 'text/html; charset=utf-8',
      body: renderDocument(
        {
          title: 'Verzeichnis von Verarbeitungstätigkeiten',
          tenantName,
          subtitle: 'Art. 30 DSGVO',
          note: 'Das Verzeichnis ist der Aufsichtsbehörde auf Anfrage vorzulegen (Art. 30 Abs. 4 DSGVO). Die technischen und organisatorischen Maßnahmen nach Art. 32 sind dieselben Maßnahmen wie im Informationssicherheits-Managementsystem.',
        },
        table,
      ),
    };
  }

  // --- Risikoregister ---------------------------------------------------------------------
  async riskCsv(tenantId: string): Promise<ExportResult> {
    const body = await this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT r.ref_no AS "refNo", r.title, r.description, r.category, r.status::text AS status,
               r.treatment::text AS treatment, p.name AS "ownerName",
               r.likelihood, r.impact, r.score,
               r.accepted_at AS "acceptedAt", r.accepted_until AS "acceptedUntil",
               r.next_review_at AS "nextReviewAt",
               COALESCE((SELECT string_agg(a.ref_no || ' ' || a.name, E'\n' ORDER BY a.ref_no)
                         FROM risk_asset ra JOIN asset a ON a.id = ra.asset_id
                         WHERE ra.risk_id = r.id AND ra.tenant_id = ${tenantId}), '') AS assets,
               COALESCE((SELECT string_agg(m.ref_no || ' ' || m.title, E'\n' ORDER BY m.ref_no)
                         FROM risk_measure rm JOIN measure m ON m.id = rm.measure_id
                         WHERE rm.risk_id = r.id AND rm.tenant_id = ${tenantId}), '') AS measures
        FROM risk r
        LEFT JOIN person p ON p.id = r.owner_person_id
        WHERE r.tenant_id = ${tenantId}
        ORDER BY r.score DESC NULLS LAST, r.ref_no`);
      return toCsv(
        [
          'Nr.',
          'Risiko',
          'Beschreibung',
          'Kategorie',
          'Status',
          'Behandlung',
          'Risk-Owner',
          'Wahrscheinlichkeit (1–5)',
          'Auswirkung (1–5)',
          'Risiko heute (1–25)',
          'Akzeptiert am',
          'Akzeptanz gültig bis',
          'Nächste Überprüfung',
          'Betroffene Assets',
          'Maßnahmen',
        ],
        (rows.rows as Record<string, unknown>[]).map((r) => [
          r.refNo,
          r.title,
          r.description,
          r.category,
          r.status,
          r.treatment,
          r.ownerName,
          r.likelihood,
          r.impact,
          r.score,
          r.acceptedAt,
          r.acceptedUntil,
          r.nextReviewAt,
          r.assets,
          r.measures,
        ]),
      );
    });
    return { filename: 'risikoregister', contentType: 'text/csv; charset=utf-8', body };
  }

  // --- Maßnahmenregister ------------------------------------------------------------------
  async measureCsv(tenantId: string): Promise<ExportResult> {
    const body = await this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT m.ref_no AS "refNo", m.title, m.description, m.domain::text AS domain,
               m.status::text AS status, m.maturity, m.due_date AS "dueDate",
               p.name AS "ownerName", m.effort_days AS "effortDays", m.cost_eur AS "costEur",
               m.verified_at AS "verifiedAt",
               COALESCE((SELECT string_agg(f.key || ' ' || rq.ref_code, ', ' ORDER BY f.key, rq.sort_order)
                         FROM measure_requirement mr JOIN requirement rq ON rq.id = mr.requirement_id
                         JOIN framework f ON f.id = rq.framework_id
                         WHERE mr.measure_id = m.id AND mr.tenant_id = ${tenantId}), '') AS requirements,
               COALESCE((SELECT string_agg(e.title, E'\n' ORDER BY e.collected_at DESC)
                         FROM measure_evidence me JOIN evidence e ON e.id = me.evidence_id
                         WHERE me.measure_id = m.id AND e.tenant_id = ${tenantId}), '') AS evidence
        FROM measure m
        LEFT JOIN person p ON p.id = m.owner_person_id
        WHERE m.tenant_id = ${tenantId}
        ORDER BY m.ref_no`);
      return toCsv(
        [
          'Nr.',
          'Maßnahme',
          'Beschreibung',
          'Bereich',
          'Status',
          'Reifegrad',
          'Fällig',
          'Verantwortlich',
          'Aufwand (Tage)',
          'Kosten (EUR)',
          'Verifiziert am',
          'Erfüllte Anforderungen',
          'Nachweise',
        ],
        (rows.rows as Record<string, unknown>[]).map((r) => [
          r.refNo,
          r.title,
          r.description,
          r.domain,
          MEASURE_STATUS_LABEL[r.status as string] ?? r.status,
          r.maturity,
          r.dueDate,
          r.ownerName,
          r.effortDays,
          r.costEur,
          r.verifiedAt,
          r.requirements,
          r.evidence,
        ]),
      );
    });
    return { filename: 'massnahmenregister', contentType: 'text/csv; charset=utf-8', body };
  }
}
