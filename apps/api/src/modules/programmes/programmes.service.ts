import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../../kernel/db/db.service';
import { AiSystemsService } from '../ai/ai-systems.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { CoverageMapService } from '../soa/coverage-map.service';

export type ProgrammeKey = 'ISO27001' | 'NIS2' | 'EU_AI_ACT';

export interface ProgrammeStep {
  key: string;
  title: string;
  done: boolean;
  /** Ein Satz Stand, aus den Daten: „71 von 93 Controls entschieden“. */
  detail: string;
  /** Was als Nächstes zu tun ist, solange der Schritt offen ist. */
  action: string;
  to: string;
}

export interface Programme {
  key: ProgrammeKey;
  name: string;
  active: boolean;
  score: { value: number; of: number; unit: 'pct' | 'count'; label: string };
  steps: ProgrammeStep[];
  /** Der erste offene Schritt; null, wenn alle erledigt sind. */
  current: string | null;
  /** `urgent`: geht dem Weg vor, etwa eine laufende Meldefrist. */
  next: { title: string; to: string; urgent?: boolean } | null;
}

export interface DerivedTask {
  key: string;
  title: string;
  count: number;
  to: string;
}

const IMPLEMENTED = ['covered'];

/**
 * Die drei Programme der Suite, ISO 27001, NIS2 und EU AI Act, als Weg mit Schritten. Jeder Schritt
 * ist eine Abfrage auf Daten, die ohnehin gepflegt werden: Zertifizierungsreife, Cockpit, KI-Register.
 * Es gibt keine Phase, die jemand von Hand setzt, und keine Zahl, die sich nicht aufklappen lässt;
 * jeder Schritt verlinkt die Ansicht, aus der er stammt.
 */
@Injectable()
export class ProgrammesService {
  constructor(
    private readonly dbs: DbService,
    private readonly dashboard: DashboardService,
    private readonly coverage: CoverageMapService,
    private readonly ai: AiSystemsService,
  ) {}

  async list(tenantId: string): Promise<Programme[]> {
    const active = await this.activeFrameworks(tenantId);
    return [
      active.has('ISO27001') ? await this.iso(tenantId) : inactive('ISO27001'),
      active.has('NIS2') ? await this.nis2(tenantId) : inactive('NIS2'),
      active.has('EU_AI_ACT') ? await this.aiAct(tenantId) : inactive('EU_AI_ACT'),
    ];
  }

  private async iso(tenantId: string): Promise<Programme> {
    const r = await this.dashboard.certificationReadiness(tenantId);
    const evidence = new Map<string, boolean>(r.evidence.map((e) => [e.key, e.ok]));
    const has = (key: string) => evidence.get(key) === true;
    const ev = {
      scope: has('scope'),
      interestedParties: has('interestedParties'),
      riskTreatment: has('riskTreatment'),
      internalAudit: has('internalAudit'),
      managementReview: has('managementReview'),
    };
    const controls = (
      await this.dbs.tenant(tenantId, (tx) =>
        tx.execute(sql`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE EXISTS (
                     SELECT 1 FROM tenant_requirement tr WHERE tr.tenant_id = ${tenantId}
                       AND tr.requirement_id = v.id AND tr.applicability = 'not_applicable')
                   OR EXISTS (
                     SELECT 1 FROM measure_requirement mr WHERE mr.tenant_id = ${tenantId}
                       AND mr.requirement_id = v.id))::int AS decided
          FROM v_assessable_requirement v
          JOIN framework f ON f.id = v.framework_id AND f.key = 'ISO27001'
          WHERE v.kind = 'control'`),
      )
    ).rows[0] as { total: number; decided: number };
    const done = r.fulfilled + r.notApplicable;

    const steps: ProgrammeStep[] = [
      {
        key: 'context',
        title: 'Geltungsbereich und Kontext',
        done: ev.scope && ev.interestedParties,
        detail:
          ev.scope && ev.interestedParties
            ? 'Geltungsbereich festgelegt, interessierte Parteien erfasst'
            : ev.scope
              ? 'Interessierte Parteien fehlen noch'
              : 'Geltungsbereich fehlt noch',
        action: ev.scope ? 'Interessierte Parteien erfassen' : 'Geltungsbereich festlegen',
        to: '/context',
      },
      {
        key: 'gap',
        title: 'Gap-Analyse',
        done: controls.decided === controls.total,
        detail: `${controls.decided} von ${controls.total} Controls aus Anhang A entschieden`,
        action: `${controls.total - controls.decided} Controls entscheiden: Maßnahme zuordnen oder begründet ausschließen`,
        to: '/programme/iso27001/gap',
      },
      {
        key: 'risks',
        title: 'Risiken bewerten und behandeln',
        done: ev.riskTreatment,
        detail: ev.riskTreatment
          ? 'Risiken bewertet, hohe Risiken behandelt'
          : 'Hohe Risiken ohne Behandlung',
        action: 'Hohe Risiken mit Maßnahmen behandeln oder bewusst tragen',
        to: '/risks',
      },
      {
        key: 'implementation',
        title: 'Maßnahmen umsetzen',
        done: r.open === 0,
        detail: `${done} erfüllt, ${r.partial} teilweise, ${r.open} offen von ${r.total} Normpunkten`,
        action: `${r.open} offene Normpunkte mit umgesetzten Maßnahmen abdecken`,
        to: '/measures',
      },
      {
        key: 'audit',
        title: 'Internes Audit',
        done: ev.internalAudit,
        detail: ev.internalAudit
          ? 'Audit in den letzten 12 Monaten berichtet'
          : 'Kein Audit in den letzten 12 Monaten',
        action: 'Internes Audit planen und durchführen',
        to: '/audits',
      },
      {
        key: 'review',
        title: 'Managementbewertung',
        done: ev.managementReview,
        detail: ev.managementReview
          ? 'In den letzten 12 Monaten abgeschlossen'
          : 'Keine abgeschlossene Bewertung in den letzten 12 Monaten',
        action: 'Managementbewertung durchführen und abschließen',
        to: '/reviews',
      },
    ];
    const allBefore = steps.every((s) => s.done);
    steps.push({
      key: 'certification',
      title: 'Bereit für das Zertifizierungsaudit',
      done: allBefore && r.evidenceMet === r.evidence.length,
      detail: `${r.evidenceMet} von ${r.evidence.length} Kernnachweisen vorhanden`,
      action: 'Fehlende Kernnachweise ergänzen',
      to: '/programme/iso27001',
    });

    return finish({
      key: 'ISO27001',
      name: 'ISO 27001',
      active: true,
      score: { value: r.pct, of: 100, unit: 'pct', label: 'zertifizierungsreif' },
      steps,
    });
  }

