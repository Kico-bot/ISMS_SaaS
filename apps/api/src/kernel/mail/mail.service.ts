import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { schema } from '@isms/db';
import { desc, eq, sql } from 'drizzle-orm';
import { createTransport, type Transporter } from 'nodemailer';
import { loadEnv } from '../../config/env';
import { DbService } from '../db/db.service';

export interface MailMessage {
  to: string;
  subject: string;
  /** Reiner Text. Eine Erinnerung an eine Frist braucht kein Layout. */
  text: string;
}

export interface SentMail extends MailMessage {
  at: string;
  driver: 'log' | 'smtp';
}

/**
 * Mailversand mit zwei Treibern — wie bei `StorageService` bewusst schmal gehalten.
 *
 * Standard ist `log`: die Anwendung läuft damit ohne SMTP-Entscheidung, ohne Zugangsdaten und
 * ohne Kosten, und man sieht im Protokoll genau, was verschickt worden wäre. Erst
 * `MAIL_DRIVER=smtp` stellt zu — lokal etwa gegen Mailpit, später gegen den Mailserver des
 * Unternehmens. Kein Anbieter-SDK, keine gebuchte Zustellplattform.
 *
 * Nachrichten sind reiner Text. Eine Fristerinnerung braucht kein HTML, und Text kommt durch
 * jeden Spamfilter und jeden Mailclient unverändert durch.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly log = new Logger('Mail');
  private readonly driver: 'log' | 'smtp';
  private readonly from: string;
  private transporter?: Transporter;

  /**
   * So viele Nachrichten hält der Postausgang je Mandant vor. Er macht im Betrieb ohne SMTP
   * nachvollziehbar, was erzeugt wurde, und ist kein Archiv.
   */
  private static readonly KEEP = 50;

  constructor(private readonly dbs: DbService) {
    const env = loadEnv();
    this.driver = env.MAIL_DRIVER;
    this.from = env.SMTP_FROM;
    if (this.driver === 'smtp') {
      this.transporter = createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
      });
    }
  }

  /**
   * Verschickt eine Nachricht im Namen eines Mandanten und legt sie in dessen Postausgang. Der
   * Postausgang ist eine Tabelle mit RLS, damit API und Hintergrundprozess dieselbe Ablage
   * haben und kein Mandant die Post eines anderen sieht.
   */
  async send(tenantId: string, message: MailMessage): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.from, ...message });
    } else {
      this.log.log(`[${this.driver}] an ${message.to}: ${message.subject}`);
    }
    await this.remember(tenantId, message);
  }

  /**
   * Mehrere Nachrichten nacheinander. Bewusst seriell: ein Mailserver mag es nicht, wenn
   * hundert Verbindungen gleichzeitig aufschlagen, und eine fehlgeschlagene Zustellung darf
   * die übrigen nicht mitreißen.
   */
  async sendAll(tenantId: string, messages: MailMessage[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const m of messages) {
      try {
        await this.send(tenantId, m);
        sent += 1;
      } catch (e) {
        failed += 1;
        this.log.warn(`Zustellung an ${m.to} fehlgeschlagen: ${(e as Error).message}`);
      }
    }
    return { sent, failed };
  }

  /** Die zuletzt erzeugten Nachrichten des Mandanten, neueste zuerst. */
  async outbox(tenantId: string, limit = 20): Promise<SentMail[]> {
    const t = schema.mailOutbox;
    return this.dbs.tenant(tenantId, async (tx) => {
      const rows = await tx
        .select({ to: t.to, subject: t.subject, text: t.text, at: t.at, driver: t.driver })
        .from(t)
        .where(eq(t.tenantId, tenantId))
        .orderBy(desc(t.at))
        .limit(limit);
      return rows.map((r) => ({ ...r, at: r.at.toISOString(), driver: r.driver as SentMail['driver'] }));
    });
  }

  get isDelivering(): boolean {
    return this.driver === 'smtp';
  }

  private async remember(tenantId: string, message: MailMessage): Promise<void> {
    const t = schema.mailOutbox;
    await this.dbs.tenant(tenantId, async (tx) => {
      await tx.insert(t).values({ tenantId, ...message, driver: this.driver });
      await tx.execute(sql`
        DELETE FROM mail_outbox WHERE tenant_id = ${tenantId} AND id NOT IN (
          SELECT id FROM mail_outbox WHERE tenant_id = ${tenantId}
          ORDER BY at DESC LIMIT ${MailService.KEEP})`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter?.close();
  }
}
