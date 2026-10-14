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
// `inDays` rechnet „heute“ in Europe/Berlin, wie die Fristenliste.
import { inDays, prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let rita = '';
let ritaPersonId = '';
let berndId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    // Der manuelle Versand prüft die Zustellung und geht nur an die aufrufende Person; Carla
    // braucht dafür selbst eine Frist.
    const carlaPersonId = (await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200)).body
      .personId as string;
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({
        title: 'Zustellung prüfen',
        status: 'planned',
        dueDate: inDays(5),
        ownerPersonId: carlaPersonId,
      })
      .expect(201);

    const res = await http.post('/api/v1/notifications/digest/send').set(bearer(carla)).send({}).expect(201);
    expect(res.body.sent).toBe(1);
    expect(res.body.failed).toBe(0);
    // Das ist die Aussage: erzeugt ja, zugestellt nein.
    expect(res.body.delivering).toBe(false);

    const outbox = await http.get('/api/v1/notifications/outbox').set(bearer(carla)).expect(200);
    expect(outbox.body.delivering).toBe(false);
    const messages = outbox.body.messages as Message[];
    expect(messages[0].to).toBe('carla@erinnerung.test');
    // Rita hat offene Fristen, bekommt vom manuellen Versand aber nichts.
    expect(messages.some((m) => m.to === 'rita@erinnerung.test')).toBe(false);
  });

  it('verschickt den Tageslauf je Mandant nur einmal', async () => {
    const { NotificationsService } = await import('../src/modules/notifications/notifications.service');
    const notifications = app.get(NotificationsService);
    const tenantId = (await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200)).body
      .tenantId as string;

    const first = await notifications.sendDigests(tenantId);
    expect(first.sent).toBeGreaterThan(0);
    // Eine Wiederholung am selben Tag, etwa nach einem Absturz des Hintergrundprozesses, schickt nichts.
    const again = await notifications.sendDigests(tenantId);
    expect(again.sent).toBe(0);
    expect(again.failed).toBe(0);
  });

  it('erinnert die bearbeitende Person an eine Meldefrist', async () => {
    const incident = await http
      .post('/api/v1/incidents')
      .set(bearer(carla))
      .send({ title: 'Phishing-Welle im Vertrieb', severity: 'high', handlerPersonId: ritaPersonId })
      .expect(201);
    await http
      .post(`/api/v1/incidents/${incident.body.id}/mark-significant`)
      .set(bearer(carla))
      .send({})
      .expect(201);

    const res = await http.get('/api/v1/notifications/digest/preview').set(bearer(carla)).expect(200);
    const forRita = (res.body as Message[]).find((m) => m.to === 'rita@erinnerung.test');
    expect(forRita?.text).toContain('NIS2-Frühwarnung (24 Stunden)');
  });

  it('nennt eine Pflicht „unverzüglich“ in der Erinnerung', async () => {
    const incident = await http
      .post('/api/v1/incidents')
      .set(bearer(carla))
      .send({ title: 'Kundendaten offen im Netz', severity: 'high', handlerPersonId: ritaPersonId })
      .expect(201);
    await http
      .post(`/api/v1/incidents/${incident.body.id}/confirm-breach`)
      .set(bearer(carla))
      .send({ highRiskForIndividuals: true })
      .expect(201);

    const res = await http.get('/api/v1/notifications/digest/preview').set(bearer(carla)).expect(200);
    const forRita = (res.body as Message[]).find((m) => m.to === 'rita@erinnerung.test');
    const line = forRita?.text.split('\n').find((l) => l.includes('Art. 34 DSGVO'));
    expect(line).toContain(`[${incident.body.refNo as string}]`);
    expect(line).toContain('(unverzüglich)');
  });

  it('erinnert ohne bearbeitende Person alle, die Vorfälle bearbeiten dürfen', async () => {
    const incident = await http
      .post('/api/v1/incidents')
      .set(bearer(carla))
      .send({ title: 'Ausfall des Kundenportals', severity: 'high' })
      .expect(201);
    await http
      .post(`/api/v1/incidents/${incident.body.id}/mark-significant`)
      .set(bearer(carla))
      .send({})
      .expect(201);

    const res = await http.get('/api/v1/notifications/digest/preview').set(bearer(carla)).expect(200);
    const messages = res.body as Message[];
    // Carla ist ISMS-Leitung und darf Vorfälle bearbeiten, Rita als Risk-Ownerin nicht.
    const refNo = incident.body.refNo as string;
    expect(refNo).toBeTruthy();
    const forCarla = messages.find((m) => m.to === 'carla@erinnerung.test');
    expect(forCarla?.text).toContain(`NIS2-Frühwarnung (24 Stunden) [${refNo}]`);
    const forRita = messages.find((m) => m.to === 'rita@erinnerung.test');
    expect(forRita?.text ?? '').not.toContain(`[${refNo}]`);
  });

  it('erinnert alle, die Vorfälle bearbeiten dürfen, wenn die bearbeitende Person keine Postadresse hat', async () => {
    // Bernd meldet sich nie an und hat keine Postadresse: seine Meldefrist darf trotzdem niemanden verfehlen.
    const incident = await http
      .post('/api/v1/incidents')
      .set(bearer(carla))
      .send({ title: 'Störung im Umspannwerk', severity: 'high', handlerPersonId: berndId })
      .expect(201);
    await http
      .post(`/api/v1/incidents/${incident.body.id}/mark-significant`)
      .set(bearer(carla))
      .send({})
      .expect(201);

    const res = await http.get('/api/v1/notifications/digest/preview').set(bearer(carla)).expect(200);
    const forCarla = (res.body as Message[]).find((m) => m.to === 'carla@erinnerung.test');
    expect(forCarla?.text).toContain(`[${incident.body.refNo as string}]`);
  });

  it('zeigt im Postausgang nur Mails des eigenen Mandanten', async () => {
    const other = await http
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Nachbar GmbH',
        tenantSlug: 'nachbar',
        email: 'nora@nachbar.test',
        password: 'korrekt-pferd-batterie-1',
        displayName: 'Nora Nachbar',
      })
      .expect(201);
    const outbox = await http
      .get('/api/v1/notifications/outbox')
      .set(bearer(other.body.accessToken))
      .expect(200);
    const messages = outbox.body.messages as Message[];
    expect(messages.some((m) => m.to.endsWith('@erinnerung.test'))).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it('zeigt im Postausgang auch Mails, die ein anderer Prozess erzeugt hat', async () => {
    // Der Hintergrundprozess hat eine eigene Instanz des Mailversands. Was er erzeugt, muss im
    // Postausgang der API stehen, sonst zeigt der Postausgang nicht, was wirklich rausging.
    const { MailService } = await import('../src/kernel/mail/mail.service');
    const { DbService } = await import('../src/kernel/db/db.service');
    const dbs = new DbService();
    try {
      const worker = new MailService(dbs);
      const me = await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200);
      await worker.send(me.body.tenantId as string, {
        to: 'rita@erinnerung.test',
        subject: 'Vom Hintergrundprozess',
        text: 'Erzeugt im Worker',
      });
    } finally {
      await dbs.onModuleDestroy();
    }
    const outbox = await http.get('/api/v1/notifications/outbox').set(bearer(carla)).expect(200);
    expect((outbox.body.messages as Message[])[0].subject).toBe('Vom Hintergrundprozess');
  });

  it('bleibt der Funktionstrennung treu — eine Risk-Ownerin richtet keine Erinnerungen ein', async () => {
    await http.get('/api/v1/notifications/digest/preview').set(bearer(rita)).expect(403);
    await http.post('/api/v1/notifications/digest/send').set(bearer(rita)).send({}).expect(403);
    await http.get('/api/v1/notifications/outbox').set(bearer(rita)).expect(403);
  });

  it('lässt eine Risk-Ownerin ihre Maßnahme nicht in die Erinnerung einer anderen Person schieben', async () => {
    // Weg aus W15: ein Verweis im Titel, dann die Maßnahme einer anderen Person zuweisen, und die
    // Erinnerung geht mit dem Absender des ISMS an diese Person.
    const carlaPersonId = (await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200)).body
      .personId as string;
    const m = await http
      .post('/api/v1/measures')
      .set(bearer(rita))
      .send({
        title: 'Bitte hier anmelden: https://example.test/login',
        dueDate: inDays(2),
        ownerPersonId: ritaPersonId,
      })
      .expect(201);
    await http
      .patch(`/api/v1/measures/${m.body.id}`)
      .set(bearer(rita))
      .send({ ownerPersonId: carlaPersonId })
      .expect(403);
    const res = await http.get('/api/v1/notifications/digest/preview').set(bearer(carla)).expect(200);
    const forCarla = (res.body as Message[]).find((x) => x.to === 'carla@erinnerung.test');
    expect(forCarla?.text ?? '').not.toContain('example.test/login');
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
