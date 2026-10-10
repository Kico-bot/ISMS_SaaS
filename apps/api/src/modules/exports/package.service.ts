import { Injectable, Logger } from '@nestjs/common';
import archiver, { type Archiver } from 'archiver';
import { type SQL, sql } from 'drizzle-orm';
import {
  ACTION_KIND_LABEL,
  AI_ANNEX_III_LABEL,
  AI_RISK_CLASS_LABEL,
  AI_SYSTEM_STATUS_LABEL,
  ACTION_STATUS_LABEL,
  ASSET_CATEGORY_LABEL,
  ASSET_STATUS_LABEL,
  ASSET_TYPE_LABEL,
  AUDIT_KIND_LABEL,
  AUDIT_LOG_ACTION_LABEL,
  AUDIT_STATUS_LABEL,
  BIA_STATUS_LABEL,
  CHANGE_PLAN_STATUS_LABEL,
  CLASSIFICATION_LABEL,
  CONTROL_DOMAIN_LABEL,
  COVERAGE_LABEL,
  DOCUMENT_KIND_LABEL,
  DOCUMENT_STATUS_LABEL,
  DPIA_RESULT_LABEL,
  DPIA_STATUS_LABEL,
  FINDING_SEVERITY_LABEL,
  FINDING_SOURCE_LABEL,
  FINDING_STATUS_LABEL,
  INCIDENT_CATEGORY_LABEL,
  INCIDENT_SOURCE_LABEL,
  INCIDENT_STATUS_LABEL,
  LEGAL_BASIS_LABEL,
  MAPPING_ORIGIN_LABEL,
  MEASURE_STATUS_LABEL,
  MEMBERSHIP_STATUS_LABEL,
  OBJECTIVE_KIND_LABEL,
  OBJECTIVE_STATUS_LABEL,
  ORG_NODE_KIND_LABEL,
  PARTY_CATEGORY_LABEL,
  PESTLE_DIMENSION_LABEL,
  PESTLE_EFFECT_LABEL,
  PLAN_STATUS_LABEL,
  PROCESSING_ROLE_LABEL,
  PROCESSING_STATUS_LABEL,
  REPORTING_REGIME_LABEL,
  RISK_KIND_LABEL,
  RISK_SOURCE_LABEL,
  RISK_STATUS_LABEL,
  RISK_TREATMENT_LABEL,
  SEVERITY_LABEL,
  TRAINING_KIND_LABEL,
} from '@isms/shared';
import { DbService } from '../../kernel/db/db.service';
import { StorageService } from '../../kernel/storage/storage.service';
import { toCsv } from './csv';
import { escapeHtml, htmlTable, renderDocument } from './document';
import { ExportsService } from './exports.service';

/**
 * Das Auditpaket: der gesamte Datenbestand eines Mandanten in einer ZIP-Datei.
 *
 * Gedacht für den Moment, in dem jemand mit einem Ordner unter dem Arm im Besprechungsraum
 * sitzt und fragt: „Zeigen Sie mir Ihr ISMS.“ Statt zwanzig Einzelausleitungen gibt es eine
 * Datei — jedes Register als CSV, die Anwendbarkeitserklärung und das Verarbeitungsverzeichnis
 * zusätzlich als druckfertiges Dokument, und die hinterlegten Nachweisdateien im Original.
 *
 * Erzeugt wird alles bei jedem Abruf neu. Es gibt keinen zweiten Datenstand, der gepflegt
 * werden müsste, und damit auch keinen, der veralten kann.
 */
@Injectable()
export class AuditPackageService {
  private readonly log = new Logger('AuditPackage');

  constructor(
    private readonly dbs: DbService,
    private readonly storage: StorageService,
    private readonly exports: ExportsService,
  ) {}

  /**
   * Baut das Paket und gibt den Datenstrom zurück. Bewusst streamend: die Nachweisdateien
   * können zusammen etliche hundert Megabyte ergeben, und die sollen nicht erst vollständig
   * in den Arbeitsspeicher.
   */
  async build(tenantId: string): Promise<{ filename: string; archive: Archiver }> {
    const tenant = await this.tenantInfo(tenantId);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (e) => this.log.warn(e.message));
    archive.on('error', (e) => this.log.error(e.message));

    const summary: { folder: string; file: string; title: string; rows: number }[] = [];

    for (const register of REGISTERS) {
      const { headers, rows } = await this.runQuery(tenantId, register.sql(tenantId));
      archive.append(Buffer.from(toCsv(headers, rows), 'utf8'), {
        name: `${register.folder}/${register.file}.csv`,
      });
      summary.push({ ...register, rows: rows.length });
    }

    // Die beiden Register, die ein Auditor unterschrieben sehen will, zusätzlich als Dokument.
    for (const framework of tenant.frameworks) {
      // IT-Grundschutz liefert statt der SoA Modellierung und Grundschutz-Check; der Dateiname
      // kommt deshalb aus dem Export selbst.
      const doc = await this.exports.soaDocument(tenantId, framework.key);
      const csv = await this.exports.soaCsv(tenantId, framework.key);
      const base = csv.filename.startsWith('grundschutz-check')
        ? csv.filename
        : `soa-${framework.key.toLowerCase()}`;
      archive.append(Buffer.from(doc.body, 'utf8'), { name: `01-anwendbarkeitserklaerung/${base}.html` });
      archive.append(Buffer.from(csv.body, 'utf8'), { name: `01-anwendbarkeitserklaerung/${base}.csv` });
    }
    const vvt = await this.exports.processingDocument(tenantId);
    archive.append(Buffer.from(vvt.body, 'utf8'), {
      name: '09-datenschutz/verarbeitungsverzeichnis.html',
    });

    const files = await this.appendFiles(tenantId, archive);

    archive.append(Buffer.from(this.readme(tenant, summary, files), 'utf8'), {
      name: 'LIESMICH.html',
    });

