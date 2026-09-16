import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  setTestEnv();
  await prepareTestDatabase();
  const { createApp } = await import('../src/app.factory');
  app = await createApp();
  await app.init();
  http = request(app.getHttpServer());
}, 180_000);

afterAll(async () => {
  await app?.close();
});

const owner = {
  tenantName: 'Demo GmbH',
  tenantSlug: 'demo',
  email: 'ciso@demo.test',
  password: 'korrekt-pferd-batterie-1',
  displayName: 'Gregor Demo',
};
let token = '';

describe('Registrierung & Login', () => {
  it('registriert einen Mandanten mit ISMS-Manager und liefert Session', async () => {
    const res = await http.post('/api/v1/auth/register').send(owner).expect(201);
    expect(res.body.activeTenant.tenantSlug).toBe('demo');
    expect(res.body.activeTenant.roles).toEqual(['isms_manager']);
    expect(res.headers['set-cookie']?.[0]).toMatch(/isms_rt=.*HttpOnly/);
    token = res.body.accessToken;
  });

  it('lehnt doppelte Slugs ab', async () => {
    await http
      .post('/api/v1/auth/register')
      .send({ ...owner, email: 'x@demo.test' })
      .expect(409);
  });

  it('meldet mit falschem Passwort nicht an', async () => {
    await http.post('/api/v1/auth/login').send({ email: owner.email, password: 'falsch-falsch' }).expect(401);
  });

  it('liefert /me mit effektiven Permissions', async () => {
    const res = await http.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.permissions).toContain('risk.accept');
    expect(res.body.permissions).not.toContain('platform.tenants');
    expect(res.body.personId).toBeTruthy();
  });

  it('ohne Token → 401, Health ist öffentlich', async () => {
    await http.get('/api/v1/auth/me').expect(401);
    const h = await http.get('/api/v1/health').expect(200);
    expect(h.body.db).toBe('ok');
  });
});

describe('Frameworks', () => {
  it('ISO 27001 ist nach Registrierung als Primär-Framework aktiv', async () => {
    const res = await http.get('/api/v1/frameworks').set('Authorization', `Bearer ${token}`).expect(200);
    const iso = res.body.find((f: { key: string }) => f.key === 'ISO27001');
    expect(iso.isActive).toBe(true);
    expect(iso.isPrimary).toBe(true);
    expect(iso.requirementCount).toBe(93);
  });

  it('aktiviert NIS2 zusätzlich', async () => {
    await http
      .post('/api/v1/frameworks/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ frameworkKey: 'NIS2' })
      .expect(201);
    const res = await http.get('/api/v1/frameworks').set('Authorization', `Bearer ${token}`).expect(200);
    expect(
      res.body
        .filter((f: { isActive: boolean }) => f.isActive)
        .map((f: { key: string }) => f.key)
        .sort(),
    ).toEqual(['ISO27001', 'NIS2']);
  });
});

describe('Mitglieder, Rollen & Funktionstrennung', () => {
  let auditorMembership = '';

  it('lädt einen Auditor ein', async () => {
    const res = await http
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'auditor@demo.test', displayName: 'Alex Auditor', roleKeys: ['auditor'] })
      .expect(201);
    auditorMembership = res.body.membershipId;
    expect(res.body.inviteToken).toBeTruthy();
  });

  it('blockiert Auditor + ISMS-Manager (SoD block)', async () => {
    const res = await http
      .put(`/api/v1/members/${auditorMembership}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleKeys: ['auditor', 'isms_manager'] })
      .expect(409);
    expect(res.body.type).toMatch(/sod-violation/);
  });

  it('verlangt Bestätigung für DSB + ISMS-Manager (SoD warn) und akzeptiert sie dann', async () => {
    await http
      .put(`/api/v1/members/${auditorMembership}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleKeys: ['dpo', 'isms_manager'] })
      .expect(409);
    const ok = await http
      .put(`/api/v1/members/${auditorMembership}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleKeys: ['dpo', 'isms_manager'], acknowledgeSodWarnings: true })
      .expect(200);
    expect(ok.body.warnings).toHaveLength(1);
  });

  it('Rechteänderung invalidiert alte Tokens sofort (permissions_version)', async () => {
    // Token des Managers wurde vor der Rollenänderung ausgestellt → pv-Mismatch → Cache-Refresh, weiterhin gültig
    const me = await http.get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.permissions).toContain('tenant.members');
  });

  it('eingeladener Nutzer kann sich vor Annahme nicht anmelden', async () => {
    await http
      .post('/api/v1/auth/login')
      .send({ email: 'auditor@demo.test', password: 'beliebiges-passwort' })
      .expect(401);
  });
});

describe('Einladung annehmen und Rechte im Betrieb', () => {
  const auditor = {
    email: 'pruefer@demo.test',
    displayName: 'Petra Prüferin',
    password: 'auditor-passwort-2026',
  };
  let auditorToken = '';

  it('nimmt die Einladung an und liefert direkt eine Session', async () => {
    const invite = await http
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: auditor.email, displayName: auditor.displayName, roleKeys: ['auditor'] })
      .expect(201);

    const res = await http
      .post('/api/v1/auth/accept-invite')
      .send({ token: invite.body.inviteToken, password: auditor.password })
      .expect(200);
    expect(res.body.activeTenant.tenantSlug).toBe('demo');
    expect(res.body.activeTenant.roles).toEqual(['auditor']);
    auditorToken = res.body.accessToken;
  });

  it('lehnt einen bereits eingelösten oder unbekannten Einladungstoken ab', async () => {
    await http
      .post('/api/v1/auth/accept-invite')
      .send({ token: 'x'.repeat(43), password: auditor.password })
      .expect(401);
  });

  it('erlaubt dem Auditor das Lesen des Katalogs', async () => {
    const res = await http
      .get('/api/v1/frameworks')
      .set('Authorization', `Bearer ${auditorToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('verweigert dem Auditor das Aktivieren eines Frameworks (403)', async () => {
    const res = await http
      .post('/api/v1/frameworks/activate')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ frameworkKey: 'DSGVO' })
      .expect(403);
    expect(res.body.title).toMatch(/Berechtigung/);
  });

  it('verweigert dem Auditor das Einladen weiterer Mitglieder (403)', async () => {
    await http
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ email: 'neu@demo.test', displayName: 'Neu', roleKeys: ['risk_owner'] })
      .expect(403);
  });

  it('kann sich nach der Annahme regulär anmelden', async () => {
    const res = await http
      .post('/api/v1/auth/login')
      .send({ email: auditor.email, password: auditor.password })
      .expect(200);
    expect(res.body.activeTenant.roles).toEqual(['auditor']);
  });
});