  private async nis2(tenantId: string): Promise<Programme> {
    const map = await this.coverage.map(tenantId, 'NIS2');
    const status = new Map(map.rows.map((row) => [row.refCode, row.status]));
    const ok = (ref: string) => IMPLEMENTED.includes(status.get(ref) ?? '');
    const measureRows = map.rows.filter((row) => row.refCode.startsWith('Art. 21 Abs. 2'));
    const measuresDone = measureRows.filter((row) => ok(row.refCode)).length;
    const indirect = map.rows.filter((row) => row.status === 'indirect').length;
    const covered = map.rows.filter((row) => ok(row.refCode)).length;
    const cockpit = '/cockpit?framework=NIS2';

    const steps: ProgrammeStep[] = [
      {
        key: 'registration',
        title: 'Registrierung beim BSI (§ 33 BSIG)',
        done: ok('Art. 27'),
        detail: ok('Art. 27') ? 'Registrierung erledigt' : 'Registrierung noch nicht erledigt',
        action: 'Einrichtung beim BSI registrieren',
        to: cockpit,
      },
      {
        key: 'measures',
        title: 'Risikomaßnahmen (§ 30 BSIG)',
        done: measureRows.length > 0 && measuresDone === measureRows.length,
        detail:
          `${measuresDone} von ${measureRows.length} Maßnahmenbereichen erfüllt` +
          (indirect > 0 ? `, ${indirect} nur indirekt abgedeckt` : ''),
        action:
          indirect > 0
            ? `${indirect} indirekt abgedeckte Pflicht mit einem Klick zuordnen`
            : 'Offene Maßnahmenbereiche umsetzen',
        to: cockpit,
      },
      {
        key: 'reporting',
        title: 'Meldewege für erhebliche Vorfälle (§ 32 BSIG)',
        done: ok('Art. 23'),
        detail: ok('Art. 23') ? 'Meldeprozess umgesetzt' : 'Meldeprozess fehlt noch',
        action: 'Meldeprozess mit Fristen 24 Stunden, 72 Stunden und einem Monat festlegen',
        to: cockpit,
      },
      {
        key: 'management',
        title: 'Geschäftsleitung billigt, überwacht, schult (§ 38 BSIG)',
        done: ok('Art. 20'),
        detail: ok('Art. 20') ? 'Billigung und Schulung belegt' : 'Billigung oder Schulung fehlt',
        action: 'Billigung der Maßnahmen und Schulung der Geschäftsleitung belegen',
        to: cockpit,
      },
    ];

    const p = finish({
      key: 'NIS2',
      name: 'NIS2',
      active: true,
      score: { value: covered, of: map.rows.length, unit: 'count', label: 'Pflichten erfüllt' },
      steps,
    });
    // Eine laufende Meldefrist geht jedem Ausbauschritt vor: 24 Stunden warten nicht.
    const running = await this.runningReportingDeadlines(tenantId);
    if (running > 0) {
      p.next = {
        title: running === 1 ? 'Eine Meldefrist läuft' : `${running} Meldefristen laufen`,
        to: '/incidents',
        urgent: true,
      };
    }
    return p;
  }

