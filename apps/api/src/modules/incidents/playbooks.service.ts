import { Injectable, NotFoundException } from '@nestjs/common';
import { schema } from '@isms/db';
import type { AuthContext, PlaybookScenario } from '@isms/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DbService, type TenantTx } from '../../kernel/db/db.service';

/**
 * Standard-Ablauf der Vorfallsbehandlung nach ISO/IEC 27035 bzw. BSI DER.2.1:
 * erkennen → eindämmen → beweissichern → beseitigen → wiederherstellen → nachbereiten.
 * Die Vorlagen sind bewusst knapp; sie sollen im Ernstfall gelesen, nicht studiert werden.
 */
const TEMPLATES: Record<
  PlaybookScenario,
  { title: string; steps: { title: string; instruction: string; roleHint?: string }[] }
> = {
  asset_outage: {
    title: 'Ausfall oder Vorfall an einem System',
    steps: [
      {
        title: 'Vorfall erkennen, eingrenzen und klassifizieren',
        instruction: 'Betroffene Systeme und Datenkategorien feststellen, Schweregrad festlegen.',
        roleHint: 'System-Owner',
      },
      {
        title: 'System isolieren, Schaden begrenzen',
        instruction: 'Netzverbindungen trennen oder Dienste stoppen, soweit der Betrieb es zulässt.',
        roleHint: 'IT-Betrieb',
      },
      {
        title: 'Zugangsdaten und Sitzungen zurückziehen',
        instruction: 'Betroffene Konten sperren, Token und Sitzungen invalidieren.',
        roleHint: 'IAM',
      },
      {
        title: 'Beweise und Protokolle sichern',
        instruction:
          'Speicherabbild und Protokolldateien vor dem Neustart sichern. Ein Neustart löscht flüchtige Spuren.',
        roleHint: 'Forensik',
      },
      {
        title: 'Wiederherstellung aus Backup oder Failover einleiten',
        instruction: 'Integrität des Backups prüfen, erst dann zurückspielen.',
        roleHint: 'IT-Betrieb',
      },
      {
        title: 'Funktion prüfen und Betrieb freigeben',
        instruction: 'Fachlich testen, Freigabe dokumentieren.',
        roleHint: 'System-Owner',
      },
      {
        title: 'Ursache analysieren und Maßnahmen ableiten',
        instruction: 'Ursachenanalyse durchführen, Korrekturmaßnahmen im KVP-Register anlegen.',
        roleHint: 'ISMS-Manager',
      },
    ],
  },
  ransomware: {
    title: 'Ransomware-Befall',
    steps: [
      {
        title: 'Befall bestätigen und Ausbreitung stoppen',
        instruction: 'Betroffene Systeme sofort vom Netz trennen, nicht herunterfahren.',
        roleHint: 'IT-Betrieb',
      },
      {
        title: 'Krisenstab einberufen',
        instruction: 'Geschäftsleitung, IT, Datenschutz und Kommunikation zusammenrufen.',
        roleHint: 'Geschäftsleitung',
      },
      {
        title: 'Backups prüfen und offline schützen',
        instruction: 'Sicherstellen, dass Backups nicht mitverschlüsselt und vom Netz getrennt sind.',
        roleHint: 'IT-Betrieb',
      },
      {
        title: 'Meldepflichten prüfen',
        instruction:
          'DSGVO Art. 33 bei personenbezogenen Daten, NIS2 bei erheblichem Vorfall. Die Fristen laufen ab dem Zeitpunkt, an dem Sie davon erfahren.',
        roleHint: 'DSB / ISMS-Manager',
      },
      {
        title: 'Strafanzeige und externe Unterstützung erwägen',
        instruction:
          'Zentrale Ansprechstelle Cybercrime (ZAC) und Incident-Response-Dienstleister einbeziehen.',
        roleHint: 'Geschäftsleitung',
      },
      {
        title: 'Neuaufbau statt Bereinigung planen',
        instruction:
          'Kompromittierte Systeme neu aufsetzen; eine Bereinigung lässt Hintertüren möglicherweise bestehen.',
        roleHint: 'IT-Betrieb',
      },
      {
        title: 'Wiederanlauf priorisiert nach BIA',
        instruction: 'Reihenfolge nach den Wiederanlaufzielen der Business-Impact-Analyse.',
        roleHint: 'BCM',
      },
      {
        title: 'Nachbereitung und Lessons Learned',
        instruction: 'Ursachenanalyse, Maßnahmen, Aktualisierung des Playbooks.',
        roleHint: 'ISMS-Manager',
      },
    ],
  },
  data_breach: {
    title: 'Verletzung des Schutzes personenbezogener Daten',
    steps: [
      {
        title: 'Sachverhalt feststellen',
        instruction: 'Welche Datenkategorien, wie viele Betroffene, welcher Zeitraum, welcher Weg.',
        roleHint: 'DSB',
      },
      {
        title: 'Datenpanne im System bestätigen',
        instruction: 'Bestätigung startet die 72-Stunden-Frist nach Art. 33 DSGVO.',
        roleHint: 'DSB',
      },
      {
        title: 'Risiko für die Betroffenen bewerten',
        instruction: 'Bei voraussichtlich hohem Risiko ist zusätzlich Art. 34 einschlägig.',
        roleHint: 'DSB',
      },
      {
        title: 'Meldung an die Aufsichtsbehörde',
        instruction: 'Innerhalb von 72 Stunden; bei Verzögerung ist eine Begründung beizufügen.',
        roleHint: 'DSB',
      },
      {
        title: 'Betroffene benachrichtigen',
        instruction: 'Unverzüglich, in klarer und einfacher Sprache, mit Handlungsempfehlungen.',
        roleHint: 'DSB / Kommunikation',
      },
      {
        title: 'Vorfall im Verzeichnis dokumentieren',
        instruction: 'Art. 33 Abs. 5: Dokumentationspflicht unabhängig von der Meldepflicht.',
        roleHint: 'DSB',
      },
    ],
  },
  supplier_outage: {
    title: 'Ausfall eines Dienstleisters',
    steps: [
      {
        title: 'Betroffene Prozesse feststellen',
        instruction: 'Welche Geschäftsprozesse hängen am Dienstleister, welche Wiederanlaufziele gelten.',
        roleHint: 'Prozess-Owner',
      },
      {
        title: 'Dienstleister kontaktieren und Lage klären',
        instruction: 'Eskalationskontakt aus dem Vertrag nutzen, Wiederherstellungszeit erfragen.',
        roleHint: 'Lieferantenmanagement',
      },
      {
        title: 'Notbetrieb aktivieren',
        instruction: 'Manuelles Verfahren oder Ausweichanbieter gemäß Continuity-Plan starten.',
        roleHint: 'Prozess-Owner',
      },
      {
        title: 'Vertragliche Pflichten prüfen',
        instruction: 'Meldepflichten, Vertragsstrafen und Nachweispflichten des Dienstleisters prüfen.',
        roleHint: 'Einkauf / Recht',
      },
      {
        title: 'Nachbereitung mit dem Dienstleister',
        instruction: 'Ursachenbericht einfordern, Maßnahmen vereinbaren, Lieferantenbewertung aktualisieren.',
        roleHint: 'Lieferantenmanagement',
      },
    ],
  },
  site_loss: {
    title: 'Ausfall eines Standorts',
    steps: [
      {
        title: 'Personensicherheit gewährleisten',
        instruction: 'Evakuierung und Vollzähligkeit vor allen IT-Maßnahmen.',
        roleHint: 'Sicherheitsbeauftragter',
      },
      {
        title: 'Krisenstab einberufen',
        instruction: 'Lagebild erstellen, Zuständigkeiten festlegen.',
        roleHint: 'Geschäftsleitung',
      },
      {
        title: 'Ausweichstandort bzw. Heimarbeit aktivieren',
        instruction: 'Zugänge, Endgeräte und Netzanbindung bereitstellen.',
        roleHint: 'IT-Betrieb',
      },
      {
        title: 'Kritische Prozesse nach BIA wiederanlaufen lassen',
        instruction: 'Reihenfolge nach Tier und Wiederanlaufzielen.',
        roleHint: 'BCM',
      },
      {
        title: 'Intern und extern kommunizieren',
        instruction: 'Beschäftigte, Kunden und Behörden gemäß Kommunikationsplan informieren.',
        roleHint: 'Kommunikation',
      },
    ],
  },
  custom: { title: 'Eigenes Szenario', steps: [] },
};

