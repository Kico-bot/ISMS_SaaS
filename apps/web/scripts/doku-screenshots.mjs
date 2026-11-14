/*
 * Nimmt die Bilder für Dokumentation und Präsentation auf: dieselbe Reihenfolge, dieselben
 * Ausschnitte, bei jedem Lauf. Von Hand aufgenommene Screenshots veralten still; ein Skript
 * lässt sich nach einer Änderung einfach noch einmal laufen.
 *
 * Voraussetzungen: PostgreSQL läuft, Demodaten sind gesät (`pnpm db:seed:demo`), API auf
 * Port 3000 und `pnpm --filter @isms/web dev` auf Port 5173.
 *
 *   node apps/web/scripts/doku-screenshots.mjs
 *
 * Die Oberfläche ist standardmäßig schlank. Dann nimmt das Skript keine Seiten auf, die dort
 * ausgeblendet sind (Mein Bereich, Fristen, Organigramm, Qualifikationsmatrix, Notfallpläne
 * und BIA, Verbesserungen, Flussdiagramm, DSGVO, Kennzahlen, IT-Grundschutz); ihre Bilder bleiben als Aufnahmen der vollständigen Oberfläche
 * liegen. Wer sie erneuern will, startet die Oberfläche und dieses Skript mit VITE_FULL_UI=true.
 *
 * Playwright liegt in dieser Umgebung global; deshalb wird der Pfad notfalls aufgelöst statt
 * das Paket als Abhängigkeit aufzunehmen — die Anwendung selbst braucht es nicht.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
  try {
    ({ chromium } = require(id));
    break;
  } catch {
    /* nächster Pfad */
  }
}
if (!chromium) {
  console.error('Playwright nicht gefunden (npm i -g playwright).');
  process.exit(1);
}

const BASE = process.env.WEB_URL ?? 'http://localhost:5173';
const OUT = new URL('../../../docs/produkt-screenshots/', import.meta.url).pathname;
const USER = process.env.DEMO_USER ?? 'henrike.sallach@lindenbach.example';
const PASS = process.env.DEMO_PASSWORD ?? 'demo-passwort-2026-lindenbach';

const FULL_UI = process.env.VITE_FULL_UI === 'true';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
const fails = [];

