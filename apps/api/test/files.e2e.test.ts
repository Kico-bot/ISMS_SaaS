/**
 * Nachweisdateien und Nachweisregister.
 *
 * Zwei Dinge sind hier sicherheitsrelevant und werden entsprechend geprüft: eine hochgeladene
 * Datei darf niemals im Ursprung der Anwendung gerendert werden, und ein Nachweis, an dem
 * noch etwas hängt, darf nicht stillschweigend verschwinden.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inDays, prepareTestDatabase, setTestEnv } from './setup';

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

  it('lässt die Auditorin hochladen — sie belegt ihre eigenen Feststellungen', async () => {
    /*
     * Bis Kap. 10.2 hinzukam, war das verwehrt: Nachweise hingen nur an Maßnahmen, und die
     * pflegt der Auditor nicht. Der Beleg, dass eine Abweichung behoben ist, ist aber seiner.
     *
     * Hochladen dürfen dadurch alle Mandantenrollen — jede hat im Datenmodell eine Stelle, an
     * der eine Datei hängt (`FILE_UPLOAD_PERMISSIONS`). Geschützt ist nicht das Hochladen,
     * sondern das Verknüpfen und das Herunterladen: Ersteres prüft jede Route für sich (siehe
     * audit.e2e: „lässt niemanden ohne Auditrecht …“), Letzteres die Mandantentrennung weiter
     * unten in dieser Datei.
     */
    const res = await http
      .post('/api/v1/files')
      .set(bearer(rita))
      .attach('file', Buffer.from('Stichprobe nach Umsetzung'), {
        filename: 'nachpruefung.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(res.body.filename).toBe('nachpruefung.txt');
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
        collectedAt: inDays(0),
        validUntil: inDays(90),
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

describe('Löschen mit measure.write_own', () => {
  let otto = '';

  beforeAll(async () => {
    const invite = await http
      .post('/api/v1/members')
      .set(bearer(carla))
      .send({ email: 'otto@nachweis.test', displayName: 'Otto Owner', roleKeys: ['risk_owner'] })
      .expect(201);
    otto = (
      await http
        .post('/api/v1/auth/accept-invite')
        .send({ token: invite.body.inviteToken, password: 'otto-passwort-2026-lang' })
        .expect(200)
    ).body.accessToken;
  });

  it('verwehrt dem Risk-Owner, die unverknüpfte Datei einer anderen Person zu löschen', async () => {
    const fremd = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('Beleg der ISMS-Leitung'), {
        filename: 'leitung.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await http.delete(`/api/v1/files/${fremd.body.id}`).set(bearer(otto)).expect(403);
    await http.get(`/api/v1/files/${fremd.body.id}`).set(bearer(carla)).expect(200);
  });

  it('lässt ihn die eigene, unverknüpfte Datei löschen', async () => {
    const eigen = await http
      .post('/api/v1/files')
      .set(bearer(otto))
      .attach('file', Buffer.from('Beleg des Risk-Owners'), {
        filename: 'owner.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await http.delete(`/api/v1/files/${eigen.body.id}`).set(bearer(otto)).expect(204);
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

/** Löscht die abgelegte Datei eines Inhalts direkt im Speicher, an der Anwendung vorbei. */
function removeFromStorage(sha256: string): void {
  for (const tenant of readdirSync(storageDir)) {
    const dir = join(storageDir, tenant, sha256.slice(0, 2), sha256.slice(2, 4));
    try {
      for (const f of readdirSync(dir)) rmSync(join(dir, f));
    } catch {
      // nicht in diesem Mandanten
    }
  }
}

describe('Lesefehler', () => {
  it('antwortet mit 404, wenn die Datei nach der Prüfung verschwindet, und läuft weiter', async () => {
    const up = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('Beleg, der gleich verschwindet'), {
        filename: 'fluechtig.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    removeFromStorage(up.body.sha256);

    // Die Prüfung sagt „vorhanden“, das Öffnen scheitert: der Wettlauf zwischen stat und open.
    const { StorageService } = await import('../src/kernel/storage/storage.service');
    const spy = vi.spyOn(app.get(StorageService), 'exists').mockResolvedValue(true);
    try {
      await http.get(`/api/v1/files/${up.body.id}`).set(bearer(carla)).expect(404);
    } finally {
      spy.mockRestore();
    }
    // Der Prozess lebt noch.
    const next = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('Beleg danach'), { filename: 'danach.txt', contentType: 'text/plain' })
      .expect(201);
    const res = await http.get(`/api/v1/files/${next.body.id}`).set(bearer(carla)).expect(200);
    expect(res.text).toBe('Beleg danach');
  });
});

describe('Dateityp und Dateiname', () => {
  const PDF = Buffer.from('%PDF-1.4\n% Prüfbericht\n%%EOF\n');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

  async function upload(content: Buffer, filename: string, contentType: string) {
    return http.post('/api/v1/files').set(bearer(carla)).attach('file', content, { filename, contentType });
  }

  it('weist eine Endung ab, die nicht zum Typ passt', async () => {
    const res = await upload(PDF, 'scan.pdf.exe', 'application/pdf');
    expect(res.status).toBe(400);
    expect(res.body.title).toContain('Endung');
  });

  it('weist einen Inhalt ab, der nicht zum Typ passt', async () => {
    const res = await upload(PNG, 'bericht.pdf', 'application/pdf');
    expect(res.status).toBe(400);
    expect(res.body.title).toContain('Inhalt');
  });

  it('nimmt einen passenden Inhalt an', async () => {
    const res = await upload(PNG, 'schaltplan.png', 'image/png');
    expect(res.status).toBe(201);
  });

  it('entfernt unsichtbare Formatzeichen aus dem Namen', async () => {
    const res = await upload(Buffer.from('Beleg mit verdrehtem Namen'), 'beleg‮fdp.txt', 'text/plain');
    expect(res.status).toBe(201);
    expect(res.body.filename).toBe('belegfdp.txt');
  });

  it('behält Umlaute im Namen', async () => {
    const res = await upload(Buffer.from('%PDF-1.4\n% Umlaute\n'), 'Prüfbericht.pdf', 'application/pdf');
    expect(res.status).toBe(201);
    expect(res.body.filename).toBe('Prüfbericht.pdf');
  });
});

describe('Verweise an Nachweisen', () => {
  it('nimmt nur Verweise mit http oder https an', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd']) {
      await http
        .post('/api/v1/evidence')
        .set(bearer(carla))
        .send({ title: 'Verweis auf ein Wiki', url })
        .expect(400);
    }
    await http
      .post('/api/v1/evidence')
      .set(bearer(carla))
      .send({ title: 'Verweis auf ein Wiki', url: 'https://wiki.example/backup' })
      .expect(201);
  });
});
