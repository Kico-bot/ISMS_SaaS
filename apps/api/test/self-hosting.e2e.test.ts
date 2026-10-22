/**
 * Eigener Betrieb: Auf einem selbst betriebenen Server legt nur die erste Person einen Mandanten
 * an (`REGISTRATION=first`), danach ist die Anmeldeseite eine reine Anmeldeseite. Einladungen
 * gehen per E-Mail an die eingeladene Person, mit dem Link auf die öffentliche Adresse.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let token = '';

const firstTenant = {
  tenantName: 'Eigenbetrieb GmbH',
  tenantSlug: 'eigenbetrieb',
  email: 'leitung@eigenbetrieb.test',
  password: 'korrekt-pferd-batterie-1',
  displayName: 'Lea Leitung',
};

beforeAll(async () => {
  setTestEnv();
  process.env.REGISTRATION = 'first';
  process.env.WEB_BASE_URL = 'https://isms.eigenbetrieb.test';
  await prepareTestDatabase();
  const { loadEnv } = await import('../src/config/env');
  loadEnv({ REGISTRATION: 'first', WEB_BASE_URL: 'https://isms.eigenbetrieb.test' });
  const { createApp } = await import('../src/app.factory');
  app = await createApp();
  await app.init();
  http = request(app.getHttpServer());
}, 240_000);

afterAll(async () => {
  await app?.close();
  delete process.env.REGISTRATION;
  delete process.env.WEB_BASE_URL;
});

describe('Registrierung auf einem eigenen Server', () => {
  it('bietet „Mandant anlegen“ an, solange es noch keinen Mandanten gibt', async () => {
    const res = await http.get('/api/v1/auth/config').expect(200);
    expect(res.body).toEqual({ registration: true });
  });

  it('lässt die erste Person den Mandanten anlegen und schließt danach', async () => {
    const res = await http.post('/api/v1/auth/register').send(firstTenant).expect(201);
    token = res.body.accessToken;
    expect((await http.get('/api/v1/auth/config').expect(200)).body).toEqual({ registration: false });

    const second = await http
      .post('/api/v1/auth/register')
      .send({ ...firstTenant, tenantSlug: 'fremd', tenantName: 'Fremd AG', email: 'x@fremd.test' })
      .expect(403);
    expect(second.body.title).toMatch(/Mandanten/);
  });
});

describe('Einladung per E-Mail', () => {
  it('schickt der eingeladenen Person den Link auf die öffentliche Adresse', async () => {
    const res = await http
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'auditorin@eigenbetrieb.test', displayName: 'Ada Auditorin', roleKeys: ['auditor'] })
      .expect(201);
    expect(res.body.inviteToken).toBeTruthy();
    // Treiber `log` stellt nichts zu: die Oberfläche zeigt dann den Link zum Weitergeben.
    expect(res.body.mailSent).toBe(false);

    const outbox = await http
      .get('/api/v1/notifications/outbox')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const mail = (outbox.body.messages as { to: string; subject: string; text: string }[]).find(
      (m) => m.to === 'auditorin@eigenbetrieb.test',
    );
    expect(mail?.subject).toContain('Eigenbetrieb GmbH');
    expect(mail?.text).toContain(`https://isms.eigenbetrieb.test/einladung?token=${res.body.inviteToken}`);
    expect(mail?.text).toContain('Lea Leitung');
  });
});