  private async aiAct(tenantId: string): Promise<Programme> {
    const systems = (await this.ai.list(tenantId)) as unknown as {
      status: string;
      riskClass: string;
      errorCount: number;
    }[];
    const live = systems.filter((s) => s.status !== 'retired');
    const prohibited = live.filter((s) => s.riskClass === 'prohibited').length;
    const blocked = live.filter((s) => s.errorCount > 0).length;
    const map = await this.coverage.map(tenantId, 'EU_AI_ACT');
    const covered = map.rows.filter((row) => IMPLEMENTED.includes(row.status)).length;

    const steps: ProgrammeStep[] = [
      {
        key: 'register',
        title: 'KI-Systeme erfassen und einstufen',
        done: live.length > 0,
        detail: live.length ? `${live.length} KI-Systeme im Register` : 'Noch kein KI-System erfasst',
        action: 'Eingesetzte KI-Systeme erfassen, auch eingekaufte',
        to: '/ai',
      },
      {
        key: 'prohibited',
        title: 'Keine verbotene Praxis (Art. 5)',
        done: live.length > 0 && prohibited === 0,
        detail: prohibited ? `${prohibited} System mit verbotener Praxis` : 'Keine verbotene Praxis',
        action: 'System mit verbotener Praxis stilllegen',
        to: '/ai',
      },
      {
        key: 'checks',
        title: 'Prüfpunkte je System erfüllt',
        done: live.length > 0 && blocked === 0,
        detail: blocked ? `${blocked} System mit offenen Prüfpunkten` : 'Alle Prüfpunkte erfüllt',
        action: 'Offene Prüfpunkte im KI-Register schließen',
        to: '/ai',
      },
      {
        key: 'obligations',
        title: 'Betreiberpflichten mit Maßnahmen belegen',
        done: map.rows.length > 0 && covered === map.rows.length,
        detail: `${covered} von ${map.rows.length} ausgelösten Pflichten erfüllt`,
        action: 'Ausgelöste Betreiberpflichten mit Maßnahmen belegen',
        to: '/cockpit?framework=EU_AI_ACT',
      },
    ];
    return finish({
      key: 'EU_AI_ACT',
      name: 'EU AI Act',
      active: true,
      score: { value: covered, of: map.rows.length, unit: 'count', label: 'Betreiberpflichten erfüllt' },
      steps,
    });
  }

