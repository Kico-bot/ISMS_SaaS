/**
 * Vorfälle und Meldefristen. Die Fristen sind der Teil, bei dem ein Fehler am teuersten wird:
 * DSGVO Art. 33 (72 h ab Bekanntwerden) und NIS2 Art. 23 Abs. 4 (24 h / 72 h / 1 Monat ab Meldung).
 */
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareTestDatabase, setTestEnv } from './setup';

let app: INestApplication;
let http: ReturnType<typeof request>;
let ciso = '';
let incidentId = '';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const hoursBetween = (a: string, b: string) => (new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;

interface Obligation {
  id: string;
  regime: string;
  dueAt: string | null;
  authority: string;
  fulfilledAt: string | null;
  label: string;
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
      tenantName: 'Vorfall AG',
      tenantSlug: 'vorfall',
      email: 'ciso@vorfall.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  ciso = reg.body.accessToken;
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Vorfall erfassen', () => {
  it('legt einen Vorfall mit Referenznummer und Zeitleisteneintrag an', async () => {
    const res = await http
      .post('/api/v1/incidents')
      .set(bearer(ciso))
      .send({
        title: 'Emotet-Variante auf WIN-DC01 erkannt',
        category: 'malware',
        severity: 'critical',
        source: 'siem',
        externalRef: 'SIEM-10241',
      })
      .expect(201);
    expect(res.body.refNo).toBe('INC-0001');
    incidentId = res.body.id;

    const detail = await http.get(`/api/v1/incidents/${incidentId}`).set(bearer(ciso)).expect(200);
    expect(detail.body.timeline).toHaveLength(1);
    expect(detail.body.timeline[0].kind).toBe('created');
    expect(detail.body.obligations).toHaveLength(0);
  });
});

describe('DSGVO Art. 33 — Datenpanne', () => {
  const confirmedAt = '2026-09-15T08:00:00.000Z';

  it('startet mit der Bestätigung die 72-Stunden-Frist', async () => {
    const res = await http
      .post(`/api/v1/incidents/${incidentId}/confirm-breach`)
      .set(bearer(ciso))
      .send({ confirmedAt, affectedPersons: 1200, highRiskForIndividuals: true })
      .expect(201);

    const art33 = (res.body.obligations as Obligation[]).find((o) => o.regime === 'gdpr_art33')!;
    expect(hoursBetween(art33.dueAt!, confirmedAt)).toBe(72);
    expect(art33.authority).toMatch(/Aufsichtsbehörde/);

    // Art. 34 kennt keine feste Frist — "unverzüglich" lässt sich nicht als Datum behaupten.
    const art34 = (res.body.obligations as Obligation[]).find((o) => o.regime === 'gdpr_art34')!;
    expect(art34.dueAt).toBeNull();
    expect(res.body.isPersonalDataBreach).toBe(true);
    expect(res.body.affectedPersons).toBe(1200);
  });

  it('erzeugt Art. 34 nur bei hohem Risiko für die Betroffenen', async () => {
    const other = await http
      .post('/api/v1/incidents')
      .set(bearer(ciso))
      .send({ title: 'Fehlversand einer E-Mail' })
      .expect(201);
    const res = await http
      .post(`/api/v1/incidents/${other.body.id}/confirm-breach`)
      .set(bearer(ciso))
      .send({ affectedPersons: 1, highRiskForIndividuals: false })
      .expect(201);
    expect((res.body.obligations as Obligation[]).map((o) => o.regime)).toEqual(['gdpr_art33']);
  });

  it('lässt die Frist nicht durch erneutes Bestätigen verschieben', async () => {
    const res = await http
      .post(`/api/v1/incidents/${incidentId}/confirm-breach`)
      .set(bearer(ciso))
      .send({ confirmedAt: '2026-09-20T08:00:00.000Z' })
      .expect(400);
    expect(res.body.title).toMatch(/bereits bestätigt/);
  });
});

