/*
 * Nimmt die Bilder für Dokumentation und Präsentation auf — dieselbe Reihenfolge, dieselben
 * Ausschnitte, bei jedem Lauf. Von Hand aufgenommene Screenshots veralten still; ein Skript
 * lässt sich nach einer Änderung einfach noch einmal laufen.
 *
 * Voraussetzungen: PostgreSQL läuft, Demodaten sind gesät (`pnpm db:seed:demo`), API auf
 * Port 3000 und `pnpm --filter @isms/web dev` auf Port 5173.
 *
 *   node apps/web/scripts/doku-screenshots.mjs
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
const USER = process.env.DEMO_USER ?? 'henrike.sallach@nordlicht.example';
const PASS = process.env.DEMO_PASSWORD ?? 'demo-passwort-2026-nordlicht';

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

/** Reiter innerhalb einer Seite. */
const tab = (label) => async (p) => {
  await p.getByRole('button', { name: label, exact: false }).first().click();
  await p.waitForTimeout(1200);
};

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
await capture('02-start-dashboard', { path: '/' });
await capture('03-wiedervorlage', { path: '/deadlines' });
await capture('04-kontext-parteien', { path: '/context' });
await capture('05-kontext-ziele', { steps: tab('Ziele') });
await capture('06-kommunikationsplan', { path: '/planning' });
await capture('07-aenderungsplanung', { steps: tab('Änderungsplanung') });
await capture('08-organigramm', { steps: tab('Organigramm') });
await capture('09-kompetenzmatrix', { path: '/competence' });
await capture('10-schulungen', { steps: tab('Schulungen') });
// Die Anforderungsliste ist tausende Pixel lang — hier zählt der Ausschnitt.
await capture('11-anforderungen-soa', { path: '/soa', full: false, wait: 2500 });
await capture('12-massnahmen', { path: '/measures' });
await capture('13-massnahme-mehrfachzuordnung', {
  path: '/measures',
  full: false,
  steps: open('Mehrfaktor-Anmeldung für alle administrativen'),
});
await capture('14-dokumentenlenkung', { path: '/documents' });
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
await capture('21-geschaeftsfortfuehrung', { path: '/continuity' });
await capture('22-bia-detail', {
  path: '/continuity',
  full: false,
  steps: open('Netzführung und Störungsbeseitigung'),
});
await capture('23-verarbeitungsverzeichnis', { path: '/privacy' });
await capture('24-verarbeitung-detail', {
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
await capture('28-verbesserungen-kvp', { path: '/actions' });
await capture('29-kennzahlen', { path: '/kpis' });
await capture('30-managementbewertung', { path: '/reviews' });
await capture('31-beschaeftigte', { path: '/persons' });
await capture('32-aenderungsprotokoll', { path: '/audit-log' });
await capture('33-einstellungen-regelwerke', { path: '/settings' });
await capture('34-mitglieder-rollen', { path: '/members' });
await capture('35-normbezug-kurzhilfe', {
  path: '/risks',
  full: false,
  steps: async (p) => {
    await p.getByRole('button', { name: 'Risiko erfassen' }).click();
    await p.waitForTimeout(500);
    await p.locator('form button[aria-label^="Normbezug"]').first().hover();
    await p.waitForTimeout(600);
  },
});

console.log(fails.length ? `\nFehlgeschlagen:\n- ${fails.join('\n- ')}` : '\nAlle Aufnahmen erstellt.');
await browser.close();
