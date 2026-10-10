/**
 * Ausleitungen für Auditoren und Aufsichtsbehörden.
 *
 * Zwei Fälle sind sicherheitsrelevant: eine Zelle, die mit „=“ beginnt, wird von Excel als
 * Formel ausgeführt (CSV-Injection), und ein Maßnahmentitel mit Markup darf im Dokument
 * nicht als Markup landen. Beides steht hier unter Test.
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
      tenantName: 'Export AG',
      tenantSlug: 'export',
      email: 'carla@export.test',
      password: 'korrekt-pferd-batterie-1',
      displayName: 'Carla CISO',
    })
    .expect(201);
  carla = reg.body.accessToken;

  const invite = await http
    .post('/api/v1/members')
    .set(bearer(carla))
    .send({ email: 'rita@export.test', displayName: 'Rita Reinhardt', roleKeys: ['risk_owner'] })
    .expect(201);
  const accepted = await http
    .post('/api/v1/auth/accept-invite')
    .send({ token: invite.body.inviteToken, password: 'rita-passwort-2026-lang' })
    .expect(200);
  rita = accepted.body.accessToken;

  // Eine Maßnahme, die auf eine ISO-Anforderung zahlt — damit die SoA-Spalte gefüllt ist.
  const measure = await http
    .post('/api/v1/measures')
    .set(bearer(carla))
    .send({ title: 'MFA für alle Konten', status: 'implemented' })
    .expect(201);
  const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(carla)).expect(200);
  const a517 = (reqs.body as { id: string; refCode: string }[]).find((r) => r.refCode === 'A.5.17')!;
  await http
    .post(`/api/v1/measures/${measure.body.id}/requirements`)
    .set(bearer(carla))
    .send({ requirementId: a517.id, coverage: 'full' })
    .expect(201);

  const a79 = (reqs.body as { id: string; refCode: string }[]).find((r) => r.refCode === 'A.7.9')!;
  await http
    .patch(`/api/v1/soa/${a79.id}`)
    .set(bearer(carla))
    .send({
      applicability: 'not_applicable',
      justification: 'Keine Unternehmenswerte außerhalb der Betriebsgelände.',
    })
    .expect(200);
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('Erklärung zur Anwendbarkeit', () => {
  it('liefert die SoA als CSV mit deutschem Trennzeichen und BOM', async () => {
    const res = await http.get('/api/v1/exports/soa.csv?framework=ISO27001').set(bearer(carla)).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('soa-iso27001');

    expect(res.text.startsWith('﻿')).toBe(true);
    const [header, ...lines] = res.text.slice(1).split('\r\n');
    expect(header.split(';')[0]).toBe('Kapitel');
    expect(header).toContain('Anwendbarkeit');

    // Die nicht anwendbare Anforderung führt ihre Begründung mit.
    const a79 = lines.find((l) => l.includes(';A.7.9;'))!;
    expect(a79).toContain('nicht anwendbar');
    expect(a79).toContain('Betriebsgelände');

    // Die abgedeckte Anforderung führt die Maßnahme mit.
    const a517 = lines.find((l) => l.includes(';A.5.17;'))!;
    expect(a517).toContain('MFA für alle Konten');
    expect(a517).toContain('umgesetzt');
  });

  it('liefert dieselbe SoA als druckfertiges Dokument', async () => {
    const res = await http.get('/api/v1/exports/soa.html?framework=ISO27001').set(bearer(carla)).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.text).toContain('Erklärung zur Anwendbarkeit');
    expect(res.text).toContain('Export AG');
    expect(res.text).toContain('Kap. 6.1.3');
    // Nach Kapiteln gegliedert.
    expect(res.text).toContain('<h2>A.5 ');
    expect(res.text).toContain('MFA für alle Konten');
  });

  it('meldet ein unbekanntes Framework', async () => {
    await http.get('/api/v1/exports/soa.csv?framework=GIBTESNICHT').set(bearer(carla)).expect(404);
  });
});

describe('Schutz der Ausleitung', () => {
  it('entschärft Zellen, die Excel als Formel ausführen würde', async () => {
    await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({ title: '=HYPERLINK("http://boese.example","Klick mich")', status: 'planned' })
      .expect(201);

    const res = await http.get('/api/v1/exports/measures.csv').set(bearer(carla)).expect(200);
    expect(res.text).toContain("'=HYPERLINK");
    // Die rohe Formel darf nirgends unmaskiert am Zellenanfang stehen.
    expect(res.text).not.toMatch(/(^|;|")=HYPERLINK/m);
  });

  it('lässt Markup aus Mandantendaten nicht als Markup ins Dokument', async () => {
    const measure = await http
      .post('/api/v1/measures')
      .set(bearer(carla))
      .send({ title: '<script>alert(1)</script>', status: 'planned' })
      .expect(201);
    const reqs = await http.get('/api/v1/frameworks/ISO27001/requirements').set(bearer(carla)).expect(200);
    const a58 = (reqs.body as { id: string; refCode: string }[]).find((r) => r.refCode === 'A.5.8')!;
    await http
      .post(`/api/v1/measures/${measure.body.id}/requirements`)
      .set(bearer(carla))
      .send({ requirementId: a58.id, coverage: 'partial' })
      .expect(201);

    const res = await http.get('/api/v1/exports/soa.html?framework=ISO27001').set(bearer(carla)).expect(200);
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.text).not.toContain('<script>alert(1)</script>');
  });

  it('verlangt das Ausleitungsrecht', async () => {
    // Der Risk-Owner liest das ISMS, darf es aber nicht ausleiten.
    await http.get('/api/v1/exports/soa.csv').set(bearer(rita)).expect(403);
    await http.get('/api/v1/exports/risks.csv').set(bearer(rita)).expect(403);
  });
});

describe('Weitere Register', () => {
  it('leitet das Risikoregister mit der aktuellen Bewertung aus', async () => {
    const risk = await http
      .post('/api/v1/risks')
      .set(bearer(carla))
      .send({ title: 'Ransomware auf Produktionsservern' })
      .expect(201);
    await http
      .post(`/api/v1/risks/${risk.body.id}/assessments`)
      .set(bearer(carla))
      .send({ likelihood: 4, impact: 5 })
      .expect(201);
    await http
      .post(`/api/v1/risks/${risk.body.id}/assessments`)
      .set(bearer(carla))
      .send({ likelihood: 2, impact: 4 })
      .expect(201);

    const res = await http.get('/api/v1/exports/risks.csv').set(bearer(carla)).expect(200);
    const line = res.text.split('\r\n').find((l) => l.includes('Ransomware'))!;
    const cells = line.split(';');
    expect(cells[0]).toBe('R-0001');
    // Es zählt die jüngste Bewertung (2 × 4), die frühere steht in der Historie, nicht im Register.
    expect(line).toContain(';2;4;8;');
    expect(line).not.toContain(';20;');
  });

  it('leitet das Verarbeitungsverzeichnis mit den TOM aus', async () => {
    const res = await http.get('/api/v1/exports/processing-activities.csv').set(bearer(carla)).expect(200);
    expect(res.text).toContain('Technische und organisatorische Maßnahmen (Art. 32)');
    expect(res.headers['content-disposition']).toContain('verarbeitungsverzeichnis');
  });

  it('trägt das Abrufdatum im Dateinamen', async () => {
    const res = await http.get('/api/v1/exports/measures.csv').set(bearer(carla)).expect(200);
    const today = new Date().toISOString().slice(0, 10);
    expect(res.headers['content-disposition']).toContain(`massnahmenregister-${today}.csv`);
  });
});