describe('NIS2 Art. 23 — erheblicher Sicherheitsvorfall', () => {
  const knownAt = '2026-09-15T06:18:00.000Z';

  it('erzeugt Frühwarnung (24 h), Meldung (72 h), Zwischen- und Abschlussbericht', async () => {
    const res = await http
      .post(`/api/v1/incidents/${incidentId}/mark-significant`)
      .set(bearer(ciso))
      .send({ knownAt, crossBorder: false })
      .expect(201);

    const byRegime = Object.fromEntries((res.body.obligations as Obligation[]).map((o) => [o.regime, o]));
    expect(hoursBetween(byRegime.nis2_early_warning_24h!.dueAt!, knownAt)).toBe(24);
    expect(hoursBetween(byRegime.nis2_notification_72h!.dueAt!, knownAt)).toBe(72);
    // Zwischenbericht nur auf Ersuchen des CSIRT — keine gesetzliche Frist
    expect(byRegime.nis2_progress!.dueAt).toBeNull();
    // Abschlussbericht: ein Monat nach der 72-Stunden-Meldung, solange diese noch aussteht als Planwert
    expect(new Date(byRegime.nis2_final_1m!.dueAt!).toISOString()).toBe('2026-10-18T06:18:00.000Z');
    expect(res.body.nis2Relevant).toBe(true);
  });

  it('rechnet die Frist für den Abschlussbericht ab der tatsächlichen Meldung neu', async () => {
    const detail = await http.get(`/api/v1/incidents/${incidentId}`).set(bearer(ciso)).expect(200);
    const notification = (detail.body.obligations as Obligation[]).find(
      (o) => o.regime === 'nis2_notification_72h',
    )!;

    // Die Meldung geht früher raus als erlaubt — dann beginnt auch die Monatsfrist früher.
    const res = await http
      .post(`/api/v1/incidents/${incidentId}/obligations/${notification.id}/fulfil`)
      .set(bearer(ciso))
      .send({ fulfilledAt: '2026-09-16T09:00:00.000Z', reference: 'BSI-2026-4711' })
      .expect(201);

    const byRegime = Object.fromEntries((res.body.obligations as Obligation[]).map((o) => [o.regime, o]));
    expect(byRegime.nis2_notification_72h!.fulfilledAt).toBeTruthy();
    expect(new Date(byRegime.nis2_final_1m!.dueAt!).toISOString()).toBe('2026-10-16T09:00:00.000Z');
  });

  it('trägt das Absetzen der Meldung in die Zeitleiste ein', async () => {
    const detail = await http.get(`/api/v1/incidents/${incidentId}`).set(bearer(ciso)).expect(200);
    expect(
      (detail.body.timeline as { kind: string; text: string }[]).some(
        (t) => t.kind === 'report' && t.text.includes('BSI-2026-4711'),
      ),
    ).toBe(true);
  });

  it('meldet einen Monatsüberlauf korrekt (31.01. + 1 Monat)', async () => {
    const inc = await http
      .post('/api/v1/incidents')
      .set(bearer(ciso))
      .send({ title: 'Monatsgrenze' })
      .expect(201);
    const res = await http
      .post(`/api/v1/incidents/${inc.body.id}/mark-significant`)
      .set(bearer(ciso))
      .send({ knownAt: '2027-01-28T12:00:00.000Z' })
      .expect(201);
    const final = (res.body.obligations as Obligation[]).find((o) => o.regime === 'nis2_final_1m')!;
    // Kenntnis 28.01. + 72 h = 31.01.; + 1 Monat = 28.02. (kein 03.03.)
    expect(new Date(final.dueAt!).toISOString()).toBe('2027-02-28T12:00:00.000Z');
  });
});