    void archive.finalize();
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `isms-auditpaket-${tenant.slug}-${stamp}.zip`, archive };
  }

  /**
   * Die hinterlegten Dateien im Original — ein Nachweisregister ohne die Nachweise wäre nur
   * eine Behauptungsliste. Fehlt eine Datei im Speicher, wird das im Verzeichnis vermerkt
   * statt das ganze Paket scheitern zu lassen.
   */
  private async appendFiles(
    tenantId: string,
    archive: Archiver,
  ): Promise<{ total: number; missing: number }> {
    const rows = await this.dbs.tenant(
      tenantId,
      async (tx) =>
        (
          await tx.execute(sql`
          SELECT f.id, f.storage_key AS "storageKey", f.filename, f.mime, f.size_bytes AS "sizeBytes",
                 f.sha256, f.created_at AS "createdAt",
                 COALESCE(
                   (SELECT string_agg(DISTINCT x.bezug, '; ') FROM (
                      SELECT 'Nachweis: ' || e.title AS bezug FROM evidence e WHERE e.file_id = f.id
                      UNION ALL
                      SELECT 'Dokument ' || d.key || ' Fassung ' || v.version_label
                        FROM document_version v JOIN document d ON d.id = v.document_id WHERE v.file_id = f.id
                      UNION ALL
                      SELECT 'Auditbericht ' || a.ref_no FROM "audit" a WHERE a.report_file_id = f.id
                      UNION ALL
                      SELECT 'Protokoll der Managementbewertung vom ' || mr.held_at::text
                        FROM management_review mr WHERE mr.minutes_file_id = f.id
                      UNION ALL
                      SELECT 'Kompetenznachweis: ' || p.name || ', ' || s.name
                        FROM person_skill ps JOIN person p ON p.id = ps.person_id
                        JOIN skill s ON s.id = ps.skill_id WHERE ps.evidence_file_id = f.id
                      UNION ALL
                      SELECT 'Teilnahmebestätigung: ' || p.name || ', ' || t.title
                        FROM training_assignment ta JOIN person p ON p.id = ta.person_id
                        JOIN training t ON t.id = ta.training_id WHERE ta.evidence_file_id = f.id
                   ) x), 'ohne Bezug') AS bezug
          FROM file f WHERE f.tenant_id = ${tenantId}
          ORDER BY f.created_at`)
        ).rows as {
          id: string;
          storageKey: string;
          filename: string;
          mime: string;
          sizeBytes: number;
          sha256: string;
          createdAt: string;
          bezug: string;
        }[],
    );

    let missing = 0;
    const index: unknown[][] = [];
    for (const f of rows) {
      // Der Hash-Vorspann hält Dateien gleichen Namens auseinander und ist zugleich der Beleg,
      // dass die Datei unverändert ist.
      const name = `15-dateien/${f.sha256.slice(0, 8)}-${safeName(f.filename)}`;
      const present = await this.storage.exists(f.storageKey);
      if (present) archive.append(this.storage.stream(f.storageKey), { name });
      else missing += 1;
      index.push([
        present ? name.replace('15-dateien/', '') : '(Datei fehlt im Speicher)',
        f.filename,
        f.mime,
        f.sizeBytes,
        f.sha256,
        String(f.createdAt).slice(0, 10),
        f.bezug,
      ]);
    }
    archive.append(
      Buffer.from(
        toCsv(
          [
            'Datei im Paket',
            'Ursprünglicher Name',
            'Typ',
            'Größe (Bytes)',
            'SHA-256',
            'Hochgeladen am',
            'Bezug',
          ],
          index,
        ),
        'utf8',
      ),
      { name: '15-dateien/dateiverzeichnis.csv' },
    );
    return { total: rows.length, missing };
  }

  /** Spaltennamen kommen aus der Abfrage — so bleibt jedes Register eine einzige SQL-Anweisung. */
  private async runQuery(tenantId: string, query: ReturnType<typeof sql>) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const result = await tx.execute(query);
      const headers = result.fields.map((f) => f.name);
      const rows = (result.rows as Record<string, unknown>[]).map((r) => headers.map((h) => r[h]));
      return { headers, rows };
    });
  }

  private async tenantInfo(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const [t] = (await tx.execute(sql`SELECT name, slug FROM tenant WHERE id = ${tenantId}`)).rows as {
        name: string;
        slug: string;
      }[];
      const frameworks = (
        await tx.execute(sql`
          SELECT f.key, f.name, tf.is_primary AS "isPrimary"
          FROM tenant_framework tf JOIN framework f ON f.id = tf.framework_id
          WHERE tf.tenant_id = ${tenantId} ORDER BY tf.is_primary DESC, f.key`)
      ).rows as { key: string; name: string; isPrimary: boolean }[];
      return { name: t?.name ?? '', slug: t?.slug ?? 'mandant', frameworks };
    });
  }

  /** Das Deckblatt: was liegt im Paket, mit welchem Stand, und was liegt bewusst nicht darin. */
  private readme(
    tenant: { name: string; frameworks: { key: string; name: string; isPrimary: boolean }[] },
    summary: { folder: string; file: string; title: string; rows: number }[],
    files: { total: number; missing: number },
  ): string {
    const byFolder = new Map<string, typeof summary>();
    for (const s of summary) {
      const list = byFolder.get(s.folder) ?? [];
      list.push(s);
      byFolder.set(s.folder, list);
    }

    const sections = [...byFolder.entries()]
      .map(
        ([folder, entries]) =>
          `<h2>${escapeHtml(folder)}</h2>` +
          htmlTable(
            ['Datei', 'Inhalt', 'Einträge'],
            entries.map((e) => [`${e.file}.csv`, e.title, e.rows]),
          ),
      )
      .join('\n');

    const frameworks = htmlTable(
      ['Regelwerk', 'Bezeichnung', 'Rolle'],
      tenant.frameworks.map((f) => [f.key, f.name, f.isPrimary ? 'Hauptnorm' : 'aktiviert']),
    );

    return renderDocument(
      {
        title: 'Auditpaket',
        tenantName: tenant.name,
        subtitle: 'Vollständiger Datenbestand des Informationssicherheits-Managementsystems',
        note:
          'Alle Register als CSV (Semikolon getrennt, UTF-8 mit BOM, öffnet direkt in Excel und LibreOffice). ' +
          'Die Anwendbarkeitserklärung und das Verarbeitungsverzeichnis liegen zusätzlich als druckfertiges ' +
          'Dokument bei. Ordner 15 enthält die hinterlegten Nachweisdateien im Original; das Dateiverzeichnis ' +
          'nennt zu jeder Datei ihren SHA-256-Wert und den Vorgang, an dem sie hängt.',
      },
      `<h2>Aktivierte Regelwerke</h2>${frameworks}
       <h2>Nachweisdateien</h2>
       <p class="note">${files.total} Datei(en) im Ordner <code>15-dateien</code>${
         files.missing > 0
           ? `, davon ${files.missing} nicht im Speicher auffindbar (im Dateiverzeichnis vermerkt)`
           : ''
       }.</p>
       ${sections}
       <h2>Was nicht enthalten ist</h2>
       <p class="note">Kennwörter, Sitzungs- und Einladungstoken sowie interne Datenbankschlüssel sind
       nicht Teil des Pakets. Der Normtext der ISO/IEC 27001 fehlt aus urheberrechtlichen Gründen.
       Die Register führen Nummer und Kurztitel, wie es die DIN-Lizenz erlaubt.</p>`,
    );
  }
}

/**
 * Baut aus einer Übersetzungstabelle einen `CASE`-Ausdruck. So steht in der CSV „akzeptiert“
 * statt `accepted` — ein Paket, das einer Aufsichtsbehörde vorgelegt wird, soll nicht die
 * Enum-Werte des Datenmodells zeigen.
 *
 * Der Spaltenname ist ein Literal aus diesem Modul, nie eine Eingabe; die Werte gehen als
 * Parameter in die Abfrage.
 */
