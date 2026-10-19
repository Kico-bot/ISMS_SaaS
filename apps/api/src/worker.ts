import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { JobsService } from './kernel/jobs/jobs.service';
import {
  berlinToday,
  DIGEST_QUEUE,
  DIGEST_TENANT_QUEUE,
  enqueueTenantDigests,
  type TenantDigestJob,
} from './modules/notifications/digest-jobs';
import { NotificationsService } from './modules/notifications/notifications.service';

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
    log.warn('JOBS_ENABLED ist nicht gesetzt, der Hintergrundprozess beendet sich.');
    return;
  }

  // Kein HTTP: der Worker braucht nur die Dienste, nicht den Server.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  const jobs = app.get(JobsService);
  const notifications = app.get(NotificationsService);
  const boss = await jobs.start();

  await boss.createQueue(DIGEST_QUEUE);
  // `exclusive`: je Schlüssel aus Mandant und Datum höchstens ein wartender oder laufender Auftrag.
  await boss.createQueue(DIGEST_TENANT_QUEUE, { policy: 'exclusive' });

  // Der Zeitplan verteilt nur. Jeder Mandant läuft als eigener Auftrag, damit eine Wiederholung
  // nach Absturz oder Zeitüberschreitung nicht alle Mandanten noch einmal anschreibt.
  await boss.work(DIGEST_QUEUE, async () => {
    const tenants = await notifications.activeTenants();
    await enqueueTenantDigests(
      boss,
      tenants.map((t) => t.id),
      berlinToday(),
    );
  });

  await boss.work<TenantDigestJob>(DIGEST_TENANT_QUEUE, async (jobs) => {
    for (const { data } of jobs) {
      // Ein Fehler wirft weiter: pg-boss wiederholt dann nur diesen Mandanten, und
      // `digest_run` verhindert, dass ein schon bedienter Tag doppelt verschickt wird.
      const result = await notifications.sendDigests(data.tenantId, undefined, data.runDate);
      if (result.sent > 0 || result.failed > 0) {
        log.log(
          `${data.tenantId} (${data.runDate}): ${result.sent} erzeugt, ${result.failed} fehlgeschlagen`,
        );
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
