/**
 * Auditprogramm, Feststellungen und Managementbewertung (ISO 27001 Kap. 9.2, 9.3, 10.2).
 *
 * Die drei Regeln, bei denen ein Fehler im Zertifizierungsaudit auffällt:
 *  - eine Nichtkonformität wird nicht ohne Korrekturmaßnahme geschlossen,
 *  - ihre Schließung bestätigt nicht, wer sie behoben hat,
 *  - das Protokoll einer abgeschlossenen Managementbewertung ändert sich nicht mehr.
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;

/** ISMS-Managerin: plant das Auditprogramm, betreibt das ISMS. Darf nicht auditieren. */
let carla = '';
/** Auditor: erhebt Feststellungen und bestätigt ihre Schließung. */
let anton = '';
/** Risk-Owner: verantwortet die Korrekturmaßnahme. */
let rita = '';
let ritaPersonId = '';

let auditId = '';
let findingId = '';
let observationId = '';
let actionId = '';
let reviewId = '';
const reqIds = new Map<string, string>();

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
      tenantName: 'Audit AG',
      tenantSlug: 'audit',
      email: 'carla@audit.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  anton = (await inviteAndAccept(['auditor'], 'anton@audit.test', 'Anton Ahrens', 'anton-passwort-2026-lang'))
    .token;
  const r = await inviteAndAccept(
    ['risk_owner'],
    'rita@audit.test',
    'Rita Reinhardt',
    'rita-passwort-2026-lang',
  );
  rita = r.token;
  ritaPersonId = r.personId;

  const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(carla)).expect(200);
  for (const q of reqs.body as { id: string; refCode: string }[]) reqIds.set(q.refCode, q.id);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Auditprogramm', () => {
  it('plant ein internes Audit mit festgelegtem Umfang', async () => {
    const scope = ['9.1', '9.2.1', 'A.5.1', 'A.5.17', 'A.8.13']
      .map((c) => reqIds.get(c))
      .filter(Boolean) as string[];
    expect(scope.length).toBeGreaterThanOrEqual(3);

    const res = await http
      .post('/api/v1/audits')
      .set(bearer(carla))
      .send({
        title: 'Internes Audit 2026 — Betrieb und Überwachung',
        kind: 'internal',
        frameworkKey: 'ISO27001',
        scope: 'Rechenzentrum, IT-Betrieb, Zugangssteuerung',
        plannedFrom: '2026-09-01',
        plannedTo: '2026-09-10',
        requirementIds: scope,
      })
      .expect(201);
    expect(res.body.refNo).toBe('AUD-0001');
    expect(res.body.status).toBe('planned');
    expect(res.body.scope).toHaveLength(scope.length);
    auditId = res.body.id;
  });

  it('zählt ein geplantes Audit noch nicht als Abdeckung — erst der Bericht zählt', async () => {
    const before = await http
      .get('/api/v1/audits/programme?framework=ISO27001')
      .set(bearer(carla))
      .expect(200);
    const audited = (before.body as { auditedInCycle: number }[]).reduce((n, g) => n + g.auditedInCycle, 0);
    expect(audited).toBe(0);

    // Ohne hinterlegten Bericht gilt das Audit nicht als berichtet (Kap. 9.2.2 f).
    await http.patch(`/api/v1/audits/${auditId}`).set(bearer(carla)).send({ status: 'reported' }).expect(400);

    const upload = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('Auditbericht 2026 — interne Prüfung'), {
        filename: 'auditbericht-2026.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await http
      .patch(`/api/v1/audits/${auditId}`)
      .set(bearer(carla))
      .send({ status: 'reported', reportFileId: upload.body.id })
      .expect(200);

    const detail = await http.get(`/api/v1/audits/${auditId}`).set(bearer(carla)).expect(200);
    expect(detail.body.reportFile.filename).toBe('auditbericht-2026.txt');

    const after = await http
      .get('/api/v1/audits/programme?framework=ISO27001')
      .set(bearer(carla))
      .expect(200);
    const auditedAfter = (after.body as { auditedInCycle: number }[]).reduce(
      (n, g) => n + g.auditedInCycle,
      0,
    );
    expect(auditedAfter).toBeGreaterThanOrEqual(3);
    // Abgedeckt ist nur der Umfang, nicht die ganze Norm.
    const total = (after.body as { total: number }[]).reduce((n, g) => n + g.total, 0);
    expect(auditedAfter).toBeLessThan(total);
  });

  it('öffnet ein abgeschlossenes Audit nicht wieder', async () => {
    await http.patch(`/api/v1/audits/${auditId}`).set(bearer(carla)).send({ status: 'closed' }).expect(200);
    await http
      .patch(`/api/v1/audits/${auditId}`)
      .set(bearer(carla))
      .send({ status: 'in_progress' })
      .expect(400);
  });
});