/** Vollbild für Listen, Ausschnitt für Detailfenster — sonst steht darunter graue Fläche. */
async function capture(name, { path, steps, full = true, wait = 1500 } = {}) {
  try {
    if (path) await page.goto(BASE + path);
    await page.waitForTimeout(wait);
    if (steps) await steps(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
    console.log('✓', name);
  } catch (e) {
    fails.push(`${name}: ${e.message.split('\n')[0]}`);
    console.log('✗', name);
  }
}

/** Nur in der vollständigen Oberfläche: schlank ist diese Seite ausgeblendet. */
async function captureFull(name, options) {
  if (FULL_UI) await capture(name, options);
  else console.log('–', name, '(nur vollständige Oberfläche)');
}

/** Nur in der schlanken Oberfläche, die vollständige zeigt dasselbe in eigenen Bildern. */
async function captureLean(name, options) {
  if (!FULL_UI) await capture(name, options);
}

/** Zeile einer Tabelle oder Liste öffnen — Detailfenster. */
const open = (text) => async (p) => {
  const row = p.locator('tbody tr, li').filter({ hasText: text }).first();
  if (await row.count()) await row.click();
  else await p.getByText(text, { exact: false }).first().click();
  await p.waitForTimeout(1600);
};

await page.goto(BASE + '/login');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}01-anmeldung.png` });
console.log('✓ 01-anmeldung');

await page.fill('input[type=email]', USER);
await page.fill('input[type=password]', PASS);
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });

// Titelbild des README: die Startseite als Ausschnitt, nicht als Vollbild.
await capture('00-ueberblick', { path: '/', full: false });
await capture('00a-programm-iso27001', { path: '/programme/iso27001', full: false });
await captureFull('00e-mein-bereich', { path: '/my', full: false });
await capture('00d-gap-analyse', { path: '/programme/iso27001/gap?chapter=A.7', full: false });
await capture('00b-programm-nis2', { path: '/programme/nis2', full: false });
await capture('02-start-dashboard', { path: '/' });
await captureFull('03-fristen', { path: '/deadlines' });
await captureFull('04-kontext-parteien', { path: '/context?tab=environment' });
await captureFull('05-kontext-ziele', { path: '/context?tab=objectives' });
await captureFull('06-kommunikationsplan', { path: '/context?tab=communication' });
await captureFull('07-aenderungsplanung', { path: '/context?tab=changes' });
await captureLean('04b-organisation', { path: '/context' });
await captureFull('08-organigramm', { path: '/context?tab=org' });
await captureFull('09-kompetenzmatrix', { path: '/competence?tab=matrix' });
await capture('10-schulungen', { path: FULL_UI ? '/competence?tab=trainings' : '/competence' });
// Die Anforderungsliste ist tausende Pixel lang — hier zählt der Ausschnitt.
await capture('11-anforderungen-soa', { path: '/soa', full: false, wait: 2500 });
await capture('12-massnahmen', { path: '/measures' });
await capture('12b-gemeinsame-massnahmen', {
  path: '/programme/nis2',
  full: false,
  steps: async (p) => {
    await p.locator('#shared-title').scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, -24));
  },
});
await capture('13-massnahme-mehrfachzuordnung', {
  path: '/measures',
  full: false,
  steps: open('Mehrfaktor-Anmeldung für alle administrativen'),
});
await capture('14-dokumente', { path: '/documents' });
await capture('15-dokument-fassungen', {
  path: '/documents',
  full: false,
  steps: open('Leitlinie zur Informationssicherheit'),
});
await capture('16-asset-inventar', { path: '/assets' });
await capture('17-risikoregister-matrix', { path: '/risks' });
await capture('18-risiko-detail', {
  path: '/risks',
  full: false,
  steps: open('Ransomware erreicht über das Büronetz'),
});
await capture('19-sicherheitsvorfaelle', { path: '/incidents' });
await capture('20-vorfall-meldepflichten', {
  path: '/incidents',
  full: false,
  steps: open('Ausfall der Fernwirkstrecke nach Stromausfall'),
});
await captureFull('21-notfallplanung', { path: '/continuity' });
await captureFull('22-bia-detail', {
  path: '/continuity',
  full: false,
  steps: open('Netzführung und Störungsbeseitigung'),
});
await captureFull('23-verarbeitungsverzeichnis', { path: '/privacy' });
await captureFull('24-verarbeitung-detail', {
  path: '/privacy',
  full: false,
  steps: open('Verbrauchsabrechnung und Zahlungsverkehr'),
});
await capture('25-auditprogramm', { path: '/audits' });
await capture('26-feststellungen', { path: '/findings' });
await capture('27-feststellung-nachweis', {
  path: '/findings',
  full: false,
  steps: open('Rückspieltests werden durchgeführt'),
});
await captureFull('28-verbesserungen-kvp', { path: '/actions' });
await captureFull('29-kennzahlen', { path: '/kpis' });
await capture('30-managementbewertung', { path: '/reviews' });
await captureFull('31-beschaeftigte', { path: '/competence?tab=persons' });
await capture('32-aenderungsprotokoll', { path: '/audit-log' });
await capture('33-einstellungen-regelwerke', { path: '/settings' });
await capture('34-mitglieder-rollen', { path: '/members' });
await capture('35-normbezug-kurzhilfe', {
  path: '/risks',
  full: false,
  steps: async (p) => {
    // Schlank stehen Normhinweise nur am Titel und an Abschnitten, nicht an Feldern.
    if (FULL_UI) {
      await p.getByRole('button', { name: 'Risiko erfassen' }).click();
      await p.waitForTimeout(500);
    }
    await p
      .locator(FULL_UI ? 'form button[aria-label^="Normbezug"]' : 'main h1 button[aria-label^="Normbezug"]')
      .first()
      .hover();
    await p.waitForTimeout(600);
  },
});

if (FULL_UI) {
  // Die Demo zeigt ISO 27001, NIS2 und den AI Act; IT-Grundschutz ist abgeschaltet, seine
  // Modellierung aber erhalten. Für dieses eine Bild kurz zuschalten, danach wieder aus.
  const token = (
    await (
      await page.request.post(`${BASE}/api/v1/auth/login`, { data: { email: USER, password: PASS } })
    ).json()
  ).accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  await page.request.post(`${BASE}/api/v1/frameworks/activate`, {
    headers,
    data: { frameworkKey: 'BSI_GS', isPrimary: false },
  });
  await capture('36-grundschutz-modellierung', {
    path: '/soa?framework=BSI_GS&view=modeling',
    full: false,
  });
  await page.request.delete(`${BASE}/api/v1/frameworks/BSI_GS/activate`, { headers });
} else console.log('– 36-grundschutz-modellierung (nur vollständige Oberfläche)');

await capture('37-nis2-cockpit', { path: '/cockpit?framework=NIS2' });
await captureFull('38-nis2-flussdiagramm', { path: '/cockpit?framework=NIS2&view=flow' });
if (FULL_UI) {
  // Der AI Act ist im Demo abgeschaltet und in der schlanken Oberfläche ausgeblendet, das
  // KI-Register aber angelegt. Für diese Bilder kurz zuschalten, danach wieder aus.
  const token = (
    await (
      await page.request.post(`${BASE}/api/v1/auth/login`, { data: { email: USER, password: PASS } })
    ).json()
  ).accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  await page.request.post(`${BASE}/api/v1/frameworks/activate`, {
    headers,
    data: { frameworkKey: 'EU_AI_ACT', isPrimary: false },
  });
  await capture('00c-programm-ai-act', { path: '/programme/ai-act', full: false });
  await capture('39-ki-register', { path: '/ai', full: false });
  await capture('40-ki-system-einstufung', {
    path: '/ai',
    full: false,
    steps: open('Vorauswahl von Bewerbungen'),
  });
  await capture('41-ai-act-betreiberpflichten', { path: '/cockpit?framework=EU_AI_ACT' });
  await page.request.delete(`${BASE}/api/v1/frameworks/EU_AI_ACT/activate`, { headers });
} else console.log('– 00c, 39 bis 41 (AI Act, nur vollständige Oberfläche)');
await captureFull('42-kontext-geltungsbereich', { path: '/context?tab=scope', full: false });
await captureFull('43-abkuerzungen-erklaert', {
  path: '/continuity',
  full: false,
  steps: async (p) => {
    await p.locator('th button[aria-label^="Abkürzungen"]').first().hover();
    await p.waitForTimeout(600);
  },
});

// Neu mit lean-ui-2: Lieferanten mit Bewertung und Richtlinien aus Vorlagen.
await capture('44-lieferanten', { path: '/assets?category=supplier', full: false });
await capture('45-richtlinie-aus-vorlage', {
  path: '/documents',
  full: false,
  steps: async (p) => {
    await p.getByRole('button', { name: FULL_UI ? 'Dokument anlegen' : 'Richtlinie anlegen' }).click();
    await p.waitForTimeout(800);
  },
});
await capture('46-bewertungsskala', {
  path: '/risks',
  full: false,
  steps: async (p) => {
    await p.locator('button[aria-label="Bewertungsskala"]').hover();
    await p.waitForTimeout(600);
  },
});

// Ein KI-Risiko im normalen Risikoregister (Produktvideo, Demo-Leitfaden Schritt 5).
await capture('47-ki-risiko', {
  path: '/risks',
  full: false,
  steps: open('öffentliche KI-Chatbots'),
});

console.log(fails.length ? `\nFehlgeschlagen:\n- ${fails.join('\n- ')}` : '\nAlle Aufnahmen erstellt.');
await browser.close();
