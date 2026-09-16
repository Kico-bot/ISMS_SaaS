/**
 * Dokumentenlenkung nach ISO 27001 Kap. 7.5. Geprüft wird das, was im Audit zählt:
 * unveränderliche Versionen, Freigabe im Vier-Augen-Prinzip und der Nachweis,
 * wer eine freigegebene Fassung gelesen hat.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;

/** Autorin der Leitlinie — ISMS-Managerin, darf schreiben und freigeben. */
let carla = '';
/** Zweiter ISMS-Manager — gibt frei, was Carla geschrieben hat. */
let mika = '';
/** Beschäftigte ohne Schreibrechte — bestätigt nur die eigene Lektüre. */
let rita = '';
let ritaPersonId = '';
let carlaPersonId = '';

let documentId = '';
let versionId = '';
let campaignId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function inviteAndAccept(roleKeys: string[], email: string, displayName: string, password: string) {
  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email, displayName, roleKeys })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password })
    .expect(200);
  const me = await http.get('/api/v1/auth/me').set(bearer(accepted.body.accessToken)).expect(200);
  return { token: accepted.body.accessToken as string, personId: me.body.personId as string };
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
      tenantName: 'Doku AG',
      tenantSlug: 'doku',
      email: 'carla@doku.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;
  const carlaMe = await http.get('/api/v1/auth/me').set(bearer(carla)).expect(200);
  carlaPersonId = carlaMe.body.personId;

  const m = await inviteAndAccept(
    ['isms_manager'],
    'mika@doku.test',
    'Mika Manager',
    'mika-passwort-2026-lang',
  );
  mika = m.token;
  const r = await inviteAndAccept(
    ['risk_owner'],
    'rita@doku.test',
    'Rita Referentin',
    'rita-passwort-2026-lang',
  );
  rita = r.token;
  ritaPersonId = r.personId;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Dokument und Versionen', () => {
  it('legt ein gelenktes Dokument im Entwurf an', async () => {
    const res = await http
      .post('/api/v1/documents')
      .set(bearer(carla))
      .send({
        key: 'RL-01',
        title: 'Informationssicherheitsleitlinie',
        kind: 'policy',
        classification: 'internal',
        reviewIntervalMonths: 12,
      })
      .expect(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.currentVersionId).toBeNull();
    documentId = res.body.id;
  });

  it('weist ein doppeltes Kürzel zurück — im Audit wird über das Kürzel referenziert', async () => {
    await http
      .post('/api/v1/documents')
      .set(bearer(carla))
      .send({ key: 'RL-01', title: 'Zweite Leitlinie' })
      .expect(409);
  });

  it('legt eine Version an; sie beginnt immer als Entwurf', async () => {
    const res = await http
      .post(`/api/v1/documents/${documentId}/versions`)
      .set(bearer(carla))
      .send({
        versionLabel: '1.0',
        changeNote: 'Erstfassung',
        contentMd: '# Leitlinie\n\nDie Geschäftsführung bekennt sich …',
      })
      .expect(201);
    expect(res.body.publishedAt).toBeNull();
    expect(res.body.approvedByUserId).toBeNull();
    versionId = res.body.id;
  });

  it('verweigert eine zweite Version mit gleicher Bezeichnung', async () => {
    await http
      .post(`/api/v1/documents/${documentId}/versions`)
      .set(bearer(carla))
      .send({ versionLabel: '1.0' })
      .expect(409);
  });
});

describe('Freigabe im Vier-Augen-Prinzip', () => {
  it('fordert vor der Freigabe eine freigegebene Fassung für Lesebestätigungen', async () => {
    await http
      .post(`/api/v1/documents/${documentId}/acknowledgements`)
      .set(bearer(carla))
      .send({})
      .expect(400);
  });

  it('setzt das Dokument mit der Vorlage zur Prüfung in den Status „in_review“', async () => {
    const res = await http
      .post(`/api/v1/documents/${documentId}/versions/${versionId}/submit`)
      .set(bearer(carla))
      .expect(201);
    expect(res.body.status).toBe('in_review');
  });

  it('lässt die Autorin ihre eigene Version nicht freigeben', async () => {
    const res = await http
      .post(`/api/v1/documents/${documentId}/versions/${versionId}/approve`)
      .set(bearer(carla))
      .expect(409);
    expect(res.body.type).toContain('sod-violation');
  });

  it('gibt durch eine zweite Person frei, veröffentlicht und terminiert die nächste Prüfung', async () => {
    const res = await http
      .post(`/api/v1/documents/${documentId}/versions/${versionId}/approve`)
      .set(bearer(mika))
      .expect(201);
    expect(res.body.status).toBe('published');
    expect(res.body.currentVersionId).toBe(versionId);

    const published = (
      res.body.versions as { id: string; publishedAt: string | null; approvedAt: string | null }[]
    ).find((v) => v.id === versionId)!;
    expect(published.publishedAt).not.toBeNull();
    expect(published.approvedAt).not.toBeNull();

    // Prüffrist = Freigabe + Überprüfungsintervall (12 Monate).
    const expected = new Date();
    expected.setMonth(expected.getMonth() + 12);
    expect(res.body.nextReviewAt).toBe(expected.toISOString().slice(0, 10));
  });

  it('verweigert die Freigabe Rollen ohne Freigaberecht', async () => {
    await http
      .post(`/api/v1/documents/${documentId}/versions/${versionId}/approve`)
      .set(bearer(rita))
      .expect(403);
  });
});