describe('Feststellungen', () => {
  it('lässt die ISMS-Managerin keine Feststellungen erheben — das ist Sache des Auditors', async () => {
    await http
      .post('/api/v1/findings')
      .set(bearer(carla))
      .send({ title: 'Selbst erhobene Feststellung' })
      .expect(403);
  });

  it('erhebt eine Hauptabweichung mit Bezug zur Anforderung', async () => {
    const res = await http
      .post('/api/v1/findings')
      .set(bearer(anton))
      .send({
        title: 'Zugriffsrechte werden nicht regelmäßig überprüft',
        description: 'Stichprobe: 4 von 10 ausgeschiedenen Beschäftigten hatten weiterhin aktive Konten.',
        source: 'audit',
        severity: 'major',
        auditId,
        requirementId: reqIds.get('A.5.17'),
        dueAt: '2026-12-31',
      })
      .expect(201);
    expect(res.body.refNo).toBe('F-0001');
    expect(res.body.status).toBe('open');
    expect(res.body.refCode).toBe('A.5.17');
    findingId = res.body.id;

    const obs = await http
      .post('/api/v1/findings')
      .set(bearer(anton))
      .send({ title: 'Protokolle könnten länger aufbewahrt werden', severity: 'observation', auditId })
      .expect(201);
    observationId = obs.body.id;
  });

  it('schließt eine Nichtkonformität nicht ohne Korrekturmaßnahme', async () => {
    const res = await http
      .patch(`/api/v1/findings/${findingId}`)
      .set(bearer(anton))
      .send({ status: 'closed' })
      .expect(400);
    expect(res.body.detail).toContain('10.2');
  });

  it('schließt eine Beobachtung dagegen ohne Maßnahme — sie ist keine Nichtkonformität', async () => {
    const res = await http
      .patch(`/api/v1/findings/${observationId}`)
      .set(bearer(anton))
      .send({ status: 'closed' })
      .expect(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.closedAt).not.toBeNull();
  });

  it('nimmt die Feststellung als Auslöser einer KVP-Maßnahme auf', async () => {
    const res = await http
      .post('/api/v1/actions')
      .set(bearer(carla))
      .send({
        title: 'Quartalsweise Rezertifizierung der Zugriffsrechte einführen',
        kind: 'corrective',
        findingId,
        ownerPersonId: ritaPersonId,
        dueAt: '2026-11-30',
      })
      .expect(201);
    actionId = res.body.id;

    const detail = await http.get(`/api/v1/findings/${findingId}`).set(bearer(anton)).expect(200);
    expect(detail.body.actions).toHaveLength(1);
    expect(detail.body.actions[0].ownerName).toBe('Rita Reinhardt');
  });

  it('erlaubt die Schließung, sobald eine Korrekturmaßnahme existiert', async () => {
    await http.patch(`/api/v1/actions/${actionId}`).set(bearer(rita)).send({ status: 'done' }).expect(200);
    const res = await http
      .patch(`/api/v1/findings/${findingId}`)
      .set(bearer(anton))
      .send({ status: 'closed' })
      .expect(200);
    expect(res.body.status).toBe('closed');
  });

  it('lässt den Status „bestätigt“ nicht über die normale Bearbeitung setzen', async () => {
    await http
      .patch(`/api/v1/findings/${findingId}`)
      .set(bearer(anton))
      .send({ status: 'verified' })
      .expect(400);
  });

  it('lässt die Verantwortliche der Korrektur ihre Wirksamkeit nicht selbst bestätigen', async () => {
    // Rita bekommt zusätzlich die Auditorenrolle — fachlich zulässig, hier aber ein SoD-Konflikt.
    const members = await http.get('/api/v1/members').set(bearer(carla)).expect(200);
    const ritaMembership = (members.body as { membershipId: string; email: string }[]).find(
      (m) => m.email === 'rita@audit.test',
    )!;
    await http
      .put(`/api/v1/members/${ritaMembership.membershipId}/roles`)
      .set(bearer(carla))
      .send({ roleKeys: ['auditor'], acknowledgeSodWarnings: true })
      .expect(200);

    const relogin = await http
      .post('/api/v1/auth/login')
      .send({ email: 'rita@audit.test', password: 'rita-passwort-2026-lang' })
      .expect(200);

    const res = await http
      .post(`/api/v1/findings/${findingId}/verify`)
      .set(bearer(relogin.body.accessToken))
      .send({ result: 'Rezertifizierung eingeführt, Stichprobe ohne Befund.' })
      .expect(409);
    expect(res.body.type).toContain('sod-violation');
  });

  it('bestätigt die Schließung durch den Auditor und hält den Nachweis fest', async () => {
    const res = await http
      .post(`/api/v1/findings/${findingId}/verify`)
      .set(bearer(anton))
      .send({ result: 'Rezertifizierung Q4/2026 durchgeführt, Stichprobe von 10 Konten ohne Befund.' })
      .expect(201);
    expect(res.body.status).toBe('verified');
    expect(res.body.verifiedByName).toBe('Anton Ahrens');
    expect(res.body.description).toContain('Nachweis der Schließung');
  });

  it('lässt eine bestätigte Feststellung nicht mehr verändern', async () => {
    await http
      .patch(`/api/v1/findings/${findingId}`)
      .set(bearer(anton))
      .send({ title: 'Doch nicht so schlimm' })
      .expect(409);
  });
});

