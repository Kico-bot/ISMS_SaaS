/**
 * Änderungsprotokoll (ISO 27001 A.8.15 Protokollierung, A.5.16 Identitätsverwaltung).
 *
 * Die Fragen eines Auditors sind immer dieselben: Wer hat den Vorgang angefasst, wann, und
 * wer hat Register außer Haus gegeben. Und: lässt sich das Protokoll nachträglich glätten?
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_URL, prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let rita = '';
let riskId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

interface Entry {
  id: number;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  diff: { request?: Record<string, unknown>; query?: Record<string, unknown> } | null;
}

beforeAll(async () => {
  setTestEnv();
  await prepareTestDatabase();
  const { createApp } = await import('../src/app.factory');
  app = await createApp();
  await app.init();
  http = request(app.getHttpServer());

  const reg = await http
    .post('/api/v1/auth/register')
    .send({
      tenantName: 'Protokoll GmbH',
      tenantSlug: 'protokoll',
      email: 'carla@protokoll.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@protokoll.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

/** Das Protokoll wird nebenläufig geschrieben; kurz warten, bis der Eintrag steht. */
async function waitForEntry(token: string, match: (e: Entry) => boolean, attempts = 20): Promise<Entry> {
  for (let i = 0; i < attempts; i++) {
    const res = await http.get('/api/v1/audit-log?limit=200').set(bearer(token)).expect(200);
    const found = (res.body.rows as Entry[]).find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Eintrag ist nicht im Protokoll aufgetaucht');
}

describe('Änderungsprotokoll', () => {
  it('hält fest, wer einen Vorgang angelegt hat', async () => {
    const risk = await http
      .post('/api/v1/risks')
      .set(bearer(carla))
      .send({ title: 'Ausfall des Rechenzentrums' })
      .expect(201);
    riskId = risk.body.id;

    const entry = await waitForEntry(carla, (e) => e.entityType === 'risks' && e.entityId === riskId);
    expect(entry.action).toBe('create');
    expect(entry.actorName).toBe('Carla CISO');
    expect(entry.diff?.request?.title).toBe('Ausfall des Rechenzentrums');
  });

  it('führt die Spur eines einzelnen Vorgangs zusammen', async () => {
    await http
      .patch(`/api/v1/risks/${riskId}`)
      .set(bearer(carla))
      .send({ description: 'Stromausfall über mehrere Stunden' })
      .expect(200);
    await waitForEntry(carla, (e) => e.entityId === riskId && e.action === 'update');

    const res = await http.get(`/api/v1/audit-log/entity/risks/${riskId}`).set(bearer(carla)).expect(200);
    const actions = (res.body.rows as Entry[]).map((e) => e.action);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
    // Neueste zuerst.
    expect(actions[0]).toBe('update');
  });

  it('protokolliert Anmeldungen, aber niemals das Kennwort', async () => {
    await http
      .post('/api/v1/auth/login')
      .send({ email: 'rita@protokoll.test', password: 'rita-passwort-2026-lang', tenantSlug: 'protokoll' })
      .expect(200);

    const entry = await waitForEntry(carla, (e) => e.action === 'login' && e.actorName === 'Rita Reinhardt');
    // Kein Rumpf: eine Anmeldung führt nichts mit, was protokolliert gehörte.
    expect(entry.diff).toBeNull();
    expect(JSON.stringify(entry)).not.toContain('rita-passwort');
  });

  it('wertet einen Unterpfad als Änderung, nicht als Neuanlage', async () => {
    // Eine Bewertung wird angelegt — verändert wird damit aber das Risiko.
    await http
      .post(`/api/v1/risks/${riskId}/assessments`)
      .set(bearer(carla))
      .send({ stage: 'inherent', likelihood: 4, impact: 5 })
      .expect(201);

    const res = await http.get(`/api/v1/audit-log/entity/risks/${riskId}`).set(bearer(carla)).expect(200);
    const entries = res.body.rows as Entry[];
    expect(entries[0].action).toBe('update');
    // Angelegt wurde das Risiko genau einmal.
    expect(entries.filter((e) => e.action === 'create')).toHaveLength(1);
  });

  it('protokolliert Ausleitungen — ein Register außer Haus ist ein Ereignis', async () => {
    await http.get('/api/v1/exports/risks.csv').set(bearer(carla)).expect(200);

    const entry = await waitForEntry(carla, (e) => e.action === 'export');
    expect(entry.entityType).toBe('exports');
    expect(entry.entityId).toBe('risks.csv');
  });

  it('filtert nach Art, Handelnder und Zeitraum', async () => {
    const byType = await http.get('/api/v1/audit-log?entityType=risks').set(bearer(carla)).expect(200);
    expect((byType.body.rows as Entry[]).every((e) => e.entityType === 'risks')).toBe(true);
    expect(byType.body.total).toBeGreaterThanOrEqual(2);

    const byAction = await http.get('/api/v1/audit-log?action=login').set(bearer(carla)).expect(200);
    expect((byAction.body.rows as Entry[]).every((e) => e.action === 'login')).toBe(true);

    // Der heutige Tag ist einschließlich — sonst fände ein Filter „bis heute“ nichts.
    const today = new Date().toISOString().slice(0, 10);
    const byDate = await http
      .get(`/api/v1/audit-log?from=${today}&to=${today}`)
      .set(bearer(carla))
      .expect(200);
    expect(byDate.body.total).toBeGreaterThan(0);

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const future = await http.get(`/api/v1/audit-log?from=${tomorrow}`).set(bearer(carla)).expect(200);
    expect(future.body.total).toBe(0);
  });

  it('nennt die vorkommenden Arten und Handelnden', async () => {
    const res = await http.get('/api/v1/audit-log/facets').set(bearer(carla)).expect(200);
    expect((res.body.entityTypes as { entityType: string }[]).map((t) => t.entityType)).toContain('risks');
    expect((res.body.actors as { actorName: string }[]).map((a) => a.actorName)).toContain('Carla CISO');
  });

  it('verwehrt der Risk-Ownerin den Blick ins Protokoll', async () => {
    await http.get('/api/v1/audit-log').set(bearer(rita)).expect(403);
    await http.get('/api/v1/audit-log/facets').set(bearer(rita)).expect(403);
  });

  it('lässt sich von der Anwendungsrolle nicht nachträglich glätten', async () => {
    // Die Rechte hängen an der Rolle, nicht am Fachcode: selbst mit direktem SQL-Zugang
    // kann die Anwendung ihre eigenen Spuren nicht löschen.
    const pool = new Pool({ connectionString: APP_URL, max: 1 });
    try {
      await expect(pool.query('DELETE FROM audit_log')).rejects.toThrow(/permission denied/i);
      await expect(pool.query("UPDATE audit_log SET action = 'create'")).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await pool.end();
    }
  });
});