  /**
   * Offene Aufgaben, abgeleitet aus den Daten: jede ist eine Abfrage mit Anzahl und dem Ort, an dem
   * man sie erledigt. Nur was offen ist, wird zurückgegeben, in der Reihenfolge der Dringlichkeit.
   * Eine Aufgabe von Hand anzulegen ist bewusst nicht vorgesehen: Sie veraltet, sobald die Daten
   * sich ändern, und dann stimmen Liste und Wirklichkeit nicht mehr überein.
   */
  async tasks(tenantId: string): Promise<DerivedTask[]> {
    const active = await this.activeFrameworks(tenantId);
    const c = (
      await this.dbs.tenant(tenantId, (tx) =>
        tx.execute(sql`
          SELECT
            (SELECT count(*)::int FROM v_assessable_requirement v
               JOIN framework f ON f.id = v.framework_id AND f.key = 'ISO27001'
              WHERE v.kind = 'control'
                AND NOT EXISTS (SELECT 1 FROM tenant_requirement tr WHERE tr.tenant_id = ${tenantId}
                                  AND tr.requirement_id = v.id AND tr.applicability = 'not_applicable')
                AND NOT EXISTS (SELECT 1 FROM measure_requirement mr WHERE mr.tenant_id = ${tenantId}
                                  AND mr.requirement_id = v.id)) AS "isoUndecided",
            (SELECT count(*)::int FROM risk WHERE tenant_id = ${tenantId} AND status <> 'closed'
                AND score > 14 AND accepted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM risk_measure rm WHERE rm.risk_id = risk.id)) AS "risksUntreated",
            (SELECT count(*)::int FROM risk WHERE tenant_id = ${tenantId} AND status <> 'closed'
                AND likelihood IS NULL) AS "risksUnassessed",
            (SELECT count(*)::int FROM measure WHERE tenant_id = ${tenantId}
                AND status IN ('planned', 'in_progress') AND due_date < current_date) AS "measuresOverdue",
            (SELECT count(*)::int FROM measure WHERE tenant_id = ${tenantId}
                AND status IN ('planned', 'in_progress') AND owner_person_id IS NULL) AS "measuresUnowned",
            (SELECT count(*)::int FROM asset WHERE tenant_id = ${tenantId}
                AND status = 'active' AND owner_person_id IS NULL) AS "assetsUnowned"`),
      )
    ).rows[0] as Record<string, number>;

    const tasks: DerivedTask[] = [];
    const add = (key: string, count: number, title: string, to: string) => {
      if (count > 0) tasks.push({ key, count, title, to });
    };
    add('risksUntreated', c.risksUntreated!, 'Hohe Risiken ohne Behandlung', '/risks');
    add('measuresOverdue', c.measuresOverdue!, 'Maßnahmen über ihrem Termin', '/measures');
    if (active.has('ISO27001'))
      add(
        'isoUndecided',
        c.isoUndecided!,
        'Controls aus Anhang A ohne Entscheidung',
        '/programme/iso27001/gap',
      );
    if (active.has('NIS2')) {
      const map = await this.coverage.map(tenantId, 'NIS2');
      add(
        'nis2Indirect',
        map.rows.filter((row) => row.status === 'indirect').length,
        'NIS2-Pflichten nur indirekt abgedeckt: Zuordnung übernehmen',
        '/cockpit?framework=NIS2',
      );
    }
    if (active.has('EU_AI_ACT')) {
      const systems = (await this.ai.list(tenantId)) as unknown as { status: string; errorCount: number }[];
      add(
        'aiBlocked',
        systems.filter((s) => s.status !== 'retired' && s.errorCount > 0).length,
        'KI-Systeme mit offenen Prüfpunkten',
        '/ai',
      );
    }
    add('risksUnassessed', c.risksUnassessed!, 'Risiken noch nicht bewertet', '/risks');
    add('assetsUnowned', c.assetsUnowned!, 'Assets ohne Verantwortliche', '/assets');
    add('measuresUnowned', c.measuresUnowned!, 'Offene Maßnahmen ohne Verantwortliche', '/measures');
    return tasks;
  }

  /**
   * „Mein Bereich“: was einer Person gehört, an einer Stelle. Verantwortung ist im Datenmodell an
   * `person` gebunden, nicht an ein Konto; wer kein Personenprofil hat, hat hier nichts.
   * Maßnahmen nur, solange sie offen sind: Erledigtes gehört nicht in eine Arbeitsliste.
   */
  async myArea(tenantId: string, personId: string | null) {
    if (!personId) return { assets: [], risks: [], measures: [] };
    return this.dbs.tenant(tenantId, async (tx) => {
      const [assets, risks, measures] = await Promise.all([
        tx.execute(sql`
          SELECT a.id, a.ref_no AS "refNo", a.name, a.category::text AS category,
                 a.owner_person_id AS "ownerPersonId",
                 (SELECT count(*)::int FROM risk_asset ra JOIN risk r ON r.id = ra.risk_id
                   WHERE ra.asset_id = a.id AND r.status <> 'closed') AS "riskCount"
          FROM asset a
          WHERE a.tenant_id = ${tenantId} AND a.owner_person_id = ${personId} AND a.status = 'active'
          ORDER BY a.ref_no`),
        tx.execute(sql`
          SELECT r.id, r.ref_no AS "refNo", r.title, r.status::text AS status, r.score,
                 r.next_review_at AS "nextReviewAt"
          FROM risk r
          WHERE r.tenant_id = ${tenantId} AND r.owner_person_id = ${personId} AND r.status <> 'closed'
          ORDER BY r.score DESC NULLS FIRST, r.ref_no`),
        tx.execute(sql`
          SELECT m.id, m.ref_no AS "refNo", m.title, m.status::text AS status, m.due_date AS "dueDate"
          FROM measure m
          WHERE m.tenant_id = ${tenantId} AND m.owner_person_id = ${personId}
            AND m.status IN ('planned', 'in_progress')
          ORDER BY m.due_date NULLS LAST, m.ref_no`),
      ]);
      return {
        assets: assets.rows as {
          id: string;
          refNo: string;
          name: string;
          category: string;
          ownerPersonId: string;
          riskCount: number;
        }[],
        risks: risks.rows as {
          id: string;
          refNo: string;
          title: string;
          status: string;
          score: number | null;
          nextReviewAt: string | null;
        }[],
        measures: measures.rows as {
          id: string;
          refNo: string;
          title: string;
          status: string;
          dueDate: string | null;
        }[],
      };
    });
  }

