/**
 * Die fünf fachlichen Lücken, die die schlanke Oberfläche schließt: Behandlungsoption je Risiko
 * (Kap. 6.1.3 a), Bewertungsskala (Kap. 6.1.2 a), Lieferanten mit Prüftermin (A.5.19 bis A.5.22),
 * Themen ohne PESTLE-Dimension (Kap. 4.1) und Richtlinien aus Vorlagen (Kap. 5.2 und folgende).
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let olaf = '';
let carlaPersonId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

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
      tenantName: 'Lücken GmbH',
      tenantSlug: 'luecken',
      email: 'carla@luecken.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla Leitung',
    })
    .expect(201);
  carla = reg.body.accessToken;
  carlaPersonId = (await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200)).body.personId;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'olaf@luecken.test', displayName: 'Olaf Owner', roleKeys: ['risk_owner'] })
    .expect(201);
  olaf = (
    await http
      .post('/api/v1/auth/accept-invite')
      .send({ token: invite.body.inviteToken, password: 'owner-passwort-2026' })
      .expect(200)
  ).body.accessToken;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Behandlungsoption je Risiko (Kap. 6.1.3 a)', () => {
  it('wird beim Anlegen gespeichert, lässt sich ändern und steht im CSV-Export', async () => {
    const r = await http
      .post('/api/v1/risks')
      .set(bearer(carla))
      .send({ title: 'Ausfall des Rechenzentrums', treatment: 'transfer' })
      .expect(201);
    expect((await http.get(`/api/v1/risks/${r.body.id}`).set(bearer(carla)).expect(200)).body.treatment).toBe(
      'transfer',
    );
    await http
      .patch(`/api/v1/risks/${r.body.id}`)
      .set(bearer(carla))
      .send({ treatment: 'avoid' })
      .expect(200);
    const csv = (await http.get('/api/v1/exports/risks.csv').set(bearer(carla)).expect(200)).text;
    expect(csv).toContain('vermeiden');
    expect(csv).not.toContain(';avoid;');
  });

  it('kennt nur die vier Optionen', async () => {
    await http
      .post('/api/v1/risks')
      .set(bearer(carla))
      .send({ title: 'Irgendwas', treatment: 'ignorieren' })
      .expect(400);
  });
});

describe('Bewertungsskala (Kap. 6.1.2 a)', () => {
  it('liefert Standardtexte für alle fünf Stufen', async () => {
    const m = (await http.get('/api/v1/risks/matrix').set(bearer(carla)).expect(200)).body;
    expect(m.likelihoodDescriptions).toHaveLength(5);
    expect(m.impactDescriptions).toHaveLength(5);
    expect(m.impactDescriptions[4]).toMatch(/€/);
    expect(m.thresholds).toEqual({ low: 4, medium: 9, high: 14 });
  });

  it('ist je Mandant als Text änderbar, die Schwellen bleiben fest', async () => {
    const likelihood = ['nie', 'selten', 'manchmal', 'oft', 'ständig'].map((w) => `Bei uns ${w} beobachtet.`);
    const impact = ['A', 'B', 'C', 'D', 'E'].map((w) => `Stufe ${w}: eigener Text.`);
    const m = (
      await http.put('/api/v1/risks/scale').set(bearer(carla)).send({ likelihood, impact }).expect(200)
    ).body;
    expect(m.likelihoodDescriptions).toEqual(likelihood);
    expect(m.thresholds).toEqual({ low: 4, medium: 9, high: 14 });

    const zip = await download('/api/v1/exports/audit-package.zip', carla);
    const kriterien = zipRead(zip, '04-risiken/risikokriterien.csv');
    expect(kriterien).toContain('Bei uns ständig beobachtet.');
    expect(kriterien).toContain('Stufe E: eigener Text.');
  });

  it('verlangt genau fünf Texte und das Recht für Einstellungen', async () => {
    await http
      .put('/api/v1/risks/scale')
      .set(bearer(carla))
      .send({ likelihood: ['a1a', 'b2b', 'c3c', 'd4d'], impact: ['a1a', 'b2b', 'c3c', 'd4d', 'e5e'] })
      .expect(400);
    const five = ['a1a', 'b2b', 'c3c', 'd4d', 'e5e'];
    await http
      .put('/api/v1/risks/scale')
      .set(bearer(olaf))
      .send({ likelihood: five, impact: five })
      .expect(403);
  });
});

describe('Lieferanten (A.5.19 bis A.5.22)', () => {
  let supplierId = '';

  it('nimmt Nachweis und Bewertungstermine nur an Lieferanten an', async () => {
    await http
      .post('/api/v1/assets')
      .set(bearer(carla))
      .send({ name: 'Server', category: 'system', supplierEvidence: 'Zertifikat' })
      .expect(400);
    const s = await http
      .post('/api/v1/assets')
      .set(bearer(carla))
      .send({
        name: 'Cloud-Anbieter',
        category: 'supplier',
        supplierEvidence: 'ISO-27001-Zertifikat',
        supplierAssessedAt: day(-30),
        supplierNextReviewAt: day(10),
      })
      .expect(201);
    supplierId = s.body.id;
    const list = (await http.get('/api/v1/assets?category=supplier').set(bearer(carla)).expect(200)).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      supplierEvidence: 'ISO-27001-Zertifikat',
      supplierNextReviewAt: day(10),
    });
  });

  it('lehnt einen Prüftermin vor der letzten Bewertung ab', async () => {
    await http
      .patch(`/api/v1/assets/${supplierId}`)
      .set(bearer(carla))
      .send({ supplierNextReviewAt: day(-60) })
      .expect(400);
  });

  it('zeigt den Prüftermin in den Fristen', async () => {
    const rows = (await http.get('/api/v1/deadlines?horizonDays=60').set(bearer(carla)).expect(200)).body as {
      kind: string;
      id: string;
      dueAt: string;
    }[];
    expect(rows.find((r) => r.kind === 'supplier_review' && r.id === supplierId)?.dueAt).toBe(day(10));
  });

  it('steht im Auditpaket als eigenes Register', async () => {
    const zip = await download('/api/v1/exports/audit-package.zip', carla);
    expect(zipRead(zip, '03-assets/lieferanten.csv')).toContain('Cloud-Anbieter');
  });
});

describe('Themen ohne PESTLE-Dimension (Kap. 4.1)', () => {
  it('genügen Titel und intern oder extern', async () => {
    await http
      .post('/api/v1/context/factors')
      .set(bearer(carla))
      .send({ title: 'Wenig Personal in der IT', origin: 'internal' })
      .expect(201);
    await http
      .post('/api/v1/context/factors')
      .set(bearer(carla))
      .send({ title: 'Neue Meldepflichten', dimension: 'legal' })
      .expect(201);
    const list = (await http.get('/api/v1/context/factors').set(bearer(carla)).expect(200)).body as {
      title: string;
      dimension: string | null;
      origin: string | null;
    }[];
    expect(list.find((f) => f.title === 'Wenig Personal in der IT')).toMatchObject({
      dimension: null,
      origin: 'internal',
    });
  });

  it('erscheinen mit beiden Arten in der Managementbewertung (9.3.2 b)', async () => {
    const p = (await http.get('/api/v1/management-reviews/preview').set(bearer(carla)).expect(200)).body;
    const cats = (p.contextChanges as { kind: string; category: string; title: string }[])
      .filter((c) => c.kind === 'pestle')
      .map((c) => [c.title, c.category]);
    expect(cats).toEqual(
      expect.arrayContaining([
        ['Wenig Personal in der IT', 'internal'],
        ['Neue Meldepflichten', 'legal'],
      ]),
    );
  });
});

describe('Richtlinien aus Vorlagen (Kap. 5.2, 5.3, 6.1.2, 7.4, A.5.24, A.5.29)', () => {
  it('bietet sechs Vorlagen an', async () => {
    const t = (await http.get('/api/v1/documents/templates').set(bearer(carla)).expect(200)).body;
    expect(t.map((x: { key: string }) => x.key)).toEqual([
      'security_policy',
      'roles',
      'risk_method',
      'communication',
      'incident_handling',
      'continuity',
    ]);
  });

  it('legt einen Entwurf mit Firmenname und Verantwortlicher an, verknüpft mit der Norm', async () => {
    const doc = (
      await http
        .post('/api/v1/documents/from-template')
        .set(bearer(carla))
        .send({ templateKey: 'security_policy', ownerPersonId: carlaPersonId })
        .expect(201)
    ).body;
    expect(doc.key).toBe('RL-01');
    const d = (await http.get(`/api/v1/documents/${doc.id}`).set(bearer(carla)).expect(200)).body;
    expect(d.status).toBe('draft');
    expect(d.versions).toHaveLength(1);
    expect(d.versions[0].versionLabel).toBe('0.1');
    expect(d.versions[0].contentMd).toContain('Lücken GmbH');
    expect(d.versions[0].contentMd).toContain('Carla Leitung');
    expect(d.versions[0].contentMd).not.toContain('{{');
    expect(d.requirements.map((r: { refCode: string }) => r.refCode)).toEqual(
      expect.arrayContaining(['5.2', 'A.5.1']),
    );

    const again = (
      await http
        .post('/api/v1/documents/from-template')
        .set(bearer(carla))
        .send({ templateKey: 'security_policy' })
        .expect(201)
    ).body;
    expect(again.key).toBe('RL-01-2');
  });

  it('verlangt das Schreibrecht und eine bekannte Vorlage', async () => {
    await http
      .post('/api/v1/documents/from-template')
      .set(bearer(carla))
      .send({ templateKey: 'gibt-es-nicht' })
      .expect(404);
  });
});
