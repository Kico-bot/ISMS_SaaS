/**
 * Drei Register, die die ISO 27001 verlangt: Kommunikationsplan (Kap. 7.4), Änderungsplanung
 * (Kap. 6.3) und Organigramm (Kap. 5.3).
 *
 * Geprüft wird das, woran ein Zertifizierungsaudit hängt: dass der Kommunikationsplan die vier
 * Fragen der Norm beantwortet, dass eine Änderung ohne bewertete Auswirkung nicht freigegeben
 * wird und die Freigabe nicht von der planenden Person kommt, und dass das Organigramm
 * unbesetzte Stellen als solche führt.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let carla = '';
let jorin = '';
let rita = '';
let wenzelId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

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
      tenantName: 'Planung AG',
      tenantSlug: 'planung',
      email: 'carla@planung.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const accept = async (email: string, name: string, roles: string[], password: string) => {
    const invite = await http
      .post('/api/v1/members')
      .set(bearer(carla))
      .send({ email, displayName: name, roleKeys: roles })
      .expect(201);
    return (
      await http
        .post('/api/v1/auth/accept-invite')
        .send({ token: invite.body.inviteToken, password })
        .expect(200)
    ).body.accessToken as string;
  };
  jorin = await accept('jorin@planung.test', 'Jorin Kessler', ['isms_manager'], 'jorin-passwort-2026-lang');
  rita = await accept('rita@planung.test', 'Rita Reinhardt', ['risk_owner'], 'rita-passwort-2026-lang');

  wenzelId = (
    await http
      .post('/api/v1/persons')
      .set(bearer(carla))
      .send({ name: 'Wenzel Rothmund', department: 'Netzbetrieb' })
      .expect(201)
  ).body.id;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Kommunikationsplan (Kap. 7.4)', () => {
  it('führt worüber, mit wem, wann und wie', async () => {
    const res = await http
      .post('/api/v1/context/communication')
      .set(bearer(carla))
      .send({
        topic: 'Meldung erheblicher Vorfälle',
        audience: 'CSIRT bzw. zuständige Behörde (BSI)',
        channel: 'Meldeportal',
        frequency: 'binnen 24 Stunden nach Kenntnis',
        responsiblePersonId: wenzelId,
        clauseRef: 'NIS2 Art. 23',
      })
      .expect(201);
    expect(res.body.topic).toBe('Meldung erheblicher Vorfälle');

    const list = await http.get('/api/v1/context/communication').set(bearer(carla)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].responsibleName).toBe('Wenzel Rothmund');
    expect(list.body[0].clauseRef).toBe('NIS2 Art. 23');
  });

  it('verlangt alle vier Angaben', async () => {
    await http
      .post('/api/v1/context/communication')
      .set(bearer(carla))
      .send({ topic: 'Unvollständig', audience: 'Leitung' })
      .expect(400);
  });

  it('lässt den Risk-Owner nicht am Kommunikationsplan schreiben', async () => {
    await http
      .post('/api/v1/context/communication')
      .set(bearer(rita))
      .send({ topic: 'Eigenmächtig', audience: 'X', channel: 'Y', frequency: 'Z' })
      .expect(403);
  });
});

describe('Änderungsplanung (Kap. 6.3)', () => {
  let changeId = '';

  it('nimmt eine geplante Änderung mit Zweck und Auswirkung auf', async () => {
    const res = await http
      .post('/api/v1/context/changes')
      .set(bearer(carla))
      .send({
        title: 'Geltungsbereich um das Umspannwerk Süd erweitern',
        purpose: 'Netzübernahme zum Jahreswechsel.',
        plannedFor: '2027-01-15',
      })
      .expect(201);
    changeId = res.body.id;
    expect(res.body.status).toBe('planned');

    const list = await http.get('/api/v1/context/changes').set(bearer(carla)).expect(200);
    expect(list.body[0].createdByName).toBe('Carla CISO');
  });

  it('gibt nichts frei, dessen Auswirkung nicht bewertet ist', async () => {
    const res = await http.post(`/api/v1/context/changes/${changeId}/approve`).set(bearer(jorin)).expect(400);
    expect(res.body.detail).toContain('6.3');
  });

  it('lässt die planende Person nicht selbst freigeben', async () => {
    await http
      .patch(`/api/v1/context/changes/${changeId}`)
      .set(bearer(carla))
      .send({
        impactAssessment:
          '40 zusätzliche Assets, BIA der Netzführung neu zu bewerten, NIS2-Schwellwert prüfen.',
      })
      .expect(200);

    const res = await http.post(`/api/v1/context/changes/${changeId}/approve`).set(bearer(carla)).expect(400);
    expect(res.body.title).toContain('Vier-Augen');
  });

  it('gibt durch eine zweite Person frei', async () => {
    const res = await http.post(`/api/v1/context/changes/${changeId}/approve`).set(bearer(jorin)).expect(201);
    expect(res.body.status).toBe('approved');
    expect(res.body.approvedAt).toBeTruthy();
  });

  it('entwertet die Freigabe, wenn sich der Inhalt danach ändert', async () => {
    const res = await http
      .patch(`/api/v1/context/changes/${changeId}`)
      .set(bearer(carla))
      .send({ impactAssessment: 'Doch 90 Assets — die Bewertung war zu niedrig angesetzt.' })
      .expect(200);
    expect(res.body.approvedAt).toBeNull();
    expect(res.body.status).toBe('planned');
  });
});

describe('Organigramm (Kap. 5.3)', () => {
  let netzbetrieb = '';

  it('baut einen Baum und führt unbesetzte Stellen als solche', async () => {
    const wurzel = await http
      .post('/api/v1/context/org-chart')
      .set(bearer(carla))
      .send({ label: 'Geschäftsführung', kind: 'unit', sortOrder: 0 })
      .expect(201);
    netzbetrieb = (
      await http
        .post('/api/v1/context/org-chart')
        .set(bearer(carla))
        .send({ label: 'Netzbetrieb', kind: 'unit', parentId: wurzel.body.id, sortOrder: 1 })
        .expect(201)
    ).body.id;
    await http
      .post('/api/v1/context/org-chart')
      .set(bearer(carla))
      .send({ label: 'Netzleitstelle', kind: 'person', parentId: netzbetrieb, personId: wenzelId })
      .expect(201);
    const vakanz = await http
      .post('/api/v1/context/org-chart')
      .set(bearer(carla))
      // Auch mit übergebener Person bleibt eine Vakanz unbesetzt — sonst wäre sie keine.
      .send({ label: 'Leittechnik', kind: 'vacancy', parentId: netzbetrieb, personId: wenzelId })
      .expect(201);
    expect(vakanz.body.personId).toBeNull();

    const chart = await http.get('/api/v1/context/org-chart').set(bearer(carla)).expect(200);
    expect(chart.body).toHaveLength(4);
    const besetzt = (chart.body as { kind: string; personName: string | null }[]).find(
      (n) => n.kind === 'person',
    )!;
    expect(besetzt.personName).toBe('Wenzel Rothmund');
    expect((chart.body as { kind: string }[]).filter((n) => n.kind === 'vacancy')).toHaveLength(1);
  });

  it('lässt keinen Knoten unter seinen eigenen Nachfahren wandern', async () => {
    const chart = await http.get('/api/v1/context/org-chart').set(bearer(carla)).expect(200);
    const leitstelle = (chart.body as { id: string; label: string }[]).find(
      (n) => n.label === 'Netzleitstelle',
    )!;
    const res = await http
      .patch(`/api/v1/context/org-chart/${netzbetrieb}`)
      .set(bearer(carla))
      .send({ parentId: leitstelle.id })
      .expect(400);
    expect(res.body.detail).toContain('unterhalb');
  });

  it('löscht einen Teilbaum mit', async () => {
    await http.delete(`/api/v1/context/org-chart/${netzbetrieb}`).set(bearer(carla)).expect(204);
    const chart = await http.get('/api/v1/context/org-chart').set(bearer(carla)).expect(200);
    // Nur die Geschäftsführung bleibt übrig.
    expect(chart.body).toHaveLength(1);
  });
});
