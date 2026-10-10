import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { loadEnv } from '../../config/env';

/**
 * Hintergrundaufträge über pg-boss — die Warteschlange liegt in derselben PostgreSQL-Datenbank.
 * Kein Redis, kein zweiter Dienst, keine weiteren Kosten; der Zeitplan überlebt einen Neustart,
 * weil er in Tabellen steht und nicht in einem `setInterval`.
 *
 * pg-boss legt dafür ein eigenes Schema an und braucht DDL-Rechte. Die hat `isms_app` bewusst
 * nicht, deshalb verbindet sich der Auftragsdienst mit `DATABASE_URL_MIGRATOR`. Fachdaten liest
 * er trotzdem über den normalen Weg, also als `isms_app` und unter der Zeilensicherheit — die
 * Warteschlange ist Infrastruktur, keine Mandantendaten.
 */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly log = new Logger('Jobs');
  private boss?: PgBoss;

  async start(): Promise<PgBoss> {
    if (this.boss) return this.boss;
    const env = loadEnv();
    const connectionString = env.DATABASE_URL_MIGRATOR ?? env.DATABASE_URL;
    if (!env.DATABASE_URL_MIGRATOR) {
      this.log.warn(
        'DATABASE_URL_MIGRATOR ist nicht gesetzt. pg-boss versucht sein Schema mit der Anwendungsrolle anzulegen. Das schlägt fehl, wenn sie keine DDL-Rechte hat.',
      );
    }
    const boss = new PgBoss({ connectionString, schema: 'pgboss' });
    boss.on('error', (e) => this.log.error(`pg-boss: ${e.message}`));
    await boss.start();
    this.boss = boss;
    return boss;
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true });
    this.boss = undefined;
  }
}
