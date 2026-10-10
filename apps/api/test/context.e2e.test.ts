/**
 * Kontext der Organisation (ISO 27001 Kap. 4), Beschäftigte und Informationssicherheitsziele
 * (Kap. 6.2). Der eigentliche Nachweis ist, dass diese Register in der Managementbewertung
 * nach Kap. 9.3.2 b), c), d.4) und e) ankommen — ohne sie bleibt die Tagesordnung leer.
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
let personId = '';
let objectiveId = '';
let partyId = '';
let factorId = '';
const reqIds = new Map<string, string>();

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
      tenantName: 'Kontext AG',
      tenantSlug: 'kontext',
      email: 'carla@kontext.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@kontext.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;

  const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(carla)).expect(200);
  for (const r of reqs.body as { id: string; refCode: string }[]) reqIds.set(r.refCode, r.id);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Beschäftigte', () => {
  it('führt eingeladene Mitglieder bereits als Person', async () => {
    const res = await http.get('/api/v1/persons').set(bearer(carla)).expect(200);
    const names = (res.body as { name: string; hasLogin: boolean }[]).map((p) => p.name);
    expect(names).toContain('Carla CISO');
    expect(names).toContain('Rita Reinhardt');
    expect((res.body as { hasLogin: boolean }[]).every((p) => p.hasLogin)).toBe(true);
  });

  it('erfasst Beschäftigte ohne Benutzerkonto — Verantwortung braucht kein Login', async () => {
    const res = await http
      .post('/api/v1/persons')
      .set(bearer(carla))
      .send({
        name: 'Bernd Betrieb',
        email: 'bernd@kontext.test',
        department: 'IT-Betrieb',
        position: 'Systemadministrator',
      })
      .expect(201);
    expect(res.body.isActive).toBe(true);
    personId = res.body.id;

    const list = await http.get('/api/v1/persons').set(bearer(carla)).expect(200);
    const bernd = (list.body as { id: string; hasLogin: boolean }[]).find((p) => p.id === personId)!;
    expect(bernd.hasLogin).toBe(false);
  });

  it('weist eine doppelte E-Mail zurück', async () => {
    await http
      .post('/api/v1/persons')
      .set(bearer(carla))
      .send({ name: 'Bernd Zwei', email: 'bernd@kontext.test' })
      .expect(409);
  });

  it('zeigt die zugewiesene Verantwortung je Person', async () => {
    await http
      .post('/api/v1/assets')
      .set(bearer(carla))
      .send({ name: 'Backup-Storage', category: 'system', ownerPersonId: personId })
      .expect(201);

    const list = await http.get('/api/v1/persons').set(bearer(carla)).expect(200);
    const bernd = (list.body as { id: string; assetCount: number }[]).find((p) => p.id === personId)!;
    expect(bernd.assetCount).toBe(1);
  });

  it('deaktiviert statt zu löschen und blendet Deaktivierte aus', async () => {
    const extra = await http
      .post('/api/v1/persons')
      .set(bearer(carla))
      .send({ name: 'Ehemalige Kollegin' })
      .expect(201);
    await http.delete(`/api/v1/persons/${extra.body.id}`).set(bearer(carla)).expect(200);

    const active = await http.get('/api/v1/persons').set(bearer(carla)).expect(200);
    expect((active.body as { id: string }[]).some((p) => p.id === extra.body.id)).toBe(false);

    const all = await http.get('/api/v1/persons?includeInactive=true').set(bearer(carla)).expect(200);
    const gone = (all.body as { id: string; isActive: boolean }[]).find((p) => p.id === extra.body.id)!;
    expect(gone.isActive).toBe(false);
  });

  it('lässt Rollen ohne Kontext-Schreibrecht keine Personen anlegen', async () => {
    await http.post('/api/v1/persons').set(bearer(rita)).send({ name: 'Heimlich Eingefügt' }).expect(403);
  });
});

describe('Geltungsbereich (Kap. 4.3)', () => {
  it('ist leer, bis jemand ihn festhält, und lässt sich dann überschreiben', async () => {
    const empty = await http.get('/api/v1/context/scope').set(bearer(carla)).expect(200);
    expect(empty.body).toEqual({});

    await http
      .put('/api/v1/context/scope')
      .set(bearer(carla))
      .send({ statement: 'Netzbetrieb, Leitstelle und zentrale IT am Standort Kiel.' })
      .expect(200);
    const saved = await http
      .put('/api/v1/context/scope')
      .set(bearer(carla))
      .send({
        statement: 'Netzbetrieb, Leitstelle und zentrale IT am Standort Kiel.',
        interfaces: 'Rechenzentrum des Dienstleisters, Übertragungsnetzbetreiber',
        exclusions: 'Kantine: verarbeitet keine schutzbedürftigen Informationen.',
      })
      .expect(200);
    expect(saved.body.interfaces).toContain('Rechenzentrum');
    expect(saved.body.updatedByName).toBe('Carla CISO');
  });

  it('verlangt eine Beschreibung und das Schreibrecht im Kontext', async () => {
    await http.put('/api/v1/context/scope').set(bearer(carla)).send({ statement: 'kurz' }).expect(400);
    await http
      .put('/api/v1/context/scope')
      .set(bearer(rita))
      .send({ statement: 'Alles außer der Buchhaltung, bitte.' })
      .expect(403);
  });
});

describe('Interessierte Parteien (Kap. 4.2)', () => {
  it('erfasst bindende Erwartungen und sortiert sie nach oben', async () => {
    await http
      .post('/api/v1/context/parties')
      .set(bearer(carla))
      .send({
        name: 'Bundesnetzagentur',
        category: 'regulator',
        expectations: 'Meldung erheblicher Vorfälle nach NIS2 binnen 24 h.',
        isBinding: true,
        influence: 3,
      })
      .expect(201);
    const p2 = await http
      .post('/api/v1/context/parties')
      .set(bearer(carla))
      .send({
        name: 'Öffentlichkeit',
        category: 'public',
        expectations: 'Transparenz bei Datenpannen.',
        isBinding: false,
        influence: 1,
      })
      .expect(201);
    partyId = p2.body.id;

    const list = await http.get('/api/v1/context/parties').set(bearer(carla)).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].name).toBe('Bundesnetzagentur');
    expect(list.body[0].isBinding).toBe(true);
  });

  it('prüft den Einflussgrad auf den Bereich 1–3', async () => {
    await http
      .post('/api/v1/context/parties')
      .set(bearer(carla))
      .send({ name: 'Zu wichtig', category: 'other', influence: 5 })
      .expect(400);
  });

  it('ändert und entfernt eine Partei', async () => {
    const patched = await http
      .patch(`/api/v1/context/parties/${partyId}`)
      .set(bearer(carla))
      .send({ isBinding: true, addressedVia: 'Datenschutzerklärung und Pressemitteilung' })
      .expect(200);
    expect(patched.body.isBinding).toBe(true);

    await http.delete(`/api/v1/context/parties/${partyId}`).set(bearer(carla)).expect(204);
    const list = await http.get('/api/v1/context/parties').set(bearer(carla)).expect(200);
    expect(list.body).toHaveLength(1);
  });
});

describe('PESTLE-Analyse (Kap. 4.1)', () => {
  it('erfasst externe Themen als Risiko und als Chance', async () => {
    const f = await http
      .post('/api/v1/context/factors')
      .set(bearer(carla))
      .send({
        dimension: 'legal',
        title: 'NIS2-Umsetzung verschärft Meldepflichten',
        description: 'Als wichtige Einrichtung gelten Fristen von 24 h und 72 h.',
        effect: 'risk',
        relevance: 3,
      })
      .expect(201);
    factorId = f.body.id;

    await http
      .post('/api/v1/context/factors')
      .set(bearer(carla))
      .send({
        dimension: 'technological',
        title: 'Zertifizierung als Vertriebsargument',
        effect: 'opportunity',
        relevance: 2,
      })
      .expect(201);

    const list = await http.get('/api/v1/context/factors').set(bearer(carla)).expect(200);
    expect(list.body).toHaveLength(2);
    expect((list.body as { effect: string }[]).map((x) => x.effect).sort()).toEqual(['opportunity', 'risk']);
  });

  it('verknüpft ein Thema mit einem Risiko im Register', async () => {
    const risk = await http
      .post('/api/v1/risks')
      .set(bearer(carla))
      .send({ title: 'Verstoß gegen NIS2-Meldefristen' })
      .expect(201);

    const patched = await http
      .patch(`/api/v1/context/factors/${factorId}`)
      .set(bearer(carla))
      .send({ linkedRiskId: risk.body.id })
      .expect(200);
    expect(patched.body.linkedRiskId).toBe(risk.body.id);

    const list = await http.get('/api/v1/context/factors').set(bearer(carla)).expect(200);
    const linked = (list.body as { id: string; riskRefNo: string | null }[]).find((x) => x.id === factorId)!;
    expect(linked.riskRefNo).toBe('R-0001');
  });
});

describe('Informationssicherheitsziele (Kap. 6.2)', () => {
  it('legt ein Ziel mit Bezug zu Normanforderungen an', async () => {
    const res = await http
      .post('/api/v1/context/objectives')
      .set(bearer(carla))
      .send({
        title: 'Alle privilegierten Konten mit MFA absichern',
        kind: 'operational',
        ownerPersonId: personId,
        targetValue: '100',
        currentValue: '62',
        unit: '%',
        frequency: 'quartalsweise',
        dueDate: '2026-12-31',
        requirementIds: [reqIds.get('A.5.17'), reqIds.get('A.8.5')].filter(Boolean),
      })
      .expect(201);
    expect(res.body.status).toBe('draft');
    objectiveId = res.body.id;

    const list = await http.get('/api/v1/context/objectives').set(bearer(carla)).expect(200);
    const o = (list.body as { id: string; ownerName: string; requirements: { refCode: string }[] }[]).find(
      (x) => x.id === objectiveId,
    )!;
    expect(o.ownerName).toBe('Bernd Betrieb');
    expect(o.requirements.map((r) => r.refCode).sort()).toEqual(['A.5.17', 'A.8.5']);
  });

  it('erscheint erst nach Verabschiedung in der Managementbewertung', async () => {
    const draft = await http.get('/api/v1/management-reviews/preview').set(bearer(carla)).expect(200);
    expect(draft.body.objectives).toHaveLength(0);

    await http
      .patch(`/api/v1/context/objectives/${objectiveId}`)
      .set(bearer(carla))
      .send({ status: 'active' })
      .expect(200);

    const active = await http.get('/api/v1/management-reviews/preview').set(bearer(carla)).expect(200);
    expect(active.body.objectives).toHaveLength(1);
    expect(active.body.objectives[0].currentValue).toBe('62');
  });

  it('liefert Kontextänderungen und bindende Erwartungen an die Managementbewertung', async () => {
    const res = await http.get('/api/v1/management-reviews/preview').set(bearer(carla)).expect(200);
    const kinds = (res.body.contextChanges as { kind: string }[]).map((c) => c.kind);
    expect(kinds).toContain('pestle');
    expect(kinds).toContain('interested_party');
    expect(res.body.interestedParties).toHaveLength(1);
    expect(res.body.interestedParties[0].name).toBe('Bundesnetzagentur');
  });

  it('bewertet „niedriger ist besser“ nicht als übererfülltes Ziel', async () => {
    const res = await http
      .post('/api/v1/context/objectives')
      .set(bearer(carla))
      .send({
        title: 'Wiederherstellung kritischer Systeme binnen 4 Stunden',
        kind: 'strategic',
        currentValue: '6',
        targetValue: '4',
        unit: 'h',
        direction: 'lower_is_better',
      })
      .expect(201);
    expect(res.body.direction).toBe('lower_is_better');

    const list = await http.get('/api/v1/context/objectives').set(bearer(carla)).expect(200);
    const o = (list.body as { id: string; direction: string }[]).find((x) => x.id === res.body.id)!;
    expect(o.direction).toBe('lower_is_better');
  });

  it('aktualisiert den Messwert und die Zuordnung zur Norm', async () => {
    const res = await http
      .patch(`/api/v1/context/objectives/${objectiveId}`)
      .set(bearer(carla))
      .send({ currentValue: '100', status: 'achieved', requirementIds: [reqIds.get('A.5.17')] })
      .expect(200);
    expect(res.body.status).toBe('achieved');

    const list = await http.get('/api/v1/context/objectives').set(bearer(carla)).expect(200);
    const o = (list.body as { id: string; requirements: { refCode: string }[] }[]).find(
      (x) => x.id === objectiveId,
    )!;
    expect(o.requirements).toHaveLength(1);
  });
});
