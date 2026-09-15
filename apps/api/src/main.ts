import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT);
  new Logger('Bootstrap').log(`API läuft auf ${env.API_BASE_URL}/api/v1 · Docs: ${env.API_BASE_URL}/api/docs`);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
