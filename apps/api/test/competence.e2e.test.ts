/**
 * Kompetenz (ISO 27001 Kap. 7.2) und Sensibilisierung (Kap. 7.3).
 *
 * Der Nachweis, den ein Audit verlangt, ist nicht die Teilnehmerliste, sondern der
 * Soll-Ist-Abgleich: welche Fähigkeit fehlt welcher Person in welcher Stufe.
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
let skillForensics = '';
let skillCrypto = '';
let skillAwareness = '';
let profileAdmin = '';
let trainingId = '';

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
      tenantName: 'Kompetenz AG',
      tenantSlug: 'kompetenz',
      email: 'carla@kompetenz.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@kompetenz.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;
  const me = await http.get('/api/v1/auth/me').set(bearer(rita)).expect(200);
  ritaPersonId = me.body.personId;

  const bernd = await http
    .post('/api/v1/persons')
    .set(bearer(carla))
    .send({ name: 'Bernd Betrieb', department: 'IT-Betrieb', position: 'Systemadministrator' })
    .expect(201);
  berndId = bernd.body.id;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Fähigkeiten und Kompetenzprofile', () => {
  it('erfasst Fähigkeiten und weist doppelte Namen zurück', async () => {
    const f = await http
      .post('/api/v1/competence/skills')
      .set(bearer(carla))
      .send({ name: 'IT-Forensik' })
      .expect(201);
    skillForensics = f.body.id;
    const c = await http
      .post('/api/v1/competence/skills')
      .set(bearer(carla))
      .send({ name: 'Kryptografie und Schlüsselverwaltung' })
      .expect(201);
    skillCrypto = c.body.id;
    const a = await http
      .post('/api/v1/competence/skills')
      .set(bearer(carla))
      .send({ name: 'Security-Awareness' })
      .expect(201);
    skillAwareness = a.body.id;

    await http.post('/api/v1/competence/skills').set(bearer(carla)).send({ name: 'IT-Forensik' }).expect(409);
  });

  it('legt ein Kompetenzprofil mit Mindeststufen an', async () => {
    const res = await http
      .post('/api/v1/competence/profiles')
      .set(bearer(carla))
      .send({
        name: 'Systemadministration',
        description: 'Betrieb der zentralen Systeme',
        requirements: [
          { skillId: skillCrypto, minLevel: 4 },
          { skillId: skillForensics, minLevel: 2 },
          { skillId: skillAwareness, minLevel: 3 },
        ],
      })
      .expect(201);
    profileAdmin = res.body.id;

    const list = await http.get('/api/v1/competence/profiles').set(bearer(carla)).expect(200);
    const p = (list.body as { id: string; requirements: { name: string; minLevel: number }[] }[]).find(
      (x) => x.id === profileAdmin,
    )!;
    expect(p.requirements).toHaveLength(3);
    expect(p.requirements.find((r) => r.name === 'Kryptografie und Schlüsselverwaltung')!.minLevel).toBe(4);
  });

  it('prüft die Stufe auf den Bereich 1–5', async () => {
    await http
      .post('/api/v1/competence/profiles')
      .set(bearer(carla))
      .send({ name: 'Unmögliches Profil', requirements: [{ skillId: skillCrypto, minLevel: 9 }] })
      .expect(400);
  });
});

describe('Soll-Ist-Abgleich', () => {
  it('meldet ohne erfassten Ist-Stand die volle Lücke', async () => {
    await http
      .put(`/api/v1/competence/persons/${berndId}/profiles`)
      .set(bearer(carla))
      .send({ profileIds: [profileAdmin] })
      .expect(200);

    const person = await http.get(`/api/v1/competence/persons/${berndId}`).set(bearer(carla)).expect(200);
    expect(person.body.profiles).toHaveLength(1);
    expect(person.body.gaps).toHaveLength(3);
    const crypto = (person.body.gaps as { name: string; gap: number; actualLevel: number }[]).find((g) =>
      g.name.startsWith('Kryptografie'),
    )!;
    expect(crypto.actualLevel).toBe(0);
    expect(crypto.gap).toBe(4);
  });

  it('schließt die Lücke mit dem erfassten Stand samt Nachweis', async () => {
    const res = await http
      .put(`/api/v1/competence/persons/${berndId}/skills`)
      .set(bearer(carla))
      .send({
        skillId: skillCrypto,
        level: 4,
        evidenceNote: 'Zertifikat „Applied Cryptography“, Juni 2026',
        validUntil: '2029-06-30',
      })
      .expect(200);
    expect((res.body.gaps as { name: string }[]).some((g) => g.name.startsWith('Kryptografie'))).toBe(false);
    expect(res.body.gaps).toHaveLength(2);
    expect(res.body.skills).toHaveLength(1);
    expect(res.body.skills[0].evidenceNote).toContain('Applied Cryptography');
  });

  it('überschreibt einen bestehenden Stand statt zu verdoppeln', async () => {
    const res = await http
      .put(`/api/v1/competence/persons/${berndId}/skills`)
      .set(bearer(carla))
      .send({ skillId: skillCrypto, level: 5 })
      .expect(200);
    expect(res.body.skills).toHaveLength(1);
    expect(res.body.skills[0].level).toBe(5);
  });

  it('führt teilweise Erfüllung weiterhin als Lücke', async () => {
    const res = await http
      .put(`/api/v1/competence/persons/${berndId}/skills`)
      .set(bearer(carla))
      .send({ skillId: skillAwareness, level: 1 })
      .expect(200);
    const awareness = (res.body.gaps as { name: string; gap: number; minLevel: number }[]).find(
      (g) => g.name === 'Security-Awareness',
    )!;
    expect(awareness.minLevel).toBe(3);
    expect(awareness.gap).toBe(2);
  });

  it('sortiert die Qualifikationsmatrix nach der größten Lücke', async () => {
    const res = await http.get('/api/v1/competence/matrix').set(bearer(carla)).expect(200);
    const bernd = (
      res.body as {
        id: string;
        openGaps: number;
        maxGap: number;
        requiredSkills: number;
        profileNames: string;
      }[]
    ).find((p) => p.id === berndId)!;
    expect(bernd.profileNames).toBe('Systemadministration');
    expect(bernd.requiredSkills).toBe(3);
    expect(bernd.openGaps).toBe(2);
    expect(bernd.maxGap).toBe(2);
    expect(res.body[0].id).toBe(berndId); // größte Lücke steht oben

    // Ohne Profil keine Anforderung — und damit auch keine Lücke.
    const ritaRow = (res.body as { id: string; requiredSkills: number; openGaps: number }[]).find(
      (p) => p.id === ritaPersonId,
    )!;
    expect(ritaRow.requiredSkills).toBe(0);
    expect(ritaRow.openGaps).toBe(0);
  });

  it('bündelt die Lücken je Fähigkeit für den Schulungsplan', async () => {
    const res = await http.get('/api/v1/competence/gaps').set(bearer(carla)).expect(200);
    const names = (res.body as { name: string; affectedPersons: number }[]).map((g) => g.name);
    expect(names).toContain('Security-Awareness');
    expect(names).toContain('IT-Forensik');
    expect(names).not.toContain('Kryptografie und Schlüsselverwaltung');
  });

  it('lässt Rollen ohne Kompetenz-Schreibrecht nichts ändern', async () => {
    await http
      .put(`/api/v1/competence/persons/${berndId}/skills`)
      .set(bearer(rita))
      .send({ skillId: skillForensics, level: 5 })
      .expect(403);
  });
});

describe('Schulungen', () => {
  it('legt eine Schulung an und weist sie allen aktiven Beschäftigten zu', async () => {
    const t = await http
      .post('/api/v1/trainings')
      .set(bearer(carla))
      .send({
        title: 'Security-Awareness 2026',
        kind: 'awareness',
        description: 'Phishing, Passwörter, Meldewege',
      })
      .expect(201);
    trainingId = t.body.id;

    const assigned = await http
      .post(`/api/v1/trainings/${trainingId}/assign`)
      .set(bearer(carla))
      .send({ dueAt: '2026-12-31' })
      .expect(201);
    expect(assigned.body.participants).toHaveLength(3); // Carla, Rita, Bernd
    expect(
      (assigned.body.participants as { completedAt: string | null }[]).every((p) => p.completedAt === null),
    ).toBe(true);
  });

  it('listet die offene Schulung bei der betroffenen Person', async () => {
    const res = await http.get('/api/v1/trainings/mine').set(bearer(rita)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].trainingId).toBe(trainingId);
  });

  it('bestätigt die eigene Teilnahme und leert die eigene Liste', async () => {
    const res = await http
      .post(`/api/v1/trainings/${trainingId}/complete`)
      .set(bearer(rita))
      .send({ score: 92 })
      .expect(201);
    expect(res.body.completedAt).not.toBeNull();
    expect(res.body.score).toBe(92);

    const mine = await http.get('/api/v1/trainings/mine').set(bearer(rita)).expect(200);
    expect(mine.body).toHaveLength(0);
  });

  it('setzt eine abgeschlossene Teilnahme bei erneuter Zuweisung nicht zurück', async () => {
    const again = await http
      .post(`/api/v1/trainings/${trainingId}/assign`)
      .set(bearer(carla))
      .send({ dueAt: '2027-06-30' })
      .expect(201);
    expect(again.body.participants).toHaveLength(3);
    const ritaRow = (again.body.participants as { personId: string; completedAt: string | null }[]).find(
      (p) => p.personId === ritaPersonId,
    )!;
    expect(ritaRow.completedAt).not.toBeNull();
  });

  it('weist eine Teilnahme ohne Zuweisung zurück', async () => {
    const extra = await http
      .post('/api/v1/persons')
      .set(bearer(carla))
      .send({ name: 'Neue Kollegin' })
      .expect(201);
    await http
      .post(`/api/v1/trainings/${trainingId}/complete`)
      .set(bearer(carla))
      .send({ personId: extra.body.id })
      .expect(404);
  });

  it('weist den Teilnahmestand im Register aus', async () => {
    const res = await http.get('/api/v1/trainings').set(bearer(carla)).expect(200);
    const t = (res.body as { id: string; assigned: number; completed: number; overdue: number }[]).find(
      (x) => x.id === trainingId,
    )!;
    expect(t.assigned).toBe(3);
    expect(t.completed).toBe(1);
    expect(t.overdue).toBe(0);
  });

  it('zählt offene Schulungen in der Qualifikationsmatrix mit', async () => {
    const res = await http.get('/api/v1/competence/matrix').set(bearer(carla)).expect(200);
    const bernd = (res.body as { id: string; openTrainings: number }[]).find((p) => p.id === berndId)!;
    expect(bernd.openTrainings).toBe(1);
    const ritaRow = (res.body as { id: string; openTrainings: number }[]).find((p) => p.id === ritaPersonId)!;
    expect(ritaRow.openTrainings).toBe(0);
  });

  it('weist gezielt einzelne Personen zu, ohne die übrigen einzubeziehen', async () => {
    // Eigene Person, damit der Test die Zählungen der übrigen Fälle nicht verschiebt.
    const leitung = await http
      .post('/api/v1/persons')
      .set(bearer(carla))
      .send({ name: 'Lea Leitung' })
      .expect(201);
    const t = await http
      .post('/api/v1/trainings')
      .set(bearer(carla))
      .send({ title: 'Leitungsschulung NIS2', kind: 'nis2_management' })
      .expect(201);

    const res = await http
      .post(`/api/v1/trainings/${t.body.id}/assign`)
      .set(bearer(carla))
      .send({ personIds: [leitung.body.id], dueAt: '2026-11-30' })
      .expect(201);
    expect(res.body.participants).toHaveLength(1);
    expect(res.body.participants[0].personId).toBe(leitung.body.id);
  });
});
