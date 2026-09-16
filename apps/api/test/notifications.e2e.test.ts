/**
 * Erinnerungen an Fristen (ISO 27001 Kap. 7.4 — Kommunikation).
 *
 * Geprüft wird das, was im Betrieb wehtut: dass jede Person nur ihre eigenen Fristen im
 * Postfach findet, dass ohne Postadresse nichts erzeugt wird, und dass der Standardtreiber
 * nichts zustellt — die Anwendung läuft ohne SMTP-Entscheidung.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let rita = '';
let ritaPersonId = '';
let berndId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

interface Message {
  to: string;
  subject: string;
  text: string;
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
      tenantName: 'Erinnerung GmbH',
      tenantSlug: 'erinnerung',
      email: 'carla@erinnerung.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@erinnerung.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;
  ritaPersonId = (await http.get('/api/v1/auth/me').set(bearer(rita)).expect(200)).body.personId;

  // Bernd meldet sich nie an und hat keine Postadresse — er bekommt deshalb keine Erinnerung.
  berndId = (
    await http.post('/api/v1/persons').set(bearer(carla)).send({ name: 'Bernd Betrieb' }).expect(201)
  ).body.id;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Fristerinnerung', () => {
  it('bündelt die Fristen je verantwortlicher Person', async () => {
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({
        title: 'Netzsegmentierung abschließen',
        status: 'in_progress',
        dueDate: inDays(-4),
        ownerPersonId: ritaPersonId,
      })
      .expect(201);
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({
        title: 'Backup-Konzept überarbeiten',
        status: 'planned',
        dueDate: inDays(3),
        ownerPersonId: ritaPersonId,
      })
      .expect(201);
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({
        title: 'Serverraum-Zutritt prüfen',
        status: 'planned',
        dueDate: inDays(2),
        ownerPersonId: berndId,
      })
      .expect(201);

    const res = await http.get('/api/v1/notifications/digest/preview').set(bearer(carla)).expect(200);
    const messages = res.body as Message[];

    // Genau eine Nachricht: Bernd hat keine Postadresse.
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.to).toBe('rita@erinnerung.test');
    expect(m.subject).toBe('ISMS-Fristen: 1 überfällig, 1 anstehend');
    expect(m.text).toContain('Guten Tag Rita Reinhardt');
    expect(m.text).toContain('Netzsegmentierung abschließen');
    expect(m.text).toContain('seit 4 Tag(en) überfällig');
    expect(m.text).toContain('Backup-Konzept überarbeiten');
    // Und nichts, was einer anderen Person zugeordnet ist.
    expect(m.text).not.toContain('Serverraum-Zutritt prüfen');
    expect(m.text).toContain('/deadlines');
  });

  it('achtet den Horizont der Vorschau', async () => {
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({
        title: 'Rezertifizierung vorbereiten',
        status: 'planned',
        dueDate: inDays(60),
        ownerPersonId: ritaPersonId,
      })
      .expect(201);

    const near = await http
      .get('/api/v1/notifications/digest/preview?horizonDays=14')
      .set(bearer(carla))
      .expect(200);
    const far = await http
      .get('/api/v1/notifications/digest/preview?horizonDays=90')
      .set(bearer(carla))
      .expect(200);
    expect((near.body as Message[])[0].text).not.toContain('Rezertifizierung vorbereiten');
    expect((far.body as Message[])[0].text).toContain('Rezertifizierung vorbereiten');
  });

  it('verschickt nichts, solange kein Zustelltreiber eingerichtet ist', async () => {
    const res = await http.post('/api/v1/notifications/digest/send').set(bearer(carla)).send({}).expect(201);
    expect(res.body.sent).toBe(1);
    expect(res.body.failed).toBe(0);
    // Das ist die Aussage: erzeugt ja, zugestellt nein.
    expect(res.body.delivering).toBe(false);

    const outbox = await http.get('/api/v1/notifications/outbox').set(bearer(carla)).expect(200);
    expect(outbox.body.delivering).toBe(false);
    expect((outbox.body.messages as Message[])[0].to).toBe('rita@erinnerung.test');
  });

  it('bleibt der Funktionstrennung treu — eine Risk-Ownerin richtet keine Erinnerungen ein', async () => {
    await http.get('/api/v1/notifications/digest/preview').set(bearer(rita)).expect(403);
    await http.post('/api/v1/notifications/digest/send').set(bearer(rita)).send({}).expect(403);
    await http.get('/api/v1/notifications/outbox').set(bearer(rita)).expect(403);
  });

  it('erzeugt keine Nachricht, wenn niemandem etwas zugeordnet ist', async () => {
    const other = await http
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Leer GmbH',
        tenantSlug: 'leer',
        email: 'leer@leer.test',
        password: 'korrekt-pferd-batterie-1',
        displayName: 'Lena Leer',
      })
      .expect(201);
    const res = await http
      .get('/api/v1/notifications/digest/preview')
      .set(bearer(other.body.accessToken))
      .expect(200);
    expect(res.body).toHaveLength(0);
  });
});