@Injectable()
export class PlaybooksService {
  constructor(private readonly dbs: DbService) {}

  async list(tenantId: string) {
    return this.dbs.tenant(tenantId, async (tx) => {
      const res = await tx.execute(sql`
        SELECT p.id, p.title, p.scenario::text AS scenario, p.status::text AS status, p.auto_generated AS "autoGenerated",
               a.name AS "assetName", bp.name AS "processName",
               (SELECT count(*)::int FROM playbook_step s WHERE s.playbook_id = p.id) AS "stepCount"
        FROM playbook p
        LEFT JOIN asset a ON a.id = p.asset_id
        LEFT JOIN business_process bp ON bp.id = p.process_id
        WHERE p.tenant_id = ${tenantId}
        ORDER BY p.status, p.title`);
      return res.rows;
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbs.tenant(tenantId, (tx) => this.loadDetail(tx, tenantId, id));
  }

  /** Wie get(), aber in einer bestehenden Transaktion — sieht deren noch nicht committete Änderungen. */
  private async loadDetail(tx: TenantTx, tenantId: string, id: string) {
    const [pb] = await tx
      .select()
      .from(schema.playbook)
      .where(and(eq(schema.playbook.id, id), eq(schema.playbook.tenantId, tenantId)));
    if (!pb) throw new NotFoundException({ title: 'Playbook nicht gefunden' });
    const steps = await tx
      .select()
      .from(schema.playbookStep)
      .where(eq(schema.playbookStep.playbookId, id))
      .orderBy(asc(schema.playbookStep.seq));
    return { ...pb, steps };
  }

  async createFromTemplate(
    ctx: AuthContext,
    scenario: PlaybookScenario,
    opts: { title?: string; assetId?: string; processId?: string } = {},
  ) {
    const tenantId = ctx.tenantId!;
    const template = TEMPLATES[scenario];
    return this.dbs.tenant(tenantId, async (tx) => {
      const [pb] = await tx
        .insert(schema.playbook)
        .values({
          tenantId,
          title: opts.title ?? template.title,
          scenario,
          assetId: opts.assetId ?? null,
          processId: opts.processId ?? null,
          status: 'draft',
        })
        .returning();
      if (template.steps.length) {
        await tx.insert(schema.playbookStep).values(
          template.steps.map((s, i) => ({
            tenantId,
            playbookId: pb!.id,
            seq: i + 1,
            title: s.title,
            instruction: s.instruction,
            roleHint: s.roleHint ?? null,
          })),
        );
      }
      return this.loadDetail(tx, tenantId, pb!.id);
    });
  }

  /**
   * Erzeugt Entwürfe für Assets mit hohem Verfügbarkeitsbedarf, die noch kein Playbook haben.
   * Entwürfe, nicht fertige Pläne: die Fachverantwortlichen ergänzen die Details.
   */
  async autoGenerate(ctx: AuthContext) {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const candidates = await tx.execute(sql`
        SELECT a.id, a.name FROM asset a
        WHERE a.tenant_id = ${tenantId} AND a.status = 'active' AND a.availability = 3
          AND NOT EXISTS (SELECT 1 FROM playbook p WHERE p.asset_id = a.id)
        ORDER BY a.ref_no
        LIMIT 20`);
      const created: { id: string; title: string }[] = [];
      for (const row of candidates.rows as { id: string; name: string }[]) {
        const template = TEMPLATES.asset_outage;
        const [pb] = await tx
          .insert(schema.playbook)
          .values({
            tenantId,
            title: `Ausfall/Vorfall: ${row.name}`,
            scenario: 'asset_outage',
            assetId: row.id,
            status: 'draft',
            autoGenerated: true,
          })
          .returning({ id: schema.playbook.id, title: schema.playbook.title });
        await tx.insert(schema.playbookStep).values(
          template.steps.map((s, i) => ({
            tenantId,
            playbookId: pb!.id,
            seq: i + 1,
            title: s.title.replace('einem System', `„${row.name}“`),
            instruction: s.instruction,
            roleHint: s.roleHint ?? null,
          })),
        );
        created.push(pb!);
      }
      return { created: created.length, playbooks: created };
    });
  }

  async setStatus(ctx: AuthContext, id: string, status: 'draft' | 'active' | 'archived') {
    const tenantId = ctx.tenantId!;
    return this.dbs.tenant(tenantId, async (tx) => {
      const [pb] = await tx
        .update(schema.playbook)
        .set({ status })
        .where(and(eq(schema.playbook.id, id), eq(schema.playbook.tenantId, tenantId)))
        .returning();
      if (!pb) throw new NotFoundException();
      return pb;
    });
  }

  /** Passendes Playbook zu einem Vorfall vorschlagen — Asset-Bezug schlägt Szenario-Vorlage. */
  async suggestFor(tenantId: string, incidentId: string) {
    return this.dbs.tenant(tenantId, async (tx: TenantTx) => {
      const res = await tx.execute(sql`
        SELECT p.id, p.title, p.scenario::text AS scenario,
               CASE WHEN p.asset_id IN (SELECT asset_id FROM incident_asset WHERE incident_id = ${incidentId}) THEN 1 ELSE 2 END AS rank
        FROM playbook p
        WHERE p.tenant_id = ${tenantId} AND p.status = 'active'
        ORDER BY rank, p.title
        LIMIT 10`);
      return res.rows;
    });
  }
}