describe('Kennzahlen', () => {
  it('berechnet Kennzahlen aus dem ISMS statt sie abtippen zu lassen', async () => {
    const computed = await http
      .post('/api/v1/kpis')
      .set(bearer(carla))
      .send({
        name: 'Offene Hauptabweichungen',
        source: 'computed',
        computationKey: 'open_major_findings',
        direction: 'lower_is_better',
        target: 0,
      })
      .expect(201);

    await http
      .post('/api/v1/kpis')
      .set(bearer(carla))
      .send({
        name: 'Umsetzungsgrad der Maßnahmen',
        unit: '%',
        source: 'computed',
        computationKey: 'measure_implementation_pct',
        target: 80,
      })
      .expect(201);

    // Ein Handwert würde den Nachweis entwerten.
    await http
      .post(`/api/v1/kpis/${computed.body.id}/values`)
      .set(bearer(carla))
      .send({ measuredAt: '2026-09-15', value: 0 })
      .expect(400);

    const refresh = await http.post('/api/v1/kpis/refresh').set(bearer(carla)).expect(201);
    expect(refresh.body.updated).toHaveLength(2);

    const list = await http.get('/api/v1/kpis').set(bearer(carla)).expect(200);
    const major = (list.body as { name: string; value: string; targetMet: boolean | null }[]).find(
      (k) => k.name === 'Offene Hauptabweichungen',
    )!;
    // F-0001 ist bestätigt geschlossen, also keine offene Hauptabweichung mehr.
    expect(Number(major.value)).toBe(0);
    expect(major.targetMet).toBe(true);
  });

  it('nimmt für manuelle Kennzahlen Werte entgegen', async () => {
    const kpi = await http
      .post('/api/v1/kpis')
      .set(bearer(carla))
      .send({ name: 'Teilnahmequote Awareness-Schulung', unit: '%', source: 'manual', target: 95 })
      .expect(201);
    await http
      .post(`/api/v1/kpis/${kpi.body.id}/values`)
      .set(bearer(carla))
      .send({ measuredAt: '2026-06-30', value: 88 })
      .expect(201);
    await http
      .post(`/api/v1/kpis/${kpi.body.id}/values`)
      .set(bearer(carla))
      .send({ measuredAt: '2026-09-30', value: 96 })
      .expect(201);

    const history = await http.get(`/api/v1/kpis/${kpi.body.id}/history`).set(bearer(carla)).expect(200);
    expect(history.body).toHaveLength(2);
  });
});