function label(column: string, map: Record<string, string>): SQL {
  const col = sql.raw(`${column}::text`);
  const cases = Object.entries(map).map(([k, v]) => sql`WHEN ${k} THEN ${v}`);
  return sql`CASE ${col} ${sql.join(cases, sql` `)} ELSE ${col} END`;
}

interface Register {
  folder: string;
  file: string;
  title: string;
  sql: (tenantId: string) => ReturnType<typeof sql>;
}

/**
 * Die Register des Pakets. Jedes ist genau eine Abfrage, deren Spaltennamen zugleich die
 * Kopfzeile der CSV-Datei sind — deshalb sind sie auf Deutsch benannt.
 *
 * Die Reihenfolge folgt der Gliederung der ISO 27001: erst der Kontext, dann die Register,
 * dann Betrieb, Prüfung und Verbesserung.
 */
const REGISTERS: Register[] = [
  {
    folder: '02-kontext',
    file: 'geltungsbereich',
    title: 'Geltungsbereich des ISMS (Kap. 4.3)',
    sql: (t) => sql`
      SELECT s.statement AS "Was dazugehört", s.interfaces AS "Schnittstellen und Abhängigkeiten",
             s.exclusions AS "Bewusst ausgenommen und warum", u.display_name AS "Zuletzt geändert durch",
             s.updated_at AS "Geändert am"
      FROM isms_scope s LEFT JOIN "user" u ON u.id = s.updated_by_user_id WHERE s.tenant_id = ${t}`,
  },
  {
    folder: '02-kontext',
    file: 'interessierte-parteien',
    title: 'Interessierte Parteien und ihre Erwartungen (Kap. 4.2)',
    sql: (t) => sql`
      SELECT name AS "Partei", ${label('category', PARTY_CATEGORY_LABEL)} AS "Kategorie",
             expectations AS "Erwartung",
             addressed_via AS "Adressiert über",
             CASE WHEN is_binding THEN 'ja' ELSE 'nein' END AS "Bindende Anforderung",
             influence AS "Einfluss (1-3)"
      FROM interested_party WHERE tenant_id = ${t} ORDER BY is_binding DESC, name`,
  },
  {
    folder: '02-kontext',
    file: 'pestle-faktoren',
    title: 'Externe und interne Themen (Kap. 4.1)',
    sql: (t) => sql`
      SELECT ${label('dimension', PESTLE_DIMENSION_LABEL)} AS "Dimension", title AS "Thema", description AS "Beschreibung",
             ${label('effect', PESTLE_EFFECT_LABEL)} AS "Wirkung", relevance AS "Relevanz (1-3)"
      FROM pestle_factor WHERE tenant_id = ${t} ORDER BY relevance DESC, dimension`,
  },
  {
    folder: '02-kontext',
    file: 'sicherheitsziele',
    title: 'Informationssicherheitsziele (Kap. 6.2)',
    sql: (t) => sql`
      SELECT o.title AS "Ziel", o.description AS "Beschreibung", ${label('o.kind', OBJECTIVE_KIND_LABEL)} AS "Art",
             ${label('o.status', OBJECTIVE_STATUS_LABEL)} AS "Status", p.name AS "Verantwortlich",
             o.target_value AS "Zielwert", o.current_value AS "Aktueller Wert", o.unit AS "Einheit",
             CASE o.direction::text WHEN 'lower_is_better' THEN 'kleiner ist besser' ELSE 'größer ist besser' END AS "Zielrichtung",
             o.frequency AS "Messfrequenz", o.due_date AS "Fällig am"
      FROM security_objective o LEFT JOIN person p ON p.id = o.owner_person_id
      WHERE o.tenant_id = ${t} ORDER BY o.due_date NULLS LAST, o.title`,
  },
  {
    folder: '02-kontext',
    file: 'kommunikationsplan',
    title: 'Kommunikation zur Informationssicherheit (Kap. 7.4)',
    sql: (t) => sql`
      SELECT c.topic AS "Worüber", c.audience AS "Mit wem", c.channel AS "Wie",
             c.frequency AS "Wann", p.name AS "Verantwortlich", c.clause_ref AS "Normbezug"
      FROM communication_plan_entry c LEFT JOIN person p ON p.id = c.responsible_person_id
      WHERE c.tenant_id = ${t} ORDER BY c.topic`,
  },
  {
    folder: '02-kontext',
    file: 'aenderungsplanung',
    title: 'Geplante Änderungen am ISMS (Kap. 6.3)',
    sql: (t) => sql`
      SELECT ch.title AS "Änderung", ch.purpose AS "Zweck und Anlass",
             ch.impact_assessment AS "Auswirkung auf das ISMS",
             ${label('ch.status', CHANGE_PLAN_STATUS_LABEL)} AS "Status",
             ch.planned_for AS "Geplant für", cu.display_name AS "Geplant durch",
             au.display_name AS "Freigegeben durch", ch.approved_at AS "Freigegeben am"
      FROM change_plan_entry ch
      LEFT JOIN "user" cu ON cu.id = ch.created_by_user_id
      LEFT JOIN "user" au ON au.id = ch.approved_by_user_id
      WHERE ch.tenant_id = ${t} ORDER BY ch.planned_for NULLS LAST, ch.title`,
  },
  {
    folder: '03-assets',
    file: 'asset-inventar',
    title: 'Inventar der Werte (A.5.9)',
    sql: (t) => sql`
      SELECT a.ref_no AS "Nr.", a.name AS "Asset", ${label('a.type', ASSET_TYPE_LABEL)} AS "Typ", ${label('a.category', ASSET_CATEGORY_LABEL)} AS "Kategorie",
             ${label('a.classification', CLASSIFICATION_LABEL)} AS "Einstufung",
             a.confidentiality AS "Vertraulichkeit", a.integrity AS "Integrität",
             a.availability AS "Verfügbarkeit", a.safety AS "Safety",
             CASE WHEN a.has_pii THEN 'ja' ELSE 'nein' END AS "Personenbezug",
             o.name AS "Owner", c.name AS "Betreuung", a.vendor AS "Hersteller", a.product AS "Produkt",
             a.version AS "Version", array_to_string(a.tags, ', ') AS "Schlagworte",
             ${label('a.status', ASSET_STATUS_LABEL)} AS "Status", a.description AS "Beschreibung"
      FROM asset a
      LEFT JOIN person o ON o.id = a.owner_person_id
      LEFT JOIN person c ON c.id = a.custodian_person_id
      WHERE a.tenant_id = ${t} ORDER BY a.ref_no`,
  },
  {
    folder: '04-risiken',
    file: 'risikokriterien',
    title: 'Kriterien der Risikobeurteilung und Risikoakzeptanz (Kap. 6.1.2 a)',
    sql: (t) => sql`
      SELECT likelihood_labels->>0 || ', ' || (likelihood_labels->>1) || ', ' || (likelihood_labels->>2) || ', '
               || (likelihood_labels->>3) || ', ' || (likelihood_labels->>4) AS "Stufen Wahrscheinlichkeit (1 bis 5)",
             impact_labels->>0 || ', ' || (impact_labels->>1) || ', ' || (impact_labels->>2) || ', '
               || (impact_labels->>3) || ', ' || (impact_labels->>4) AS "Stufen Auswirkung (1 bis 5)",
             'bis ' || (thresholds->>'low') AS "Niedrig (Punkte)",
             'bis ' || (thresholds->>'medium') AS "Mittel (Punkte)",
             'bis ' || (thresholds->>'high') AS "Hoch (Punkte)",
             'über ' || (thresholds->>'high') AS "Kritisch (Punkte)",
             coalesce(appetite, (thresholds->>'high')::int) AS "Tragbar ohne weitere Maßnahme bis (Punkte)",
             updated_at AS "Festgelegt am"
      FROM risk_matrix_config WHERE tenant_id = ${t}`,
  },
  {
    folder: '04-risiken',
    file: 'risikoregister',
    title: 'Risiken mit Bewertung und Behandlung (Kap. 6.1.2, 6.1.3, 8.2)',
    sql: (t) => sql`
      SELECT r.ref_no AS "Nr.", r.title AS "Risiko", r.description AS "Beschreibung",
             ${label('r.kind', RISK_KIND_LABEL)} AS "Art", r.category AS "Kategorie",
             ${label('r.source', RISK_SOURCE_LABEL)} AS "Herkunft",
             p.name AS "Risk-Owner", ${label('r.status', RISK_STATUS_LABEL)} AS "Status",
             ${label('r.treatment', RISK_TREATMENT_LABEL)} AS "Behandlung",
             r.likelihood AS "Wahrscheinlichkeit (1 bis 5)", r.impact AS "Auswirkung (1 bis 5)",
             r.score AS "Risiko heute (1 bis 25)",
             r.accepted_at AS "Akzeptiert am", u.display_name AS "Akzeptiert durch",
             r.accepted_until AS "Akzeptanz gültig bis", r.acceptance_rationale AS "Begründung der Akzeptanz",
             r.next_review_at AS "Nächste Überprüfung",
             (SELECT string_agg(a.ref_no || ' ' || a.name, ' | ' ORDER BY a.ref_no)
              FROM risk_asset ra JOIN asset a ON a.id = ra.asset_id WHERE ra.risk_id = r.id) AS "Betroffene Assets",
             (SELECT string_agg(m.ref_no || ' ' || m.title, ' | ' ORDER BY m.ref_no)
              FROM risk_measure rm JOIN measure m ON m.id = rm.measure_id WHERE rm.risk_id = r.id) AS "Maßnahmen"
      FROM risk r
      LEFT JOIN person p ON p.id = r.owner_person_id
      LEFT JOIN "user" u ON u.id = r.accepted_by_user_id
      WHERE r.tenant_id = ${t} ORDER BY r.score DESC NULLS LAST, r.ref_no`,
  },
  {
    folder: '05-massnahmen',
    file: 'massnahmenregister',
    title: 'Maßnahmen mit Umsetzungsstand und Reifegrad',
    sql: (t) => sql`
      SELECT m.ref_no AS "Nr.", m.title AS "Maßnahme", m.description AS "Beschreibung",
             ${label('m.domain', CONTROL_DOMAIN_LABEL)} AS "Themenfeld", p.name AS "Verantwortlich",
             ${label('m.status', MEASURE_STATUS_LABEL)} AS "Status",
             m.maturity AS "Reifegrad (0-5)", m.due_date AS "Fällig am",
             m.effort_days AS "Aufwand (Tage)", m.cost_eur AS "Kosten (EUR)",
             v.display_name AS "Verifiziert durch", m.verified_at AS "Verifiziert am",
             (SELECT count(*)::int FROM measure_requirement mr WHERE mr.measure_id = m.id) AS "Erfüllte Anforderungen"
      FROM measure m
      LEFT JOIN person p ON p.id = m.owner_person_id
      LEFT JOIN "user" v ON v.id = m.verified_by_user_id
      WHERE m.tenant_id = ${t} ORDER BY m.ref_no`,
  },
  {
    folder: '05-massnahmen',
    file: 'normzuordnung',
    title: 'Welche Maßnahme welche Anforderung erfüllt, über alle Regelwerke',
    sql: (t) => sql`
      SELECT m.ref_no AS "Maßnahme Nr.", m.title AS "Maßnahme", f.key AS "Regelwerk",
             r.ref_code AS "Anforderung", r.title AS "Titel der Anforderung",
             ${label('mr.coverage', COVERAGE_LABEL)} AS "Abdeckung",
             ${label('mr.created_via', MAPPING_ORIGIN_LABEL)} AS "Zugeordnet über"
      FROM measure_requirement mr
      JOIN measure m ON m.id = mr.measure_id
      JOIN requirement r ON r.id = mr.requirement_id
      JOIN framework f ON f.id = r.framework_id
      WHERE mr.tenant_id = ${t} ORDER BY m.ref_no, f.key, r.sort_order`,
  },
  {
    folder: '06-dokumente',
    file: 'dokumentenlenkung',
    title: 'Dokumente, Fassungen und Freigaben (Kap. 7.5)',
    sql: (t) => sql`
      SELECT d.key AS "Kürzel", d.title AS "Dokument", ${label('d.kind', DOCUMENT_KIND_LABEL)} AS "Art",
             ${label('d.classification', CLASSIFICATION_LABEL)} AS "Einstufung", p.name AS "Verantwortlich",
             ${label('d.status', DOCUMENT_STATUS_LABEL)} AS "Status", v.version_label AS "Gültige Fassung",
             au.display_name AS "Autor", ap.display_name AS "Freigegeben durch",
             v.approved_at AS "Freigegeben am", v.published_at AS "Veröffentlicht am",
             d.review_interval_months AS "Prüfintervall (Monate)", d.next_review_at AS "Nächste Prüfung",
             fl.filename AS "Hinterlegte Datei"
      FROM document d
      LEFT JOIN document_version v ON v.id = d.current_version_id
      LEFT JOIN person p ON p.id = d.owner_person_id
      LEFT JOIN "user" au ON au.id = v.author_user_id
      LEFT JOIN "user" ap ON ap.id = v.approved_by_user_id
      LEFT JOIN file fl ON fl.id = v.file_id
      WHERE d.tenant_id = ${t} ORDER BY d.key`,
  },
  {
    folder: '06-dokumente',
    file: 'lesebestaetigungen',
    title: 'Angeforderte und erteilte Kenntnisnahmen (Kap. 7.3)',
    sql: (t) => sql`
      SELECT d.key AS "Dokument", v.version_label AS "Fassung", c.subject AS "Betreff",
             c.due_at AS "Frist", p.name AS "Person", p.department AS "Abteilung",
             ack.sent_at AS "Angefordert am", ack.acknowledged_at AS "Bestätigt am",
             CASE WHEN ack.acknowledged_at IS NOT NULL THEN 'bestätigt'
                  WHEN c.due_at < current_date THEN 'überfällig' ELSE 'offen' END AS "Stand"
      FROM acknowledgement ack
      JOIN acknowledgement_campaign c ON c.id = ack.campaign_id
      JOIN document_version v ON v.id = c.document_version_id
      JOIN document d ON d.id = v.document_id
      JOIN person p ON p.id = ack.person_id
      WHERE ack.tenant_id = ${t} ORDER BY d.key, p.name`,
  },
  {
    folder: '07-nachweise',
    file: 'nachweisregister',
    title: 'Nachweise mit Gültigkeit (die Dateien liegen in Ordner 15)',
    sql: (t) => sql`
      SELECT e.title AS "Nachweis", e.description AS "Beschreibung", e.url AS "Verweis",
             f.filename AS "Datei", f.sha256 AS "SHA-256",
             e.collected_at AS "Erhoben am", e.valid_until AS "Gültig bis",
             CASE WHEN e.valid_until < current_date THEN 'abgelaufen' ELSE 'gültig' END AS "Stand",
             u.display_name AS "Erhoben durch",
             (SELECT string_agg(m.ref_no || ' ' || m.title, ' | ' ORDER BY m.ref_no)
              FROM measure_evidence me JOIN measure m ON m.id = me.measure_id
              WHERE me.evidence_id = e.id) AS "Belegt Maßnahmen",
             (SELECT string_agg(fi.ref_no || ' ' || fi.title, ' | ' ORDER BY fi.ref_no)
              FROM finding_evidence fe JOIN finding fi ON fi.id = fe.finding_id
              WHERE fe.evidence_id = e.id) AS "Belegt Feststellungen"
      FROM evidence e
      LEFT JOIN file f ON f.id = e.file_id
      LEFT JOIN "user" u ON u.id = e.collected_by_user_id
      WHERE e.tenant_id = ${t} ORDER BY e.collected_at DESC`,
  },
  {
    folder: '08-betrieb',
    file: 'sicherheitsvorfaelle',
    title: 'Sicherheitsvorfälle (A.5.24 bis A.5.28)',
    sql: (t) => sql`
      SELECT i.ref_no AS "Nr.", i.title AS "Vorfall", i.description AS "Beschreibung",
             ${label('i.category', INCIDENT_CATEGORY_LABEL)} AS "Kategorie",
             ${label('i.severity', SEVERITY_LABEL)} AS "Schwere", ${label('i.status', INCIDENT_STATUS_LABEL)} AS "Status",
             i.detected_at AS "Erkannt am", i.occurred_at AS "Eingetreten am",
             p.name AS "Bearbeitung", ${label('i.source', INCIDENT_SOURCE_LABEL)} AS "Herkunft",
             CASE WHEN i.is_personal_data_breach THEN 'ja' ELSE 'nein' END AS "Datenpanne",
             i.breach_confirmed_at AS "Datenpanne bestätigt am", i.affected_persons AS "Betroffene Personen",
             CASE WHEN i.nis2_significant_at IS NOT NULL THEN 'ja' ELSE 'nein' END AS "Erheblich nach NIS2",
             i.nis2_significant_at AS "Als erheblich eingestuft am",
             i.resolved_at AS "Behoben am", i.closed_at AS "Abgeschlossen am"
      FROM incident i LEFT JOIN person p ON p.id = i.handler_person_id
      WHERE i.tenant_id = ${t} ORDER BY i.detected_at DESC`,
  },
  {
    folder: '08-betrieb',
    file: 'meldefristen',
    title: 'Meldepflichten nach NIS2 und DSGVO mit Fristen und Erfüllung',
    sql: (t) => sql`
      SELECT i.ref_no AS "Vorfall Nr.", i.title AS "Vorfall", ${label('ro.regime', REPORTING_REGIME_LABEL)} AS "Meldepflicht",
             ro.authority AS "Adressat", ro.due_at AS "Frist", ro.fulfilled_at AS "Erfüllt am",
             CASE WHEN ro.fulfilled_at IS NOT NULL THEN 'erfüllt'
                  WHEN ro.due_at IS NULL THEN 'ohne gesetzliche Frist'
                  WHEN ro.due_at < now() THEN 'überfällig' ELSE 'offen' END AS "Stand",
             ro.reference AS "Aktenzeichen", ro.note AS "Rechtsgrundlage"
      FROM reporting_obligation ro JOIN incident i ON i.id = ro.incident_id
      WHERE ro.tenant_id = ${t} ORDER BY ro.due_at NULLS LAST`,
  },
  {
    folder: '08-betrieb',
    file: 'geschaeftsprozesse-bia',
    title: 'Business-Impact-Analyse je Geschäftsprozess (A.5.29, A.5.30)',
    sql: (t) => sql`
      SELECT bp.name AS "Prozess", bp.department AS "Bereich", p.name AS "Prozessverantwortung",
             bp.tier AS "Stufe (1=kritisch)", b.mtpd_hours AS "MTPD (h)", b.rto_hours AS "RTO (h)",
             b.rpo_hours AS "RPO (h)", b.mbco AS "Mindestbetriebsniveau", ${label('b.status', BIA_STATUS_LABEL)} AS "Status der BIA",
             u.display_name AS "Freigegeben durch", b.approved_at AS "Freigegeben am",
             (SELECT string_agg(bi.dimension::text || ' ' || bi.horizon || ': ' || bi.score, ' | '
                                ORDER BY bi.horizon, bi.dimension)
              FROM bia_impact bi WHERE bi.bia_id = b.id) AS "Auswirkungsraster"
      FROM business_process bp
      LEFT JOIN bia b ON b.process_id = bp.id
      LEFT JOIN person p ON p.id = bp.owner_person_id
      LEFT JOIN "user" u ON u.id = b.approved_by_user_id
      WHERE bp.tenant_id = ${t} ORDER BY bp.tier NULLS LAST, bp.name`,
  },
  {
    folder: '08-betrieb',
    file: 'notfallplaene-uebungen',
    title: 'Notfallpläne und durchgeführte Übungen',
    sql: (t) => sql`
      SELECT cp.title AS "Plan", bp.name AS "Für Prozess", ${label('cp.status', PLAN_STATUS_LABEL)} AS "Status",
             cp.activation_criteria AS "Auslösekriterien", cp.strategy AS "Strategie",
             cp.test_interval_months AS "Übungsintervall (Monate)",
             cp.last_test_at AS "Letzte Übung", cp.next_test_at AS "Nächste Übung fällig",
             (SELECT count(*)::int FROM continuity_plan_step cs WHERE cs.plan_id = cp.id) AS "Schritte",
             (SELECT string_agg(e.held_at::text || ' (' || e.kind::text || '): ' || COALESCE(e.result, ''), ' | '
                                ORDER BY e.held_at DESC)
              FROM bc_exercise e WHERE e.plan_id = cp.id) AS "Übungen"
      FROM continuity_plan cp
      JOIN bia b ON b.id = cp.bia_id
      JOIN business_process bp ON bp.id = b.process_id
      WHERE cp.tenant_id = ${t} ORDER BY cp.title`,
  },
  {
    folder: '09-datenschutz',
    file: 'verarbeitungsverzeichnis',
    title: 'Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO)',
    sql: (t) => sql`
      SELECT pa.name AS "Verarbeitung", pa.purpose AS "Zweck", ${label('pa.role', PROCESSING_ROLE_LABEL)} AS "Rolle",
             ${label('pa.legal_basis', LEGAL_BASIS_LABEL)} AS "Rechtsgrundlage", pa.legal_basis_note AS "Anmerkung zur Rechtsgrundlage",
             array_to_string(pa.data_subject_categories, ', ') AS "Betroffene Personen",
             array_to_string(pa.data_categories, ', ') AS "Datenkategorien",
             CASE WHEN pa.special_categories THEN 'ja' ELSE 'nein' END AS "Besondere Kategorien (Art. 9)",
             array_to_string(pa.recipients, ', ') AS "Empfänger",
             CASE WHEN pa.third_country_transfer THEN 'ja' ELSE 'nein' END AS "Drittlandübermittlung",
             pa.safeguards AS "Garantien nach Kapitel V", pa.retention AS "Löschfrist",
             CASE WHEN pa.dpia_required THEN 'ja' ELSE 'nein' END AS "DSFA erforderlich",
             ${label('pa.status', PROCESSING_STATUS_LABEL)} AS "Status", p.name AS "Verantwortlich",
             (SELECT string_agg(m.ref_no || ' ' || m.title, ' | ' ORDER BY m.ref_no)
              FROM processing_tom pt JOIN measure m ON m.id = pt.measure_id
              WHERE pt.processing_activity_id = pa.id) AS "TOM nach Art. 32"
      FROM processing_activity pa LEFT JOIN person p ON p.id = pa.owner_person_id
      WHERE pa.tenant_id = ${t} ORDER BY pa.name`,
  },
  {
    folder: '09-datenschutz',
    file: 'folgenabschaetzungen',
    title: 'Datenschutz-Folgenabschätzungen (Art. 35 DSGVO)',
    sql: (t) => sql`
      SELECT pa.name AS "Verarbeitung", ${label('d.status', DPIA_STATUS_LABEL)} AS "Status", ${label('d.result', DPIA_RESULT_LABEL)} AS "Ergebnis",
             d.description_of_processing AS "Beschreibung der Verarbeitung",
             d.necessity_assessment AS "Notwendigkeit und Verhältnismäßigkeit",
             d.risks::text AS "Risiken für die Rechte und Freiheiten",
             d.dpo_opinion AS "Rat der oder des Datenschutzbeauftragten",
             u.display_name AS "Rat erteilt durch", d.dpo_consulted_at AS "Rat erteilt am"
      FROM dpia d
      JOIN processing_activity pa ON pa.id = d.processing_activity_id
      LEFT JOIN "user" u ON u.id = d.dpo_user_id
      WHERE d.tenant_id = ${t} ORDER BY pa.name`,
  },
  {
    folder: '09-datenschutz',
    file: 'ki-register',
    title: 'KI-Register: eingesetzte KI-Systeme, nur Pflichten als Betreiber (AI Act Art. 26)',
    sql: (t) => sql`
      SELECT s.ref_no AS "Nr.", s.name AS "KI-System", s.purpose AS "Einsatzzweck", s.provider_name AS "Anbieter",
             ${label('s.risk_class', AI_RISK_CLASS_LABEL)} AS "Einstufung",
             ${label('s.annex_iii_area', AI_ANNEX_III_LABEL)} AS "Bereich nach Anhang III",
             CASE WHEN s.art6_exception THEN s.art6_justification END AS "Ausnahme nach Art. 6 Abs. 3",
             ${label('s.status', AI_SYSTEM_STATUS_LABEL)} AS "Status",
             o.name AS "Verantwortlich", v.name AS "Menschliche Aufsicht",
             CASE WHEN s.instructions_received THEN 'ja' ELSE 'nein' END AS "Betriebsanleitung liegt vor",
             s.log_retention_months AS "Protokollaufbewahrung (Monate)",
             s.workers_informed_at AS "Beschäftigte informiert am",
             CASE WHEN s.fria_required THEN 'ja' ELSE 'nein' END AS "Grundrechte-Folgenabschätzung nötig",
             s.fria_completed_at AS "Grundrechte-Folgenabschätzung am",
             pa.name AS "Verarbeitungstätigkeit"
      FROM ai_system s
      LEFT JOIN person o ON o.id = s.owner_person_id
      LEFT JOIN person v ON v.id = s.oversight_person_id
      LEFT JOIN processing_activity pa ON pa.id = s.processing_activity_id
      WHERE s.tenant_id = ${t} ORDER BY s.ref_no`,
  },
  {
    folder: '10-audit-kvp',
    file: 'auditprogramm',
    title: 'Interne und externe Audits (Kap. 9.2)',
    sql: (t) => sql`
      SELECT a.ref_no AS "Nr.", a.title AS "Audit", ${label('a.kind', AUDIT_KIND_LABEL)} AS "Art", f.key AS "Regelwerk",
             a.scope AS "Umfang", a.planned_from AS "Geplant von", a.planned_to AS "Geplant bis",
             u.display_name AS "Leitende Auditperson", ${label('a.status', AUDIT_STATUS_LABEL)} AS "Status",
             fl.filename AS "Auditbericht",
             (SELECT count(*)::int FROM audit_requirement ar WHERE ar.audit_id = a.id) AS "Geprüfte Anforderungen",
             (SELECT count(*)::int FROM finding fi WHERE fi.audit_id = a.id) AS "Feststellungen"
      FROM "audit" a
      LEFT JOIN framework f ON f.id = a.framework_id
      LEFT JOIN "user" u ON u.id = a.lead_auditor_user_id
      LEFT JOIN file fl ON fl.id = a.report_file_id
      WHERE a.tenant_id = ${t} ORDER BY a.planned_from DESC NULLS LAST`,
  },
  {
    folder: '10-audit-kvp',
    file: 'feststellungen',
    title: 'Feststellungen und Nichtkonformitäten (Kap. 10.2)',
    sql: (t) => sql`
      SELECT fi.ref_no AS "Nr.", fi.title AS "Feststellung", fi.description AS "Beschreibung",
             ${label('fi.severity', FINDING_SEVERITY_LABEL)} AS "Schwere",
             ${label('fi.source', FINDING_SOURCE_LABEL)} AS "Herkunft", a.ref_no AS "Aus Audit",
             fw.key AS "Regelwerk", r.ref_code AS "Betroffene Anforderung",
             m.ref_no AS "Betroffene Maßnahme", ${label('fi.status', FINDING_STATUS_LABEL)} AS "Status", fi.due_at AS "Frist",
             fi.closed_at AS "Geschlossen am", u.display_name AS "Schließung bestätigt durch",
             fi.verified_at AS "Bestätigt am",
             (SELECT count(*)::int FROM "action" ac WHERE ac.finding_id = fi.id) AS "Korrekturmaßnahmen"
      FROM finding fi
      LEFT JOIN "audit" a ON a.id = fi.audit_id
      LEFT JOIN requirement r ON r.id = fi.requirement_id
      LEFT JOIN framework fw ON fw.id = r.framework_id
      LEFT JOIN measure m ON m.id = fi.measure_id
      LEFT JOIN "user" u ON u.id = fi.verified_by_user_id
      WHERE fi.tenant_id = ${t} ORDER BY fi.severity DESC, fi.ref_no`,
  },
  {
    folder: '10-audit-kvp',
    file: 'verbesserungsmassnahmen',
    title: 'Korrektur- und Verbesserungsmaßnahmen (Kap. 10)',
    sql: (t) => sql`
      SELECT ac.ref_no AS "Nr.", ac.title AS "Maßnahme", ac.description AS "Beschreibung",
             ${label('ac.kind', ACTION_KIND_LABEL)} AS "Art", p.name AS "Verantwortlich",
             ${label('ac.status', ACTION_STATUS_LABEL)} AS "Status",
             ac.due_at AS "Frist", ac.completed_at AS "Erledigt am",
             fi.ref_no AS "Aus Feststellung", r.ref_no AS "Aus Risiko", i.ref_no AS "Aus Vorfall",
             mr.held_at AS "Aus Managementbewertung vom",
             ac.effectiveness_check_at AS "Wirksamkeit geprüft am", ac.effectiveness_result AS "Ergebnis der Wirksamkeitsprüfung",
             u.display_name AS "Verifiziert durch"
      FROM "action" ac
      LEFT JOIN person p ON p.id = ac.owner_person_id
      LEFT JOIN finding fi ON fi.id = ac.finding_id
      LEFT JOIN risk r ON r.id = ac.risk_id
      LEFT JOIN incident i ON i.id = ac.incident_id
      LEFT JOIN management_review mr ON mr.id = ac.review_id
      LEFT JOIN "user" u ON u.id = ac.verified_by_user_id
      WHERE ac.tenant_id = ${t} ORDER BY ac.due_at NULLS LAST, ac.ref_no`,
  },
  {
    folder: '10-audit-kvp',
    file: 'kennzahlen',
    title: 'Kennzahlen mit Verlauf (Kap. 9.1)',
    sql: (t) => sql`
      SELECT k.name AS "Kennzahl", k.unit AS "Einheit", k.target AS "Zielwert",
             CASE k.direction::text WHEN 'lower_is_better' THEN 'kleiner ist besser' ELSE 'größer ist besser' END AS "Zielrichtung",
             CASE k.source::text WHEN 'computed' THEN 'aus dem ISMS berechnet' ELSE 'manuell erfasst' END AS "Herkunft",
             k.frequency AS "Frequenz", p.name AS "Verantwortlich",
             (SELECT string_agg(v.measured_at::text || ': ' || v.value, ' | ' ORDER BY v.measured_at DESC)
              FROM kpi_value v WHERE v.kpi_id = k.id) AS "Messwerte"
      FROM kpi k LEFT JOIN person p ON p.id = k.owner_person_id
      WHERE k.tenant_id = ${t} ORDER BY k.name`,
  },
  {
    folder: '10-audit-kvp',
    file: 'managementbewertungen',
    title: 'Managementbewertungen mit eingefrorenen Eingaben (Kap. 9.3)',
    sql: (t) => sql`
      SELECT mr.held_at AS "Sitzung am", p.name AS "Leitung", mr.status::text AS "Status",
             mr.decisions AS "Beschlüsse", f.filename AS "Protokoll",
             mr.inputs::text AS "Eingaben nach Kap. 9.3.2 (eingefroren)"
      FROM management_review mr
      LEFT JOIN person p ON p.id = mr.chair_person_id
      LEFT JOIN file f ON f.id = mr.minutes_file_id
      WHERE mr.tenant_id = ${t} ORDER BY mr.held_at DESC`,
  },
  {
    folder: '11-kompetenz',
    file: 'kompetenzmatrix',
    title: 'Ist-Kompetenzen je Person (Kap. 7.2)',
    sql: (t) => sql`
      SELECT p.name AS "Person", p.department AS "Abteilung", p.position AS "Funktion",
             s.name AS "Fähigkeit", ps.level AS "Stufe (1-5)", ps.evidence_note AS "Nachweis",
             f.filename AS "Zertifikat", ps.valid_until AS "Gültig bis",
             CASE WHEN ps.valid_until < current_date THEN 'abgelaufen' ELSE 'gültig' END AS "Stand"
      FROM person_skill ps
      JOIN person p ON p.id = ps.person_id
      JOIN skill s ON s.id = ps.skill_id
      LEFT JOIN file f ON f.id = ps.evidence_file_id
      WHERE ps.tenant_id = ${t} ORDER BY p.name, s.name`,
  },
  {
    folder: '11-kompetenz',
    file: 'kompetenzluecken',
    title: 'Soll-Ist-Abgleich gegen die Kompetenzprofile',
    sql: (t) => sql`
      SELECT p.name AS "Person", cp.name AS "Profil", s.name AS "Fähigkeit",
             g.min_level AS "Geforderte Stufe", g.actual_level AS "Erreichte Stufe", g.gap AS "Lücke"
      FROM v_skill_gap g
      JOIN person p ON p.id = g.person_id
      JOIN competence_profile cp ON cp.id = g.profile_id
      JOIN skill s ON s.id = g.skill_id
      WHERE s.tenant_id = ${t} ORDER BY g.gap DESC, p.name`,
  },
  {
    folder: '11-kompetenz',
    file: 'schulungen',
    title: 'Schulungen und Teilnahmen (Kap. 7.3)',
    sql: (t) => sql`
      SELECT tr.title AS "Schulung", ${label('tr.kind', TRAINING_KIND_LABEL)} AS "Art", p.name AS "Person",
             p.department AS "Abteilung", ta.due_at AS "Fällig am", ta.completed_at AS "Teilgenommen am",
             ta.score AS "Ergebnis (%)", f.filename AS "Teilnahmebestätigung",
             CASE WHEN ta.completed_at IS NOT NULL THEN 'abgeschlossen'
                  WHEN ta.due_at < current_date THEN 'überfällig' ELSE 'offen' END AS "Stand"
      FROM training_assignment ta
      JOIN training tr ON tr.id = ta.training_id
      JOIN person p ON p.id = ta.person_id
      LEFT JOIN file f ON f.id = ta.evidence_file_id
      WHERE ta.tenant_id = ${t} ORDER BY tr.title, p.name`,
  },
  {
    folder: '12-organisation',
    file: 'organigramm',
    title: 'Rollen, Zuständigkeiten und Befugnisse (Kap. 5.3)',
    sql: (t) => sql`
      WITH RECURSIVE baum AS (
        SELECT o.id, o.parent_id, o.label, o.kind, o.person_id, o.sort_order,
               o.label::text AS pfad, 0 AS ebene
        FROM org_unit o WHERE o.tenant_id = ${t} AND o.parent_id IS NULL
        UNION ALL
        SELECT o.id, o.parent_id, o.label, o.kind, o.person_id, o.sort_order,
               b.pfad || ' / ' || o.label, b.ebene + 1
        FROM org_unit o JOIN baum b ON b.id = o.parent_id WHERE o.tenant_id = ${t}
      )
      SELECT b.pfad AS "Pfad", b.ebene AS "Ebene", b.label AS "Bezeichnung",
             ${label('b.kind', ORG_NODE_KIND_LABEL)} AS "Art", p.name AS "Besetzt durch",
             p.department AS "Abteilung", p.position AS "Funktion"
      FROM baum b LEFT JOIN person p ON p.id = b.person_id
      ORDER BY b.pfad`,
  },
  {
    folder: '12-organisation',
    file: 'beschaeftigte',
    title: 'Personen, denen Verantwortung zugewiesen ist',
    sql: (t) => sql`
      SELECT p.name AS "Name", p.email AS "E-Mail", p.department AS "Abteilung", p.position AS "Funktion",
             CASE WHEN p.is_active THEN 'aktiv' ELSE 'deaktiviert' END AS "Status",
             CASE WHEN p.user_id IS NOT NULL THEN 'ja' ELSE 'nein' END AS "Hat Zugang zur Anwendung",
             (SELECT count(*)::int FROM asset a WHERE a.owner_person_id = p.id) AS "Assets",
             (SELECT count(*)::int FROM risk r WHERE r.owner_person_id = p.id) AS "Risiken",
             (SELECT count(*)::int FROM measure m WHERE m.owner_person_id = p.id) AS "Maßnahmen"
      FROM person p WHERE p.tenant_id = ${t} ORDER BY p.name`,
  },
  {
    folder: '12-organisation',
    file: 'rollenzuweisungen',
    title: 'Wer welche Rolle im ISMS hat (Funktionstrennung)',
    sql: (t) => sql`
      SELECT u.display_name AS "Name", u.email AS "E-Mail", ${label('m.status', MEMBERSHIP_STATUS_LABEL)} AS "Status der Mitgliedschaft",
             (SELECT string_agg(r.name, ', ' ORDER BY r.name)
              FROM membership_role mrole JOIN role r ON r.id = mrole.role_id
              WHERE mrole.membership_id = m.id) AS "Rollen",
             m.created_at AS "Mitglied seit"
      FROM tenant_membership m JOIN "user" u ON u.id = m.user_id
      WHERE m.tenant_id = ${t} ORDER BY u.display_name`,
  },
  {
    folder: '13-wiedervorlage',
    file: 'offene-fristen',
    title: 'Alles, was zum Zeitpunkt der Ausleitung offen oder überfällig war',
    sql: (t) => sql`
      SELECT 'Maßnahme' AS "Art", m.ref_no AS "Nr.", m.title AS "Vorgang", p.name AS "Verantwortlich",
             m.due_date AS "Fällig am", (m.due_date - current_date) AS "Tage bis zur Frist"
      FROM measure m LEFT JOIN person p ON p.id = m.owner_person_id
      WHERE m.tenant_id = ${t} AND m.due_date IS NOT NULL
        AND m.status NOT IN ('implemented','verified','not_applicable')
      UNION ALL
      SELECT 'KVP-Maßnahme', ac.ref_no, ac.title, p.name, ac.due_at, (ac.due_at - current_date)
      FROM "action" ac LEFT JOIN person p ON p.id = ac.owner_person_id
      WHERE ac.tenant_id = ${t} AND ac.due_at IS NOT NULL AND ac.status IN ('open','in_progress')
      UNION ALL
      SELECT 'Feststellung', fi.ref_no, fi.title, NULL, fi.due_at, (fi.due_at - current_date)
      FROM finding fi WHERE fi.tenant_id = ${t} AND fi.due_at IS NOT NULL
        AND fi.status IN ('open','in_progress')
      UNION ALL
      SELECT 'Dokumentenprüfung', d.key, d.title, p.name, d.next_review_at, (d.next_review_at - current_date)
      FROM document d LEFT JOIN person p ON p.id = d.owner_person_id
      WHERE d.tenant_id = ${t} AND d.next_review_at IS NOT NULL AND d.status <> 'retired'
      UNION ALL
      SELECT 'Notfallübung', NULL, cp.title, NULL, cp.next_test_at, (cp.next_test_at - current_date)
      FROM continuity_plan cp WHERE cp.tenant_id = ${t} AND cp.next_test_at IS NOT NULL
      ORDER BY 5 NULLS LAST`,
  },
  {
    folder: '14-protokoll',
    file: 'aenderungsprotokoll',
    title: 'Änderungen, Anmeldungen und Ausleitungen der letzten zwölf Monate',
    sql: (t) => sql`
      SELECT l.at AS "Zeitpunkt", u.display_name AS "Person", ${label('l.action', AUDIT_LOG_ACTION_LABEL)} AS "Vorgang",
             l.entity_type AS "Gegenstand", l.entity_id AS "Datensatz", l.ip AS "Herkunft"
      FROM audit_log l LEFT JOIN "user" u ON u.id = l.actor_user_id
      WHERE l.tenant_id = ${t} AND l.at > now() - interval '12 months'
      ORDER BY l.at DESC`,
  },
];

/** Dateinamen aus Mandantendaten dürfen den Paketaufbau nicht verlassen. */
function safeName(filename: string): string {
  return filename.replace(/[/\\]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'datei';
}
