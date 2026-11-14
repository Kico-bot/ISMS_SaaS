import { describe, expect, it } from 'vitest';
import { LEAN } from './lean';
import { NAV, ROUTE_PERMISSION, buildNav, matches, navSections } from './nav';

const outline = (lean: boolean) =>
  buildNav(lean).groups.flatMap((g) => g.sections.map((s) => [s.label, s.tabs.map((t) => t.label)]));

describe('Navigation', () => {
  it('ist ohne VITE_FULL_UI schlank', () => {
    expect(LEAN).toBe(true);
    expect(NAV).toEqual(buildNav(true));
  });

  it('schlank: fünf Menüpunkte ohne Überschriften, mit genau diesen Reitern', () => {
    const nav = buildNav(true);
    expect(nav.groups.every((g) => !g.label)).toBe(true);
    expect(outline(true)).toEqual([
      ['Start', ['Lagebild']],
      ['Normen', ['ISO 27001', 'NIS2']],
      ['Planen', ['Organisation', 'Risiken', 'Maßnahmen']],
      ['Betreiben', ['Assets', 'Richtlinien', 'Team & Schulung', 'Vorfälle']],
      ['Prüfen', ['Audits', 'Feststellungen', 'Managementbewertung']],
    ]);
    expect(nav.footer?.label).toBe('Einstellungen');
    expect(nav.footer?.tabs.map((t) => t.label)).toEqual([
      'Regelwerke',
      'Mitglieder & Rollen',
      'Änderungsprotokoll',
    ]);
  });

  it('schlank: AI Act, DSGVO und IT-Grundschutz erscheinen nie, auch nicht als aktives Regelwerk', () => {
    const tabs = navSections(buildNav(true)).flatMap((s) => s.tabs);
    expect(tabs.filter((t) => t.framework && ['EU_AI_ACT', 'DSGVO', 'BSI_GS'].includes(t.framework))).toEqual(
      [],
    );
  });

  it('voll: das bisherige Menü mit elf Menüpunkten bleibt unverändert', () => {
    expect(outline(false).map(([label]) => label)).toEqual([
      'Start',
      'Normen',
      'Organisation & Kontext',
      'Risiken & Maßnahmen',
      'Assets',
      'Dokumente',
      'Personen & Schulung',
      'Vorfälle & Notfälle',
      'Audits & Verbesserung',
      'Managementbewertung',
      'Einstellungen',
    ]);
    expect(buildNav(false).footer).toBeNull();
  });

  it('ausgeblendete Seiten bleiben geschützt', () => {
    for (const path of ['/kpis', '/privacy', '/members', '/settings', '/continuity', '/actions']) {
      expect(ROUTE_PERMISSION[path]).toBeTruthy();
    }
  });

  it('Fristen und Mein Bereich gehören schlank zum Menüpunkt Start', () => {
    const start = buildNav(true).groups[0]!.sections[0]!.tabs[0]!;
    expect(matches(start, '/deadlines', '')).toBeGreaterThan(0);
    expect(matches(start, '/my', '')).toBeGreaterThan(0);
  });
});
