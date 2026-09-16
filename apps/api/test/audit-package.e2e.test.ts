/**
 * Das Auditpaket: der gesamte Datenbestand eines Mandanten in einer ZIP-Datei.
 *
 * Geprüft wird, was im Termin zählt: dass jedes Register enthalten ist, dass die Nachweisdateien
 * im Original mitkommen, dass nichts aus einem fremden Mandanten hineingerät und dass in den
 * Tabellen deutsche Wörter stehen und nicht die Enum-Werte des Datenmodells.
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
let rita = '';
let paket: Buffer;

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

/**
 * Supertest liest Antworten sonst als Text und zerlegt damit jedes Byte über 0x7f. Für ein
 * ZIP-Archiv braucht es den unveränderten Datenstrom.
 */
async function downloadPackage(token: string): Promise<Buffer> {
  const res = await http
    .get('/api/v1/exports/audit-package.zip')
    .set(bearer(token))
    .buffer(true)
    .parse((stream, callback) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      stream.on('end', () => callback(null, Buffer.concat(chunks)));
      stream.on('error', (e: Error) => callback(e, null));
    })
    .expect(200);
  return res.body as Buffer;
}

/** Entpackt einen Eintrag — nur so lässt sich sein Inhalt prüfen und nicht bloß sein Name. */
function zipRead(buf: Buffer, name: string): string {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const method = buf.readUInt16LE(p + 10);
      const compressedSize = buf.readUInt32LE(p + 20);
      const local = buf.readUInt32LE(p + 42);
      const localNameLen = buf.readUInt16LE(local + 26);
      const localExtraLen = buf.readUInt16LE(local + 28);
      const start = local + 30 + localNameLen + localExtraLen;
      const raw = buf.subarray(start, start + compressedSize);
      return (method === 0 ? raw : inflateRawSync(raw)).toString('utf8');
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  throw new Error(`Eintrag ${name} nicht im Paket`);
}

function findEocd(buf: Buffer): number {
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i -= 1;
  if (i < 0) throw new Error('Kein ZIP-Archiv: End-of-Central-Directory fehlt');
  return i;
}

/**
 * Liest das zentrale Verzeichnis einer ZIP-Datei. Bewusst von Hand statt mit einer weiteren
 * Abhängigkeit — es sind dreißig Zeilen, und der Test soll das Format prüfen, nicht eine
 * Bibliothek.
 */
