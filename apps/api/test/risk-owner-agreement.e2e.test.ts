/**
 * Zustimmung der verantwortlichen Person zu Behandlung und Restrisiko (ISO 27001 Kap. 6.1.3 f).
 * Sie kommt zur Übernahme durch die Leitung hinzu: Mit Konto stimmt nur die Person selbst zu,
 * ohne Konto trägt die ISMS-Leitung ein, wie die Zustimmung erteilt wurde. Jede Änderung an
 * Bewertung, Behandlung oder Maßnahmen hebt sie auf; eine bestätigende Überprüfung nicht.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_URL, prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let olaf = '';
let tenantId = '';
let carlaUserId = '';
let olafPersonId = '';
let wenzelId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

interface Detail {
  ownerAgreedAt: string | null;
  ownerAgreedByName: string | null;
  ownerAgreementNote: string | null;
  ownerAgreementSnapshot: { likelihood: number; impact: number; treatment: string; onBehalf: boolean } | null;
  ownerHasLogin: boolean;
}

const detail = async (id: string) =>
  (await http.get(`/api/v1/risks/${id}`).set(bearer(carla)).expect(200)).body as Detail;

async function createRisk(title: string, ownerPersonId: string, treatment: string | null = 'mitigate') {
  const r = await http
    .post('/api/v1/risks')
    .set(bearer(carla))
    .send({ title, ownerPersonId, treatment })
    .expect(201);
  return r.body.id as string;
}

const assess = (id: string, likelihood: number, impact: number) =>
  http.post(`/api/v1/risks/${id}/assessments`).set(bearer(carla)).send({ likelihood, impact }).expect(201);

async function createMeasure(title: string) {
  return (await http.post('/api/v1/measures').set(bearer(carla)).send({ title }).expect(201)).body
    .id as string;
}

async function riskTreatmentOk() {
  const r = await http.get('/api/v1/dashboard/certification-readiness').set(bearer(carla)).expect(200);
  return (r.body.evidence as { key: string; ok: boolean }[]).find((e) => e.key === 'riskTreatment')!.ok;
}

async function download(path: string, token: string): Promise<Buffer> {
  const res = await http
    .get(path)
    .set(bearer(token))
    .buffer(true)
    .parse((stream, callback) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      stream.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return res.body as Buffer;
}

function zipRead(buf: Buffer, name: string): string {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const method = buf.readUInt16LE(p + 10);
      const size = buf.readUInt32LE(p + 20);
      const local = buf.readUInt32LE(p + 42);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.subarray(start, start + size);
      return (method === 0 ? raw : inflateRawSync(raw)).toString('utf8');
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  throw new Error(`Eintrag ${name} nicht im Paket`);
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
      tenantName: 'Zustimmung GmbH',
      tenantSlug: 'zustimmung',
      email: 'carla@zustimmung.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla Leitung',
    })
    .expect(201);
  carla = reg.body.accessToken;
  const me = (await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200)).body;
  tenantId = me.tenantId;
  carlaUserId = me.userId;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'olaf@zustimmung.test', displayName: 'Olaf Owner', roleKeys: ['risk_owner'] })
    .expect(201);
  olaf = (
    await http
      .post('/api/v1/auth/accept-invite')
      .send({ token: invite.body.inviteToken, password: 'owner-passwort-2026' })
      .expect(200)
  ).body.accessToken;
  olafPersonId = (await http.get('/api/v1/auth/me').set(bearer(olaf)).expect(200)).body.personId;

  wenzelId = (
    await http.post('/api/v1/persons').set(bearer(carla)).send({ name: 'Wenzel ohne Konto' }).expect(201)
  ).body.id;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Kernnachweis „behandelte Risiken“', () => {
  it('zählt ein hohes Risiko erst, wenn die verantwortliche Person zugestimmt hat', async () => {
    const id = await createRisk('Ausfall der Leitwarte', olafPersonId);
    await assess(id, 4, 4);
    expect(await riskTreatmentOk()).toBe(false);

    const m = await createMeasure('Zweite Leitwarte');
    await http.post(`/api/v1/risks/${id}/measures`).set(bearer(carla)).send({ measureId: m }).expect(204);
    // Behandelt, aber ohne Zustimmung: noch nicht erfüllt, und die Aufgabe sagt warum.
    expect(await riskTreatmentOk()).toBe(false);
    const tasks = (await http.get('/api/v1/programmes/tasks').set(bearer(carla)).expect(200)).body as {
      key: string;
      count: number;
    }[];
    expect(tasks.find((t) => t.key === 'risksAwaitingAgreement')?.count).toBe(1);

    await http.post(`/api/v1/risks/${id}/owner-agreement`).set(bearer(olaf)).send({}).expect(201);
    expect(await riskTreatmentOk()).toBe(true);
  });
});

describe('Zustimmung durch die verantwortliche Person', () => {
  let id = '';

  it('gibt nur die Person selbst, nie die ISMS-Leitung an ihrer Stelle', async () => {
    id = await createRisk('Phishing gegen die Buchhaltung', olafPersonId);
    await assess(id, 3, 3);
    const refused = await http.post(`/api/v1/risks/${id}/owner-agreement`).set(bearer(carla)).send({});
    expect(refused.status).toBe(403);

    await http.post(`/api/v1/risks/${id}/owner-agreement`).set(bearer(olaf)).send({}).expect(201);
    const d = await detail(id);
    expect(d.ownerAgreedAt).not.toBeNull();
    expect(d.ownerAgreedByName).toBe('Olaf Owner');
    expect(d.ownerHasLogin).toBe(true);
    expect(d.ownerAgreementSnapshot).toMatchObject({ likelihood: 3, impact: 3, treatment: 'mitigate' });

    const list = (await http.get('/api/v1/risks').set(bearer(olaf)).expect(200)).body.items as {
      id: string;
      ownerAgreedAt: string | null;
    }[];
    expect(list.find((r) => r.id === id)?.ownerAgreedAt).not.toBeNull();
  });

  it('bleibt bei einer Überprüfung mit denselben Werten stehen', async () => {
    await assess(id, 3, 3);
    expect((await detail(id)).ownerAgreedAt).not.toBeNull();
  });

  it('entfällt bei neuer Bewertung, anderer Behandlung und geänderten Maßnahmen', async () => {
    await assess(id, 2, 3);
    expect((await detail(id)).ownerAgreedAt).toBeNull();

    await http.post(`/api/v1/risks/${id}/owner-agreement`).set(bearer(olaf)).send({}).expect(201);
    await http.patch(`/api/v1/risks/${id}`).set(bearer(carla)).send({ treatment: 'transfer' }).expect(200);
    expect((await detail(id)).ownerAgreedAt).toBeNull();

    await http.post(`/api/v1/risks/${id}/owner-agreement`).set(bearer(olaf)).send({}).expect(201);
    const m = await createMeasure('Phishing-Simulation');
    await http.post(`/api/v1/risks/${id}/measures`).set(bearer(carla)).send({ measureId: m }).expect(204);
    expect((await detail(id)).ownerAgreedAt).toBeNull();

    await http.post(`/api/v1/risks/${id}/owner-agreement`).set(bearer(olaf)).send({}).expect(201);
    await http.delete(`/api/v1/risks/${id}/measures/${m}`).set(bearer(carla)).expect(204);
    expect((await detail(id)).ownerAgreedAt).toBeNull();
  });

  it('verlangt Bewertung und Behandlung', async () => {
    const open = await createRisk('Noch offen', olafPersonId, null);
    await http.post(`/api/v1/risks/${open}/owner-agreement`).set(bearer(olaf)).send({}).expect(409);
  });
});

describe('Zustimmung im Auftrag einer Person ohne Konto', () => {
  let id = '';
  let fileId = '';

  it('trägt die ISMS-Leitung mit Angabe und Beleg ein, nie die Rolle Risk-Owner', async () => {
    id = await createRisk('Ausfall der Fernwirkstrecke', wenzelId);
    await assess(id, 2, 3);
    await http
      .post(`/api/v1/risks/${id}/owner-agreement`)
      .set(bearer(olaf))
      .send({ note: 'per Zuruf auf dem Flur' })
      .expect(403);
    await http.post(`/api/v1/risks/${id}/owner-agreement`).set(bearer(carla)).send({}).expect(400);

    fileId = (
      await http
        .post('/api/v1/files')
        .set(bearer(carla))
        .attach('file', Buffer.from('Ich stimme dem Plan zu. Wenzel'), {
          filename: 'zustimmung-wenzel.txt',
          contentType: 'text/plain',
        })
        .expect(201)
    ).body.id;
    await http
      .post(`/api/v1/risks/${id}/owner-agreement`)
      .set(bearer(carla))
      .send({ note: 'Per E-Mail vom 3.12.', fileId })
      .expect(201);
    const d = await detail(id);
    expect(d.ownerHasLogin).toBe(false);
    expect(d.ownerAgreedByName).toBe('Carla Leitung');
    expect(d.ownerAgreementNote).toBe('Per E-Mail vom 3.12.');
    expect(d.ownerAgreementSnapshot?.onBehalf).toBe(true);
  });

  it('hält den Beleg fest: Löschen wird verweigert', async () => {
    await http.delete(`/api/v1/files/${fileId}`).set(bearer(carla)).expect(409);
  });

  it('steht im Auditpaket mit Datum, Eintragendem, Angabe und Datei', async () => {
    const zip = await download('/api/v1/exports/audit-package.zip', carla);
    const csv = zipRead(zip, '04-risiken/risikoregister.csv');
    const [header = '', ...rows] = csv.replace(/^﻿/, '').split('\r\n');
    const cols = header.split(';');
    for (const c of ['Zustimmung der Verantwortlichen am', 'eingetragen durch', 'wie erteilt'])
      expect(cols).toContain(c);
    const row = rows.find((r) => r.includes('Ausfall der Fernwirkstrecke'))!.split(';');
    expect(row[cols.indexOf('eingetragen durch')]).toBe('Carla Leitung');
    expect(row[cols.indexOf('wie erteilt')]).toBe('Per E-Mail vom 3.12.');
    const own = rows.find((r) => r.includes('Ausfall der Leitwarte'))!.split(';');
    expect(own[cols.indexOf('wie erteilt')]).toBe('selbst in der Anwendung');

    const manifest = zipRead(zip, '15-dateien/dateiverzeichnis.csv');
    expect(manifest).toContain('Zustimmung zur Risikobehandlung');
  });
});

describe('Datenbank-Trigger trg_risk_owner_agreement', () => {
  it('lehnt auch als App-Rolle direkt eine Zustimmung durch eine andere Person ab', async () => {
    const olafRisk = await createRisk('Direkter Versuch', olafPersonId);
    await assess(olafRisk, 2, 2);
    const wenzelRisk = await createRisk('Direkter Versuch ohne Angabe', wenzelId);
    await assess(wenzelRisk, 2, 2);

    const pool = new Pool({ connectionString: APP_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query('SAVEPOINT a');
      await expect(
        client.query('UPDATE risk SET owner_agreed_at = now(), owner_agreed_by_user_id = $1 WHERE id = $2', [
          carlaUserId,
          olafRisk,
        ]),
      ).rejects.toThrow(/sod_violation/);
      await client.query('ROLLBACK TO SAVEPOINT a');
      await expect(
        client.query('UPDATE risk SET owner_agreed_at = now(), owner_agreed_by_user_id = $1 WHERE id = $2', [
          carlaUserId,
          wenzelRisk,
        ]),
      ).rejects.toThrow(/sod_violation/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });
});
