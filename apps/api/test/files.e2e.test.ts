/**
 * Nachweisdateien und Nachweisregister.
 *
 * Zwei Dinge sind hier sicherheitsrelevant und werden entsprechend geprüft: eine hochgeladene
 * Datei darf niemals im Ursprung der Anwendung gerendert werden, und ein Nachweis, an dem
 * noch etwas hängt, darf nicht stillschweigend verschwinden.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let storageDir = '';
let carla = '';
let rita = '';
let measureId = '';
let fileId = '';
let evidenceId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  setTestEnv();
  storageDir = mkdtempSync(join(tmpdir(), 'isms-files-'));
  process.env.STORAGE_LOCAL_DIR = storageDir;
  await prepareTestDatabase();
  const { createApp } = await import('../src/app.factory');
  app = await createApp();
  await app.init();
  http = request(app.getHttpServer());

  const reg = await http
    .post('/api/v1/auth/register')
    .send({
      tenantName: 'Nachweis AG',
      tenantSlug: 'nachweis',
      email: 'carla@nachweis.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@nachweis.test', displayName: 'Rita Reinhardt', roleKeys: ['auditor'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;

  const m = await http
    .post('/api/v1/measures')
    .set(bearer(carla))
    .send({ title: 'Quartalsweise Rezertifizierung der Zugriffsrechte', status: 'implemented' })
    .expect(201);
  measureId = m.body.id;
}, 240_000);

afterAll(async () => {
  await app?.close();
  if (storageDir) rmSync(storageDir, { recursive: true, force: true });
});

describe('Dateiablage', () => {
  it('nimmt einen Beleg entgegen und hält seinen Hash fest', async () => {
    const res = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('Protokoll der Rezertifizierung Q3/2026'), {
        filename: 'rezertifizierung-q3.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(res.body.filename).toBe('rezertifizierung-q3.txt');
    expect(res.body.sha256).toHaveLength(64);
    expect(res.body.deduplicated).toBe(false);
    fileId = res.body.id;
  });

  it('legt denselben Inhalt kein zweites Mal ab', async () => {
    const res = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('Protokoll der Rezertifizierung Q3/2026'), {
        filename: 'kopie.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(res.body.deduplicated).toBe(true);
    expect(res.body.id).toBe(fileId);
  });

  it('weist Dateitypen ab, die Skripte tragen können', async () => {
    const res = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'boes.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
    expect(res.body.title).toContain('image/svg+xml');
  });

  it('liefert den Beleg nur als Anhang aus, nie eingebettet', async () => {
    const res = await http.get(`/api/v1/files/${fileId}`).set(bearer(carla)).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('rezertifizierung-q3.txt');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.text).toContain('Rezertifizierung Q3/2026');
  });

  it('entschärft Pfadanteile im Dateinamen', async () => {
    const res = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('anderer Inhalt'), {
        filename: '../../etc/passwort.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(res.body.filename).toBe('passwort.txt');
  });

  it('lässt Rollen ohne Schreibrecht nichts hochladen, aber lesen', async () => {
    await http
      .post('/api/v1/files')
      .set(bearer(rita))
      .attach('file', Buffer.from('fremd'), { filename: 'fremd.txt', contentType: 'text/plain' })
      .expect(403);
    await http.get(`/api/v1/files/${fileId}`).set(bearer(rita)).expect(200);
  });
});

describe('Nachweisregister', () => {
  it('weist einen Nachweis ohne Datei und ohne Verweis zurück', async () => {
    const res = await http
      .post('/api/v1/evidence')
      .set(bearer(carla))
      .send({ title: 'Leerer Nachweis' })
      .expect(400);
    expect(res.body.detail).toContain('Datei oder einen Verweis');
  });

  it('nimmt einen Nachweis mit Datei und Gültigkeit auf', async () => {
    const res = await http
      .post('/api/v1/evidence')
      .set(bearer(carla))
      .send({
        title: 'Rezertifizierungsprotokoll Q3/2026',
        description: 'Stichprobe über 10 privilegierte Konten',
        fileId,
        collectedAt: '2026-09-15',
        validUntil: '2026-12-31',
      })
      .expect(201);
    expect(res.body.fileId).toBe(fileId);
    evidenceId = res.body.id;
  });

  it('verknüpft den Nachweis mit der Maßnahme', async () => {
    const res = await http
      .post(`/api/v1/evidence/measure/${measureId}`)
      .set(bearer(carla))
      .send({ evidenceId })
      .expect(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].filename).toBe('rezertifizierung-q3.txt');
    expect(res.body[0].expired).toBe(false);
  });

  it('weist abgelaufene Nachweise aus — ein alter Beleg belegt den heutigen Stand nicht', async () => {
    const alt = await http
      .post('/api/v1/evidence')
      .set(bearer(carla))
      .send({
        title: 'Penetrationstest 2024',
        url: 'https://intranet.example/pentest-2024.pdf',
        validUntil: '2025-12-31',
      })
      .expect(201);

    const expired = await http.get('/api/v1/evidence?expired=true').set(bearer(carla)).expect(200);
    const ids = (expired.body as { id: string }[]).map((e) => e.id);
    expect(ids).toContain(alt.body.id);
    expect(ids).not.toContain(evidenceId);
  });

  it('löst die Verknüpfung wieder', async () => {
    const res = await http
      .delete(`/api/v1/evidence/measure/${measureId}/${evidenceId}`)
      .set(bearer(carla))
      .expect(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('Beweiskette', () => {
  it('löscht keine Datei, an der noch ein Nachweis hängt', async () => {
    const res = await http.delete(`/api/v1/files/${fileId}`).set(bearer(carla)).expect(409);
    expect(res.body.detail).toContain('1 Stelle');
  });

  it('gibt die Datei frei, sobald der Nachweis entfernt ist', async () => {
    await http.delete(`/api/v1/evidence/${evidenceId}`).set(bearer(carla)).expect(204);
    await http.delete(`/api/v1/files/${fileId}`).set(bearer(carla)).expect(204);
    await http.get(`/api/v1/files/${fileId}`).set(bearer(carla)).expect(404);
  });
});

describe('Mandantentrennung', () => {
  it('gibt einen fremden Beleg auch mit gültiger Kennung nicht heraus', async () => {
    const other = await http
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Fremd GmbH',
        tenantSlug: 'fremd',
        email: 'fremd@fremd.test',
        password: 'korrekt-pferd-batterie-2',
        displayName: 'Frieda Fremd',
      })
      .expect(201);

    const mine = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('vertraulicher Beleg'), {
        filename: 'intern.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    await http.get(`/api/v1/files/${mine.body.id}`).set(bearer(other.body.accessToken)).expect(404);
  });
});