describe('Fristenmonitor', () => {
  it('listet offene Fristen und blendet erfüllte aus', async () => {
    const res = await http.get('/api/v1/incidents/obligations').set(bearer(ciso)).expect(200);
    const rows = res.body as {
      regime: string;
      overdue: boolean;
      hoursLeft: string;
      incidentRefNo: string;
      label: string;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    const early = rows.find((r) => r.regime === 'nis2_early_warning_24h' && r.incidentRefNo === 'INC-0001')!;
    expect(early.label).toMatch(/Frühwarnung/);
    // Die abgesetzte 72-Stunden-Meldung ist erledigt und erscheint nicht mehr im Monitor.
    expect(rows.some((r) => r.regime === 'nis2_notification_72h' && r.incidentRefNo === 'INC-0001')).toBe(
      false,
    );
    // Fristen ohne gesetzliches Datum (Art. 34, Zwischenbericht) gehören nicht in einen Fristenmonitor.
    expect(rows.some((r) => r.regime === 'gdpr_art34' || r.regime === 'nis2_progress')).toBe(false);
  });

  it('markiert abgelaufene Fristen als überfällig — unabhängig vom Testdatum', async () => {
    const inc = await http
      .post('/api/v1/incidents')
      .set(bearer(ciso))
      .send({ title: 'Vor zehn Tagen bemerkt' })
      .expect(201);
    const knownAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await http
      .post(`/api/v1/incidents/${inc.body.id}/mark-significant`)
      .set(bearer(ciso))
      .send({ knownAt })
      .expect(201);

    const res = await http.get('/api/v1/incidents/obligations').set(bearer(ciso)).expect(200);
    const rows = res.body as {
      regime: string;
      overdue: boolean;
      hoursLeft: string;
      incidentId: string;
      dueAt: string;
    }[];
    const early = rows.find((r) => r.incidentId === inc.body.id && r.regime === 'nis2_early_warning_24h')!;
    expect(early.overdue).toBe(true);
    expect(Number(early.hoursLeft)).toBeLessThan(0);
    // Der Monitor sortiert nach Fälligkeit, die dringendste Frist steht oben. Geprüft wird das
    // an der ganzen Liste und nicht als „dieser Vorfall steht oben“: andere Tests dieser Datei
    // arbeiten mit festen Kalenderdaten, und welcher Vorfall gerade am längsten überfällig ist,
    // hängt dann vom Tag ab, an dem der Test läuft.
    const due = rows.map((r) => new Date(r.dueAt).getTime());
    expect(due).toEqual([...due].sort((a, b) => a - b));
    const firstOpen = rows.findIndex((r) => !r.overdue);
    if (firstOpen !== -1) expect(rows.indexOf(early)).toBeLessThan(firstOpen);
  });

  it('zählt offene Meldefristen im Dashboard', async () => {
    const res = await http.get('/api/v1/dashboard/summary').set(bearer(ciso)).expect(200);
    expect(res.body.openReportingObligations).toBeGreaterThan(0);
    expect(res.body.openIncidents).toBeGreaterThan(0);
  });
});

describe('Playbooks', () => {
  let playbookId = '';

  it('erzeugt ein Playbook aus der Ransomware-Vorlage', async () => {
    const res = await http
      .post('/api/v1/playbooks')
      .set(bearer(ciso))
      .send({ scenario: 'ransomware' })
      .expect(201);
    expect(res.body.steps.length).toBeGreaterThanOrEqual(6);
    expect(res.body.steps[0].seq).toBe(1);
    playbookId = res.body.id;
    await http
      .put(`/api/v1/playbooks/${playbookId}/status`)
      .set(bearer(ciso))
      .send({ status: 'active' })
      .expect(200);
  });

  it('generiert Entwürfe für Assets mit hohem Verfügbarkeitsbedarf', async () => {
    await http
      .post('/api/v1/assets')
      .set(bearer(ciso))
      .send({ name: 'Zahlungs-Gateway', category: 'application', availability: 3 })
      .expect(201);
    const res = await http.post('/api/v1/playbooks/auto-generate').set(bearer(ciso)).expect(201);
    expect(res.body.created).toBe(1);
    expect(res.body.playbooks[0].title).toContain('Zahlungs-Gateway');

    // Ein zweiter Lauf erzeugt keine Dubletten
    const again = await http.post('/api/v1/playbooks/auto-generate').set(bearer(ciso)).expect(201);
    expect(again.body.created).toBe(0);
  });

  it('aktiviert das Playbook am Vorfall und hakt Schritte ab', async () => {
    const activated = await http
      .post(`/api/v1/incidents/${incidentId}/playbook`)
      .set(bearer(ciso))
      .send({ playbookId })
      .expect(201);
    expect(activated.body.playbookSteps.length).toBeGreaterThan(0);

    const step = activated.body.playbookSteps[0] as { id: string };
    await http
      .post(`/api/v1/incidents/${incidentId}/playbook-steps/${step.id}`)
      .set(bearer(ciso))
      .send({ done: true })
      .expect(201);

    const detail = await http.get(`/api/v1/incidents/${incidentId}`).set(bearer(ciso)).expect(200);
    expect(detail.body.playbookSteps[0].doneAt).toBeTruthy();
  });
});

describe('Ursachenanalyse und KVP', () => {
  it('speichert eine 5-Why-Analyse', async () => {
    const res = await http
      .post(`/api/v1/incidents/${incidentId}/rca`)
      .set(bearer(ciso))
      .send({
        method: '5why',
        problemStatement: 'Schadsoftware konnte auf dem Domänencontroller ausgeführt werden.',
        whys: [
          'Der Anhang wurde geöffnet.',
          'Der Filter hat die Variante nicht erkannt.',
          'Die Signaturen waren vier Tage alt.',
          'Das Update-Fenster war zu eng gesetzt.',
          'Die Änderung wurde nie überprüft.',
        ],
        rootCause: 'Fehlende Wirksamkeitskontrolle des Patch-Fensters.',
      })
      .expect(201);
    expect(res.body.analysis.whys).toHaveLength(5);
    expect(res.body.performedAt).toBeTruthy();
  });

  it('legt eine Korrekturmaßnahme mit Bezug zum Vorfall an', async () => {
    const res = await http
      .post('/api/v1/actions')
      .set(bearer(ciso))
      .send({
        title: 'Patch-Fenster verkürzen und Wirksamkeit monatlich prüfen',
        kind: 'corrective',
        incidentId,
        dueAt: '2026-10-31',
      })
      .expect(201);
    expect(res.body.refNo).toBe('KVP-0001');

    const list = await http.get('/api/v1/actions').set(bearer(ciso)).expect(200);
    expect(list.body.items[0].origin.kind).toBe('incident');
    expect(list.body.items[0].origin.label).toBe('INC-0001');
  });

  it('lehnt mehrere Auslöser ab', async () => {
    const risk = await http
      .post('/api/v1/risks')
      .set(bearer(ciso))
      .send({ title: 'Irgendein Risiko' })
      .expect(201);
    const res = await http
      .post('/api/v1/actions')
      .set(bearer(ciso))
      .send({ title: 'Zwei Auslöser gleichzeitig', incidentId, riskId: risk.body.id })
      .expect(400);
    expect(res.body.title).toMatch(/ein Auslöser/i);
  });

  it('bestätigt die Wirksamkeit erst nach der Umsetzung', async () => {
    const list = await http.get('/api/v1/actions').set(bearer(ciso)).expect(200);
    const id = list.body.items[0].id as string;

    const tooEarly = await http
      .post(`/api/v1/actions/${id}/verify`)
      .set(bearer(ciso))
      .send({ result: 'Sieht gut aus.' })
      .expect(400);
    expect(tooEarly.body.title).toMatch(/noch nicht umgesetzt/);

    await http.patch(`/api/v1/actions/${id}`).set(bearer(ciso)).send({ status: 'done' }).expect(200);
    const ok = await http
      .post(`/api/v1/actions/${id}/verify`)
      .set(bearer(ciso))
      .send({ result: 'Patch-Fenster auf 48 Stunden verkürzt, zwei Zyklen stichprobenartig geprüft.' })
      .expect(201);
    expect(ok.body.status).toBe('verified');
    expect(ok.body.verifiedAt).toBeTruthy();
  });
});