  /**
   * Erste Schritte für einen neuen Mandanten. Wie die Programmschritte aus den Daten abgeleitet:
   * Ein Schritt ist erledigt, sobald es den Eintrag gibt. Sind alle erledigt, blendet die
   * Oberfläche die Karte aus; dann führen die Programme weiter.
   */
  async onboarding(tenantId: string) {
    const c = (
      await this.dbs.tenant(tenantId, (tx) =>
        tx.execute(sql`
          SELECT
            EXISTS (SELECT 1 FROM isms_scope WHERE tenant_id = ${tenantId} AND length(trim(statement)) > 0) AS scope,
            (SELECT count(*) FROM tenant_membership WHERE tenant_id = ${tenantId}) > 1 AS team,
            EXISTS (SELECT 1 FROM asset WHERE tenant_id = ${tenantId}) AS assets,
            EXISTS (SELECT 1 FROM risk WHERE tenant_id = ${tenantId} AND likelihood IS NOT NULL) AS risks,
            EXISTS (SELECT 1 FROM tenant_requirement WHERE tenant_id = ${tenantId} AND applicability = 'not_applicable')
              OR EXISTS (SELECT 1 FROM measure_requirement WHERE tenant_id = ${tenantId}) AS gap`),
      )
    ).rows[0] as Record<'scope' | 'team' | 'assets' | 'risks' | 'gap', boolean>;
    const steps = [
      {
        key: 'scope',
        title: 'Geltungsbereich festlegen',
        hint: 'Was gehört zum ISMS, was nicht? Die erste Frage jedes Auditors.',
        done: c.scope,
        to: '/context',
      },
      {
        key: 'team',
        title: 'Kolleginnen und Kollegen einladen',
        hint: 'Wer Risiken oder Maßnahmen verantwortet, arbeitet mit, statt Listen zugeschickt zu bekommen.',
        done: c.team,
        to: '/members',
      },
      {
        key: 'assets',
        title: 'Wichtigste Assets erfassen',
        hint: 'Systeme, Anwendungen, Dienstleister: woran hängen Ihre Abläufe?',
        done: c.assets,
        to: '/assets',
      },
      {
        key: 'risks',
        title: 'Erste Risiken bewerten',
        hint: 'Am einfachsten vom Asset aus: „+ Risiko“ schlägt passende Risiken vor.',
        done: c.risks,
        to: '/risks',
      },
      {
        key: 'gap',
        title: 'Gap-Analyse beginnen',
        hint: 'Kapitel für Kapitel: gilt das für uns, womit erfüllen wir es?',
        done: c.gap,
        to: '/programme/iso27001/gap',
      },
    ];
    return { steps, complete: steps.every((s) => s.done) };
  }

  private async activeFrameworks(tenantId: string): Promise<Set<string>> {
    const rows = await this.dbs.tenant(tenantId, (tx) =>
      tx.execute(sql`
        SELECT f.key FROM tenant_framework tf JOIN framework f ON f.id = tf.framework_id
        WHERE tf.tenant_id = ${tenantId}`),
    );
    return new Set((rows.rows as { key: string }[]).map((r) => r.key));
  }

  private async runningReportingDeadlines(tenantId: string): Promise<number> {
    const rows = await this.dbs.tenant(tenantId, (tx) =>
      tx.execute(sql`
        SELECT count(*)::int AS n FROM reporting_obligation
        WHERE tenant_id = ${tenantId} AND fulfilled_at IS NULL AND due_at IS NOT NULL
          AND regime::text LIKE 'nis2%'`),
    );
    return (rows.rows[0] as { n: number }).n;
  }
}

const NAMES: Record<ProgrammeKey, string> = { ISO27001: 'ISO 27001', NIS2: 'NIS2', EU_AI_ACT: 'EU AI Act' };

function inactive(key: ProgrammeKey): Programme {
  return {
    key,
    name: NAMES[key],
    active: false,
    score: { value: 0, of: 0, unit: 'count', label: '' },
    steps: [],
    current: null,
    next: null,
  };
}

function finish(p: Omit<Programme, 'current' | 'next'>): Programme {
  const open = p.steps.find((s) => !s.done) ?? null;
  return { ...p, current: open?.key ?? null, next: open ? { title: open.action, to: open.to } : null };
}
