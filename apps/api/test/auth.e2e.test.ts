import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATOR_URL, prepareTestDatabase, setTestEnv } from './setup';

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

describe('Sitzungserneuerung', () => {
  /** Holt das Refresh-Cookie aus einer Antwort. */
  const cookieOf = (res: request.Response): string => {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const c = (raw ?? []).find((v) => v.startsWith('isms_rt='));
    if (!c) throw new Error('Kein Refresh-Cookie in der Antwort');
    return c.split(';')[0]!;
  };

  it('rotiert das Refresh-Token bei jeder Erneuerung', async () => {
    const login = await http
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@demo.test', password: 'korrekt-pferd-batterie-1' })
      .expect(200);
    const first = cookieOf(login);

    const refreshed = await http.post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
    const second = cookieOf(refreshed);
    expect(second).not.toBe(first);
    expect(refreshed.body.accessToken).toBeTruthy();
  });

  it('meldet zwei gleichzeitig startende Tabs nicht ab', async () => {
    const login = await http
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@demo.test', password: 'korrekt-pferd-batterie-1' })
      .expect(200);
    const cookie = cookieOf(login);

    // Beide Tabs schicken dasselbe Cookie los, bevor das neue gesetzt ist.
    const [a, b] = await Promise.all([
      http.post('/api/v1/auth/refresh').set('Cookie', cookie),
      http.post('/api/v1/auth/refresh').set('Cookie', cookie),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // Und die Sitzung lebt danach weiter — die Familie wurde nicht gesperrt.
    await http.post('/api/v1/auth/refresh').set('Cookie', cookieOf(a)).expect(200);
  });

  it('sperrt die Sitzung, wenn ein altes Token später wiederverwendet wird', async () => {
    const login = await http
      .post('/api/v1/auth/login')
      .send({ email: 'ciso@demo.test', password: 'korrekt-pferd-batterie-1' })
      .expect(200);
    const stolen = cookieOf(login);
    const rotated = await http.post('/api/v1/auth/refresh').set('Cookie', stolen).expect(200);

    // Die Nachlauffrist künstlich überspringen: die Rotation wird zurückdatiert.
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: MIGRATOR_URL, max: 1 });
    try {
      await pool.query(
        "UPDATE refresh_token SET revoked_at = now() - interval '1 hour' WHERE revoked_at IS NOT NULL",
      );
    } finally {
      await pool.end();
    }

    await http.post('/api/v1/auth/refresh').set('Cookie', stolen).expect(401);
    // Die ganze Familie ist gesperrt — auch das zwischenzeitlich gültige Token.
    await http.post('/api/v1/auth/refresh').set('Cookie', cookieOf(rotated)).expect(401);
  });
});
