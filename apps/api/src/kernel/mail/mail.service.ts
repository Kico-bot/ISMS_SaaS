import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { loadEnv } from '../../config/env';

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
   * Die zuletzt erzeugten Nachrichten, nur im Speicher. Sie machen im Betrieb ohne SMTP
   * nachvollziehbar, was erzeugt wurde, und erlauben den Tests, den Inhalt zu prüfen.
   */
  private readonly recent: SentMail[] = [];
  private static readonly KEEP = 50;

  constructor() {
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

  async send(message: MailMessage): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.from, ...message });
    } else {
      this.log.log(`[${this.driver}] an ${message.to}: ${message.subject}`);
    }
    this.remember(message);
  }

  /**
   * Mehrere Nachrichten nacheinander. Bewusst seriell: ein Mailserver mag es nicht, wenn
   * hundert Verbindungen gleichzeitig aufschlagen, und eine fehlgeschlagene Zustellung darf
   * die übrigen nicht mitreißen.
   */
  async sendAll(messages: MailMessage[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const m of messages) {
      try {
        await this.send(m);
        sent += 1;
      } catch (e) {
        failed += 1;
        this.log.warn(`Zustellung an ${m.to} fehlgeschlagen: ${(e as Error).message}`);
      }
    }
    return { sent, failed };
  }

  /** Die zuletzt erzeugten Nachrichten, neueste zuerst. */
  outbox(limit = 20): SentMail[] {
    return this.recent.slice(-limit).reverse();
  }

  get isDelivering(): boolean {
    return this.driver === 'smtp';
  }

  private remember(message: MailMessage): void {
    this.recent.push({ ...message, at: new Date().toISOString(), driver: this.driver });
    if (this.recent.length > MailService.KEEP) this.recent.splice(0, this.recent.length - MailService.KEEP);
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter?.close();
  }
}
