/**
 * Begrenzung der Anmeldeversuche: Passwortraten von einer Adresse und verteiltes Raten gegen ein
 * Konto laufen gegen eine Wand aus 429-Antworten, bevor das Kennwort überhaupt geprüft wird.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from '../src/kernel/http/rate-limit';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;

beforeAll(async () => {
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = '3';
  process.env.AUTH_RATE_LIMIT_PER_ACCOUNT = '5';
  // Wie hinter dem nginx der Suite: die Adresse kommt aus X-Forwarded-For.
  process.env.TRUST_PROXY = '1';
  setTestEnv();
  await prepareTestDatabase();
  const { createApp } = await import('../src/app.factory');
  app = await createApp();
  await app.init();
}, 120_000);

afterAll(async () => {
  await app?.close();
  delete process.env.AUTH_RATE_LIMIT_PER_MINUTE;
  delete process.env.AUTH_RATE_LIMIT_PER_ACCOUNT;
  delete process.env.TRUST_PROXY;
});

const login = (email: string, ip: string) =>
  request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password: 'falsches-kennwort-123' });

describe('Begrenzung der Anmeldeversuche', () => {
  it('lässt je Adresse drei Versuche pro Minute zu, dann 429 mit Retry-After', async () => {
    for (let i = 0; i < 3; i++) expect((await login(`a${i}@raten.test`, '10.0.0.1')).status).toBe(401);
    const blocked = await login('a9@raten.test', '10.0.0.1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.title).toBe('Zu viele Versuche');
  });

  it('begrenzt ein Konto auch dann, wenn die Versuche von wechselnden Adressen kommen', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login('opfer@raten.test', `10.0.1.${i}`)).status).toBe(401);
    }
    expect((await login('opfer@raten.test', '10.0.1.99')).status).toBe(429);
    // Ein anderes Konto von einer frischen Adresse ist davon nicht betroffen.
    expect((await login('jemand@raten.test', '10.0.2.1')).status).toBe(401);
  });

  it('zählt den Zähler im Zeitfenster und gibt danach wieder frei', () => {
    let t = 0;
    const limiter = new FixedWindowLimiter(2, 1000, () => t);
    expect(limiter.hit('x').allowed).toBe(true);
    expect(limiter.hit('x').allowed).toBe(true);
    expect(limiter.hit('x').allowed).toBe(false);
    expect(limiter.hit('y').allowed).toBe(true);
    t = 1000;
    expect(limiter.hit('x').allowed).toBe(true);
  });
});
