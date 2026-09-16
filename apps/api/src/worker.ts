import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { JobsService } from './kernel/jobs/jobs.service';
import { NotificationsService } from './modules/notifications/notifications.service';

const DIGEST_QUEUE = 'deadline-digest';

/**
 * Der Hintergrundprozess. Er läuft neben der API (`pnpm --filter @isms/api worker`) und macht
 * genau eine Sache: werktags die Wiedervorlage je Person verschicken.
 *
 * Getrennt von der API, weil ein langsamer Mailserver keine HTTP-Anfrage aufhalten soll und
 * weil sich beides unabhängig neu starten lässt. Ohne `JOBS_ENABLED=true` beendet sich der
 * Prozess sofort wieder — sonst liefe in jeder Testumgebung ein Zeitplan mit.
 */
async function bootstrap() {
  const log = new Logger('Worker');
  const env = loadEnv();
  if (!env.JOBS_ENABLED) {
    log.warn('JOBS_ENABLED ist nicht gesetzt — der Hintergrundprozess beendet sich.');
    return;
  }

  // Kein HTTP: der Worker braucht nur die Dienste, nicht den Server.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  const jobs = app.get(JobsService);
  const notifications = app.get(NotificationsService);
  const boss = await jobs.start();

  await boss.createQueue(DIGEST_QUEUE);
  await boss.work(DIGEST_QUEUE, async () => {
    for (const tenant of await notifications.activeTenants()) {
      try {
        const result = await notifications.sendDigests(tenant.id);
        if (result.sent > 0 || result.failed > 0) {
          log.log(`${tenant.name}: ${result.sent} erzeugt, ${result.failed} fehlgeschlagen`);
        }
      } catch (e) {
        // Ein Mandant mit fehlerhaften Daten darf die übrigen nicht um ihre Erinnerung bringen.
        log.error(`${tenant.name}: ${(e as Error).message}`);
      }
    }
  });

  await boss.schedule(DIGEST_QUEUE, env.DIGEST_CRON, undefined, { tz: 'Europe/Berlin' });
  log.log(`Wiedervorlage-Erinnerung eingeplant: ${env.DIGEST_CRON} (Europe/Berlin)`);

  const stop = async () => {
    log.log('Beende …');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
