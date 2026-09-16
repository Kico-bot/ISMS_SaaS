import { Injectable, Logger } from '@nestjs/common';
import { schema } from '@isms/db';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { loadEnv } from '../../config/env';
import { DbService } from '../../kernel/db/db.service';
import type { MailMessage } from '../../kernel/mail/mail.service';
import { MailService } from '../../kernel/mail/mail.service';
import type { DeadlineRow } from '../deadlines/deadlines.service';
import { DeadlinesService } from '../deadlines/deadlines.service';

/** Was in der Erinnerung steht, bevor sie zur Nachricht wird — so lässt es sich prüfen. */
export interface Digest {
  personId: string;
  name: string;
  email: string;
  overdue: DeadlineRow[];
  upcoming: DeadlineRow[];
}

const KIND_LABEL: Record<string, string> = {
  reporting_obligation: 'Meldefrist',
  finding: 'Feststellung',
  action: 'KVP-Maßnahme',
  measure: 'Maßnahme',
  risk_review: 'Risiko-Wiedervorlage',
  risk_acceptance: 'Risikoakzeptanz',
  document_review: 'Dokumentenprüfung',
  acknowledgement: 'Lesebestätigung',
  evidence: 'Nachweis',
  skill: 'Kompetenznachweis',
  training: 'Schulung',
  continuity_exercise: 'Notfallübung',
  objective: 'Sicherheitsziel',
  audit: 'Audit',
};

/**
 * Erinnerungen per E-Mail.
 *
 * Der Gedanke ist derselbe wie überall sonst: nichts wird doppelt gepflegt. Die Erinnerung
 * entsteht aus der Wiedervorlage, nicht aus einer eigenen Aufgabenliste, und sie geht an die
 * Person, der die Frist zugeordnet ist — jede bekommt nur ihre eigenen Einträge zu sehen.
 *
 * Wer keiner Frist zugeordnet ist, bekommt keine Post. Eine Rundmail „es gibt 47 offene
 * Punkte“ liest nach der zweiten Woche niemand mehr.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');

  constructor(
    private readonly dbs: DbService,
    private readonly deadlines: DeadlinesService,
    private readonly mail: MailService,
  ) {}

  /** Alle Mandanten, für die der Hintergrundlauf Erinnerungen erzeugt. */
  async activeTenants(): Promise<{ id: string; name: string }[]> {
    return this.dbs.platform(async (tx) => {
      const res = await tx.execute(sql`SELECT id, name FROM tenant WHERE is_active ORDER BY name`);
      return res.rows as { id: string; name: string }[];
    });
  }

  /**
   * Die Erinnerungen eines Mandanten, nach Person gebündelt. Ohne Postadresse keine
   * Erinnerung — `person` gibt es auch für Beschäftigte, die sich nie anmelden.
   */
  async digests(tenantId: string, horizonDays?: number): Promise<Digest[]> {
    const horizon = horizonDays ?? loadEnv().DIGEST_HORIZON_DAYS;
    const rows = await this.deadlines.allForTenant(tenantId, horizon);

    const byPerson = new Map<string, Digest>();
    for (const row of rows) {
      if (!row.ownerPersonId) continue;
      let d = byPerson.get(row.ownerPersonId);
      if (!d) {
        d = {
          personId: row.ownerPersonId,
          name: row.ownerName ?? '',
          email: '',
          overdue: [],
          upcoming: [],
        };
        byPerson.set(row.ownerPersonId, d);
      }
      (row.daysLeft < 0 ? d.overdue : d.upcoming).push(row);
    }
    if (byPerson.size === 0) return [];

    const contacts = await this.contacts(tenantId, [...byPerson.keys()]);
    return [...byPerson.values()]
      .map((d) => ({ ...d, email: contacts.get(d.personId) ?? '' }))
      .filter((d) => d.email !== '')
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /** Erzeugt die Nachrichten, verschickt sie aber nicht — für die Vorschau vor dem Scharfschalten. */
  async preview(tenantId: string, horizonDays?: number): Promise<MailMessage[]> {
    const tenantName = await this.tenantName(tenantId);
    return (await this.digests(tenantId, horizonDays)).map((d) => this.compose(d, tenantName));
  }

  async sendDigests(tenantId: string, horizonDays?: number): Promise<{ sent: number; failed: number }> {
    const messages = await this.preview(tenantId, horizonDays);
    if (messages.length === 0) return { sent: 0, failed: 0 };
    const result = await this.mail.sendAll(messages);
    this.log.log(
      `Wiedervorlage für ${tenantId}: ${result.sent} Erinnerung(en) erzeugt` +
        (result.failed > 0 ? `, ${result.failed} fehlgeschlagen` : ''),
    );
    return result;
  }

  /** Eine Nachricht aus der Bündelung einer Person. */
  compose(digest: Digest, tenantName: string): MailMessage {
    const { WEB_BASE_URL } = loadEnv();
    const lines: string[] = [`Guten Tag ${digest.name},`, ''];

    if (digest.overdue.length > 0) {
      lines.push(`überfällig (${digest.overdue.length}):`);
      for (const r of digest.overdue) lines.push(`  ${this.line(r)}`);
      lines.push('');
    }
    if (digest.upcoming.length > 0) {
      lines.push(`in den nächsten Tagen (${digest.upcoming.length}):`);
      for (const r of digest.upcoming) lines.push(`  ${this.line(r)}`);
      lines.push('');
    }
    lines.push(`Alle Fristen: ${WEB_BASE_URL}/deadlines`, '', `— ISMS ${tenantName}`);

    // Der Betreff sagt das Wichtigste, auch wenn die Nachricht nie geöffnet wird — und
    // nennt nur, was es wirklich gibt: „0 anstehend“ ist keine Information.
    const parts: string[] = [];
    if (digest.overdue.length > 0) parts.push(`${digest.overdue.length} überfällig`);
    if (digest.upcoming.length > 0) parts.push(`${digest.upcoming.length} anstehend`);
    const subject = `ISMS-Fristen: ${parts.join(', ')}`;

    return { to: digest.email, subject, text: lines.join('\n') };
  }

  private line(r: DeadlineRow): string {
    const label = KIND_LABEL[r.kind] ?? r.kind;
    const when =
      r.daysLeft < 0
        ? `seit ${Math.abs(r.daysLeft)} Tag(en) überfällig`
        : r.daysLeft === 0
          ? 'heute fällig'
          : `in ${r.daysLeft} Tag(en)`;
    const ref = r.refNo ? ` [${r.refNo}]` : '';
    return `${r.dueAt} · ${label}: ${r.title}${ref} — ${when}`;
  }

  private async contacts(tenantId: string, personIds: string[]): Promise<Map<string, string>> {
    // `inArray` statt `= ANY(...)`: eine JS-Liste landet dort nicht als Array-Literal.
    return this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: schema.person.id, email: schema.person.email })
        .from(schema.person)
        .where(
          and(
            eq(schema.person.tenantId, tenantId),
            eq(schema.person.isActive, true),
            isNotNull(schema.person.email),
            inArray(schema.person.id, personIds),
          ),
        );
      return new Map(rows.filter((r) => r.email).map((r) => [r.id, r.email as string]));
    });
  }

  private async tenantName(tenantId: string): Promise<string> {
    return this.dbs.platform(async (tx) => {
      const res = await tx.execute(sql`SELECT name FROM tenant WHERE id = ${tenantId}`);
      return (res.rows[0] as { name?: string } | undefined)?.name ?? '';
    });
  }
}