describe('Lesebestätigung', () => {
  it('löst die Zielgruppe sofort in einzelne Anforderungen auf', async () => {
    const res = await http
      .post(`/api/v1/documents/${documentId}/acknowledgements`)
      .set(bearer(carla))
      .send({ subject: 'Bitte lesen: Informationssicherheitsleitlinie', dueAt: '2026-12-31' })
      .expect(201);
    expect(res.body.recipients).toBe(3); // Carla, Mika, Rita
    campaignId = res.body.campaignId;
  });

  it('zeigt vor der Bestätigung alle Beschäftigten als offen', async () => {
    const res = await http
      .get(`/api/v1/documents/acknowledgements/${campaignId}`)
      .set(bearer(carla))
      .expect(200);
    expect(res.body).toHaveLength(3);
    expect((res.body as { acknowledgedAt: string | null }[]).every((r) => r.acknowledgedAt === null)).toBe(
      true,
    );
  });

  it('listet die offene Anforderung bei der betroffenen Person', async () => {
    const res = await http.get('/api/v1/documents/my-acknowledgements').set(bearer(rita)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].campaignId).toBe(campaignId);
    expect(res.body[0].versionLabel).toBe('1.0');
  });

  it('bestätigt die eigene Lektüre und leert damit die eigene Liste', async () => {
    const res = await http
      .post(`/api/v1/documents/acknowledgements/${campaignId}/confirm`)
      .set(bearer(rita))
      .send({})
      .expect(201);
    expect(res.body.acknowledgedAt).not.toBeNull();

    const mine = await http.get('/api/v1/documents/my-acknowledgements').set(bearer(rita)).expect(200);
    expect(mine.body).toHaveLength(0);
  });

  it('lässt niemanden ohne Schreibrecht für andere bestätigen', async () => {
    await http
      .post(`/api/v1/documents/acknowledgements/${campaignId}/confirm`)
      .set(bearer(rita))
      .send({ personId: carlaPersonId })
      .expect(403);
  });

  it('erlaubt der Dokumentenlenkung, eine Bestätigung nachzutragen', async () => {
    const res = await http
      .post(`/api/v1/documents/acknowledgements/${campaignId}/confirm`)
      .set(bearer(carla))
      .send({ personId: ritaPersonId })
      .expect(201);
    expect(res.body.acknowledgedAt).not.toBeNull();
  });

  it('weist den Stand im Dokumentenregister aus', async () => {
    const res = await http.get('/api/v1/documents').set(bearer(carla)).expect(200);
    const doc = (
      res.body.items as { key: string; ackTotal: number; ackDone: number; currentVersion: string }[]
    ).find((d) => d.key === 'RL-01')!;
    expect(doc.currentVersion).toBe('1.0');
    expect(doc.ackTotal).toBe(3);
    expect(doc.ackDone).toBe(1);
  });
});

describe('Nachweisbezug zur Norm', () => {
  it('verknüpft das Dokument mit einer Anforderung und zeigt sie im Detail', async () => {
    const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(carla)).expect(200);
    const a51 = (reqs.body as { id: string; refCode: string }[]).find((r) => r.refCode === 'A.5.1')!;
    await http
      .post(`/api/v1/documents/${documentId}/requirements`)
      .set(bearer(carla))
      .send({ requirementId: a51.id })
      .expect(201);

    const detail = await http.get(`/api/v1/documents/${documentId}`).set(bearer(carla)).expect(200);
    expect(detail.body.requirements).toHaveLength(1);
    expect(detail.body.requirements[0].refCode).toBe('A.5.1');
    expect(detail.body.campaigns[0].total).toBe(3);
    expect(detail.body.campaigns[0].done).toBe(1);
  });
});

describe('Gezielte Leseanforderung', () => {
  it('löst nur die benannten Personen auf', async () => {
    // Eigene Person, damit dieser Fall die Zählungen der vorherigen nicht verschiebt.
    const extra = await http
      .post('/api/v1/persons')
      .set(bearer(carla))
      .send({ name: 'Lea Leitung' })
      .expect(201);
    const res = await http
      .post(`/api/v1/documents/${documentId}/acknowledgements`)
      .set(bearer(carla))
      .send({ subject: 'Nur für die Leitung', target: { mode: 'persons', personIds: [extra.body.id] } })
      .expect(201);
    expect(res.body.recipients).toBe(1);

    const pending = await http
      .get(`/api/v1/documents/acknowledgements/${res.body.campaignId}`)
      .set(bearer(carla))
      .expect(200);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0].id).toBe(extra.body.id);
  });
});
