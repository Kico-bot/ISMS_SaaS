import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT);
  const docs = env.NODE_ENV === 'production' ? '' : ` · Docs: ${env.API_BASE_URL}/api/docs`;
  new Logger('Bootstrap').log(`API läuft auf ${env.API_BASE_URL}/api/v1${docs}`);
  // Produktion ohne `Secure`-Cookie heißt meist: kein TLS davor. Dann wandern Kennwörter und
  // Token im Klartext. Für eine Vorführung über http://localhost ist das gewollt, sonst nicht.
  if (env.NODE_ENV === 'production' && env.COOKIE_SECURE === false) {
    new Logger('Sicherheit').warn(
      'COOKIE_SECURE=false: Das Refresh-Cookie geht auch über unverschlüsseltes http. Im Betrieb TLS davorsetzen und COOKIE_SECURE=true setzen.',
    );
  }
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