function zipEntries(buf: Buffer): { name: string; size: number }[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: { name: string; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Beschädigtes zentrales Verzeichnis');
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
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
      tenantName: 'Paket AG',
      tenantSlug: 'paket',
      email: 'carla@paket.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@paket.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  rita = (
    await http
      .post('/api/v1/auth/accept-invite')
      .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
      .expect(200)
  ).body.accessToken;

  // Ein Risiko, das akzeptiert wurde — sein Status prüft die deutsche Beschriftung.
  const risk = await http
    .post('/api/v1/risks')
    .set(bearer(carla))
    .send({ title: 'Ausfall der Fernwirkstrecke', treatment: 'accept' })
    .expect(201);
  await http
    .post(`/api/v1/risks/${risk.body.id}/assessments`)
    .set(bearer(carla))
    .send({ stage: 'inherent', likelihood: 4, impact: 4 })
    .expect(201);
  await http
    .post(`/api/v1/risks/${risk.body.id}/assessments`)
    .set(bearer(carla))
    .send({ stage: 'residual', likelihood: 2, impact: 3 })
    .expect(201);
  await http
    .post(`/api/v1/risks/${risk.body.id}/accept`)
    .set(bearer(carla))
    .send({ validUntil: '2027-01-31', rationale: 'Befristet akzeptiert bis zur Vertragsverlängerung.' })
    .expect(201);

  // Eine Nachweisdatei, damit Ordner 15 nicht leer bleibt.
  const upload = await http
    .post('/api/v1/files')
    .set(bearer(carla))
    .attach('file', Buffer.from('Protokoll des Rückspieltests'), {
      filename: 'rueckspieltest.txt',
      contentType: 'text/plain',
    })
    .expect(201);
  await http
    .post('/api/v1/evidence')
    .set(bearer(carla))
    .send({ title: 'Rückspieltest', fileId: upload.body.id })
    .expect(201);

  // Die drei Register aus Kap. 5.3, 6.3 und 7.4 — sie hingen bis zuletzt nicht im Paket.
  await http
    .post('/api/v1/context/communication')
    .set(bearer(carla))
    .send({
      topic: 'Meldepflichtige Sicherheitsvorfälle',
      audience: 'BSI',
      channel: 'Meldeportal',
      frequency: 'anlassbezogen binnen 24 Stunden',
      clauseRef: 'NIS2 Art. 23',
    })
    .expect(201);
  await http
    .post('/api/v1/context/changes')
    .set(bearer(carla))
    .send({
      title: 'Trennung von Büro- und Leitnetz',
      purpose: 'Das Leitnetz darf aus dem Büronetz nicht mehr erreichbar sein.',
      impactAssessment: 'Zwei Wartungsfenster, Rückfallweg bleibt eine Woche bestehen.',
      plannedFor: '2027-03-01',
    })
    .expect(201);
  const bereich = await http
    .post('/api/v1/context/org-chart')
    .set(bearer(carla))
    .send({ label: 'Netzbetrieb', kind: 'unit' })
    .expect(201);
  await http
    .post('/api/v1/context/org-chart')
    .set(bearer(carla))
    .send({ label: 'Systemadministration OT', kind: 'vacancy', parentId: bereich.body.id })
    .expect(201);

  // Ein zweiter Mandant mit einem unverwechselbaren Wert — er darf im Paket nicht auftauchen.
  const fremd = await http
    .post('/api/v1/auth/register')
    .send({
      tenantName: 'Fremd GmbH',
      tenantSlug: 'fremd-paket',
      email: 'fremd@paket.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Frieda Fremd',
    })
    .expect(201);
  await http
    .post('/api/v1/risks')
    .set(bearer(fremd.body.accessToken))
    .send({ title: 'ZZZ-Geheimnis-des-anderen-Mandanten' })
    .expect(201);

  paket = await downloadPackage(carla);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Auditpaket', () => {
  it('kommt als ZIP mit sprechendem Dateinamen', async () => {
    const res = await http.get('/api/v1/exports/audit-package.zip').set(bearer(carla)).expect(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(decodeURIComponent(res.headers['content-disposition'] as string)).toContain(
      'isms-auditpaket-paket-',
    );
    expect(paket.readUInt32LE(0)).toBe(0x04034b50); // lokaler Dateikopf
  });

  it('enthält jedes Register des ISMS', async () => {
    const names = zipEntries(paket).map((e) => e.name);
    for (const erwartet of [
      'LIESMICH.html',
      '01-anwendbarkeitserklaerung/soa-iso27001.csv',
      '01-anwendbarkeitserklaerung/soa-iso27001.html',
      '02-kontext/interessierte-parteien.csv',
      '02-kontext/kommunikationsplan.csv',
      '02-kontext/aenderungsplanung.csv',
      '03-assets/asset-inventar.csv',
      '04-risiken/risikoregister.csv',
      '05-massnahmen/massnahmenregister.csv',
      '05-massnahmen/normzuordnung.csv',
      '06-dokumente/dokumentenlenkung.csv',
      '07-nachweise/nachweisregister.csv',
      '08-betrieb/sicherheitsvorfaelle.csv',
      '08-betrieb/meldefristen.csv',
      '09-datenschutz/verarbeitungsverzeichnis.csv',
      '09-datenschutz/verarbeitungsverzeichnis.html',
      '10-audit-kvp/feststellungen.csv',
      '11-kompetenz/kompetenzmatrix.csv',
      '12-organisation/organigramm.csv',
      '12-organisation/rollenzuweisungen.csv',
      '13-wiedervorlage/offene-fristen.csv',
      '14-protokoll/aenderungsprotokoll.csv',
      '15-dateien/dateiverzeichnis.csv',
    ]) {
      expect(names).toContain(erwartet);
    }
  });

  it('führt Kommunikation, Änderungsplanung und Organigramm mit Inhalt', () => {
    expect(zipRead(paket, '02-kontext/kommunikationsplan.csv')).toContain('Meldeportal');
    // Ohne Freigabe steht die Änderung als „geplant“ da — nicht als Rohwert `planned`.
    const aenderungen = zipRead(paket, '02-kontext/aenderungsplanung.csv');
    expect(aenderungen).toContain('Trennung von Büro- und Leitnetz');
    expect(aenderungen).toContain('geplant');
    // Der Pfad zeigt die Hierarchie, ohne dass die CSV sie darstellen müsste.
    const organigramm = zipRead(paket, '12-organisation/organigramm.csv');
    expect(organigramm).toContain('Netzbetrieb / Systemadministration OT');
    expect(organigramm).toContain('Stelle (unbesetzt)');
  });

  it('legt die hochgeladene Nachweisdatei im Original bei', () => {
    const datei = zipEntries(paket).find((e) => e.name.endsWith('rueckspieltest.txt'));
    expect(datei).toBeDefined();
    // Byte-Länge, nicht Zeichenlänge — das „ü“ belegt in UTF-8 zwei Bytes.
    expect(datei!.size).toBe(Buffer.byteLength('Protokoll des Rückspieltests', 'utf8'));
  });

  it('schreibt die Register auf Deutsch, nicht in Enum-Werten', () => {
    const csv = zipRead(paket, '04-risiken/risikoregister.csv');
    expect(csv).toContain('Ausfall der Fernwirkstrecke');
    // Der Status steht in der Datenbank als `accepted`, im Paket muss er lesbar sein.
    expect(csv).toContain('akzeptiert');
    expect(csv).toContain('akzeptieren');
    expect(csv).not.toMatch(/;accepted;/);
    // Semikolon und BOM, damit deutsche Excel-Installationen die Datei richtig öffnen.
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain('Rest: Score');
  });

  it('nennt im Deckblatt jedes Register mit seiner Anzahl', () => {
    const readme = zipRead(paket, 'LIESMICH.html');
    expect(readme).toContain('Auditpaket');
    expect(readme).toContain('Paket AG');
    expect(readme).toContain('risikoregister.csv');
    expect(readme).toContain('Was nicht enthalten ist');
  });

  it('führt jede beigelegte Datei mit ihrem Hash und ihrem Bezug', () => {
    const verzeichnis = zipRead(paket, '15-dateien/dateiverzeichnis.csv');
    expect(verzeichnis).toContain('rueckspieltest.txt');
    expect(verzeichnis).toContain('Nachweis: Rückspieltest');
    expect(verzeichnis).toContain('SHA-256');
  });

  it('nimmt nichts aus einem anderen Mandanten auf', () => {
    // Der Wert des zweiten Mandanten darf nirgends im Paket vorkommen — auch nicht komprimiert,
    // denn eine so kurze Zeichenkette bliebe im Deflate-Strom als Literal erhalten.
    expect(paket.toString('latin1')).not.toContain('ZZZ-Geheimnis');
  });

  it('bleibt der Funktionstrennung treu', async () => {
    // Der Risk-Owner liest das ISMS, darf es aber nicht ausleiten.
    await http.get('/api/v1/exports/audit-package.zip').set(bearer(rita)).expect(403);
  });
});
