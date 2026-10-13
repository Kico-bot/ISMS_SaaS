import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

/** Gemeinsame App-Konfiguration für Server und Tests. */
export async function createApp(): Promise<INestApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.NODE_ENV === 'test' ? ['error', 'warn'] : ['log', 'error', 'warn'],
  });
  app.setGlobalPrefix('api/v1');
  // Ohne diese Angabe stünde hinter nginx in jedem Protokolleintrag die Adresse des Proxys.
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_BASE_URL, credentials: true });
  app.enableShutdownHooks();

  const doc = new DocumentBuilder().setTitle('ISMS SaaS API').setVersion('0.1').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));
  return app;
}