describe('Managementbewertung', () => {
  it('stellt die Tagesordnung nach Kap. 9.3.2 aus den gepflegten Daten zusammen', async () => {
    const res = await http.get('/api/v1/management-reviews/preview').set(bearer(carla)).expect(200);
    expect(res.body.nonconformities.total).toBe(2);
    expect(res.body.nonconformities.major).toBe(1);
    expect(res.body.nonconformities.verified).toBe(1);
    expect(res.body.audits).toHaveLength(1);
    expect(res.body.audits[0].refNo).toBe('AUD-0001');
    expect(res.body.kpis.length).toBe(3);
    expect(res.body.previousReviewId).toBeNull();
  });

  it('legt eine Sitzung an und zeigt den aktuellen Stand', async () => {
    const res = await http
      .post('/api/v1/management-reviews')
      .set(bearer(carla))
      .send({ heldAt: '2026-09-15' })
      .expect(201);
    expect(res.body.status).toBe('planned');
    expect(res.body.inputs.audits).toHaveLength(1);
    reviewId = res.body.id;
  });

  it('friert die Eingaben beim Abschluss ein und nimmt das Protokoll als Datei auf', async () => {
    const minutes = await http
      .post('/api/v1/files')
      .set(bearer(carla))
      .attach('file', Buffer.from('Protokoll der Managementbewertung, unterzeichnet'), {
        filename: 'protokoll-managementbewertung.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const closed = await http
      .post(`/api/v1/management-reviews/${reviewId}/close`)
      .set(bearer(carla))
      .send({
        decisions:
          'Rezertifizierung wird auf alle Systeme ausgeweitet; Budget für ein SIEM wird freigegeben.',
        minutesFileId: minutes.body.id,
      })
      .expect(201);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.minutesFile.filename).toBe('protokoll-managementbewertung.pdf');
    expect(closed.body.inputs.frozenAt).toBeTruthy();
    const frozenFindings = closed.body.inputs.nonconformities.total;

    // Neue Feststellung nach der Sitzung — das Protokoll darf sich davon nicht ändern.
    await http
      .post('/api/v1/findings')
      .set(bearer(anton))
      .send({ title: 'Nachgelagerte Feststellung', severity: 'minor', source: 'self_assessment' })
      .expect(201);

    const reread = await http.get(`/api/v1/management-reviews/${reviewId}`).set(bearer(carla)).expect(200);
    expect(reread.body.inputs.nonconformities.total).toBe(frozenFindings);
  });

  it('schließt eine Sitzung nicht zweimal', async () => {
    await http
      .post(`/api/v1/management-reviews/${reviewId}/close`)
      .set(bearer(carla))
      .send({ decisions: 'Noch ein Nachtrag zur Sitzung.' })
      .expect(400);
  });

  it('nimmt Beschlüsse als KVP-Maßnahmen auf und führt sie in die nächste Sitzung', async () => {
    await http
      .post('/api/v1/actions')
      .set(bearer(carla))
      .send({ title: 'SIEM-Beschaffung starten', kind: 'improvement', reviewId, dueAt: '2026-12-15' })
      .expect(201);

    const next = await http
      .post('/api/v1/management-reviews')
      .set(bearer(carla))
      .send({ heldAt: '2027-03-15' })
      .expect(201);
    expect(next.body.inputs.previousReviewId).toBe(reviewId);
    expect(next.body.inputs.priorActions).toHaveLength(1);
    expect(next.body.inputs.priorActions[0].title).toBe('SIEM-Beschaffung starten');
  });
});

describe('Nachweise an Feststellungen (Kap. 10.2)', () => {
  it('belegt die Wirksamkeit an der Feststellung, nicht an der Maßnahme', async () => {
    // Der Beleg, dass eine Abweichung wirklich behoben ist, gehört an die Abweichung.
    const datei = await http
      .post('/api/v1/files')
      .set(bearer(anton))
      .attach('file', Buffer.from('Stichprobe nach Umsetzung: 9 von 9 Konten mit zweiter Stufe'), {
        filename: 'nachpruefung.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const nachweis = await http
      .post('/api/v1/evidence')
      .set(bearer(carla))
      .send({ title: 'Nachprüfung der Zugriffsrechte', fileId: datei.body.id })
      .expect(201);

    const verknuepft = await http
      .post(`/api/v1/evidence/finding/${findingId}`)
      .set(bearer(anton))
      .send({ evidenceId: nachweis.body.id })
      .expect(201);
    expect(verknuepft.body).toHaveLength(1);
    expect(verknuepft.body[0].filename).toBe('nachpruefung.txt');

    const gelesen = await http.get(`/api/v1/evidence/finding/${findingId}`).set(bearer(carla)).expect(200);
    expect(gelesen.body).toHaveLength(1);

    await http
      .delete(`/api/v1/evidence/finding/${findingId}/${nachweis.body.id}`)
      .set(bearer(anton))
      .expect(200);
    const leer = await http.get(`/api/v1/evidence/finding/${findingId}`).set(bearer(carla)).expect(200);
    expect(leer.body).toHaveLength(0);
  });

  it('lässt niemanden ohne Auditrecht Nachweise an Feststellungen hängen', async () => {
    // Eigene Risk-Ownerin: Rita hat in einem früheren Fall zusätzlich die Auditorenrolle
    // bekommen und darf seitdem Feststellungen bearbeiten.
    const { token: ohneAuditrecht } = await inviteAndAccept(
      ['risk_owner'],
      'nils@audit.test',
      'Nils Neuhaus',
      'nils-passwort-2026-lang',
    );
    await http
      .post(`/api/v1/evidence/finding/${findingId}`)
      .set(bearer(ohneAuditrecht))
      .send({ evidenceId: '00000000-0000-0000-0000-000000000000' })
      .expect(403);
  });
});
