import { LEAN } from './lean';

export interface NavTab {
  to: string;
  label: string;
  permission?: string;
  /** Nur zeigen, wenn dieses Regelwerk aktiv ist. Abgeschaltet bleibt es in den Einstellungen zu finden. */
  framework?: string;
  /** Weitere Adressen, auf denen dieser Reiter als aktiv gilt (Pfad, optional mit `?framework=`). */
  activeFor?: string[];
}

/** Ein Menüpunkt. Hat er mehrere Reiter, stehen sie als Leiste über der Seite. */
export interface NavSection {
  label: string;
  tabs: NavTab[];
}

export interface NavGroup {
  /** Überschrift der Gruppe; ohne steht sie für sich (Start, Normen, Einstellungen). */
  label?: string;
  sections: NavSection[];
}

export interface Nav {
  groups: NavGroup[];
  /** Einstellungen als Zahnrad unten in der Spalte statt als Menüpunkt (nur schlank). */
  footer: NavSection | null;
}

const ISO: NavTab = {
  to: '/programme/iso27001',
  label: 'ISO 27001',
  permission: 'soa.read',
  activeFor: ['/soa', '/soa?framework=ISO27001'],
};
const NIS2: NavTab = {
  to: '/programme/nis2',
  label: 'NIS2',
  permission: 'soa.read',
  framework: 'NIS2',
  activeFor: ['/cockpit', '/cockpit?framework=NIS2', '/soa?framework=NIS2'],
};
const AI_ACT: NavTab = {
  to: '/programme/ai-act',
  label: 'EU AI Act',
  permission: 'soa.read',
  framework: 'EU_AI_ACT',
  activeFor: ['/ai', '/cockpit?framework=EU_AI_ACT', '/soa?framework=EU_AI_ACT'],
};

const SETTINGS: NavSection = {
  label: 'Einstellungen',
  tabs: [
    { to: '/settings', label: 'Regelwerke', permission: 'tenant.settings' },
    { to: '/members', label: 'Mitglieder & Rollen', permission: 'tenant.members' },
    { to: '/audit-log', label: 'Änderungsprotokoll', permission: 'auditlog.read' },
  ],
};

/**
 * Elf Menüpunkte statt zwei Dutzend. Die Gruppen folgen dem Kreislauf der ISO 27001: planen
 * (Kap. 4 bis 6), betreiben (Kap. 7, 8 und Anhang A), prüfen und verbessern (Kap. 9, 10).
 * Was zusammengehört, ist ein Menüpunkt mit Reitern; jedes Register bleibt dabei eine eigene
 * Seite mit eigener Adresse, so dass Links aus Aufgaben, Fristen und E-Mails weiter treffen.
 */
const FULL: NavGroup[] = [
  {
    sections: [
      {
        label: 'Start',
        tabs: [
          { to: '/', label: 'Lagebild' },
          { to: '/my', label: 'Mein Bereich' },
          { to: '/deadlines', label: 'Fristen' },
        ],
      },
      {
        label: 'Normen',
        tabs: [
          ISO,
          NIS2,
          AI_ACT,
          {
            to: '/privacy',
            label: 'DSGVO',
            permission: 'privacy.read',
            framework: 'DSGVO',
            activeFor: ['/soa?framework=DSGVO', '/cockpit?framework=DSGVO'],
          },
          {
            to: '/soa?framework=BSI_GS',
            label: 'IT-Grundschutz',
            permission: 'soa.read',
            framework: 'BSI_GS',
          },
        ],
      },
    ],
  },
  {
    label: 'Planen',
    sections: [
      {
        label: 'Organisation & Kontext',
        tabs: [{ to: '/context', label: 'Organisation & Kontext', permission: 'context.read' }],
      },
      {
        label: 'Risiken & Maßnahmen',
        tabs: [
          { to: '/risks', label: 'Risikoregister', permission: 'risk.read' },
          { to: '/measures', label: 'Maßnahmen', permission: 'measure.read' },
        ],
      },
    ],
  },
  {
    label: 'Betreiben',
    sections: [
      { label: 'Assets', tabs: [{ to: '/assets', label: 'Asset-Inventar', permission: 'asset.read' }] },
      { label: 'Dokumente', tabs: [{ to: '/documents', label: 'Dokumente', permission: 'document.read' }] },
      {
        label: 'Personen & Schulung',
        tabs: [{ to: '/competence', label: 'Personen & Schulung', permission: 'competence.read' }],
      },
      {
        label: 'Vorfälle & Notfälle',
        tabs: [
          { to: '/incidents', label: 'Sicherheitsvorfälle', permission: 'incident.read' },
          { to: '/continuity', label: 'Notfallplanung', permission: 'continuity.read' },
        ],
      },
    ],
  },
  {
    label: 'Prüfen & verbessern',
    sections: [
      {
        label: 'Audits & Verbesserung',
        tabs: [
          { to: '/audits', label: 'Auditprogramm', permission: 'audit.read' },
          { to: '/findings', label: 'Feststellungen', permission: 'audit.read' },
          { to: '/actions', label: 'Verbesserungen', permission: 'action.read' },
        ],
      },
      {
        label: 'Managementbewertung',
        tabs: [
          { to: '/reviews', label: 'Managementbewertung', permission: 'audit.read' },
          { to: '/kpis', label: 'Kennzahlen', permission: 'audit.read' },
        ],
      },
    ],
  },
  { sections: [SETTINGS] },
];

/**
 * Schlank: fünf Menüpunkte ohne Gruppenüberschriften, Start, Normen, Planen, Betreiben, Prüfen.
 * Planen, Betreiben und Prüfen tragen ihre Register als Reiterleiste über der Seite. Mein
 * Bereich, Fristen, Kennzahlen, Notfallpläne, Verbesserungen, DSGVO und IT-Grundschutz haben
 * keinen Reiter, ihre Seiten bleiben aber unter derselben Adresse erreichbar (Fristen über die
 * Kachel im Lagebild, Notfallpläne über die Fristen, Korrekturmaßnahmen an der Feststellung).
 */
const LEAN_NAV: NavGroup[] = [
  {
    sections: [
      { label: 'Start', tabs: [{ to: '/', label: 'Lagebild', activeFor: ['/my', '/deadlines'] }] },
      { label: 'Normen', tabs: [ISO, NIS2, AI_ACT] },
      {
        label: 'Planen',
        tabs: [
          { to: '/context', label: 'Organisation', permission: 'context.read' },
          { to: '/risks', label: 'Risiken', permission: 'risk.read' },
          { to: '/measures', label: 'Maßnahmen', permission: 'measure.read' },
        ],
      },
      {
        label: 'Betreiben',
        tabs: [
          { to: '/assets', label: 'Assets', permission: 'asset.read' },
          { to: '/documents', label: 'Richtlinien', permission: 'document.read' },
          { to: '/competence', label: 'Team & Schulung', permission: 'competence.read' },
          { to: '/incidents', label: 'Vorfälle', permission: 'incident.read' },
        ],
      },
      {
        label: 'Prüfen',
        tabs: [
          { to: '/audits', label: 'Audits', permission: 'audit.read' },
          { to: '/findings', label: 'Feststellungen', permission: 'audit.read' },
          { to: '/reviews', label: 'Managementbewertung', permission: 'audit.read' },
        ],
      },
    ],
  },
];

export function buildNav(lean: boolean): Nav {
  return lean ? { groups: LEAN_NAV, footer: SETTINGS } : { groups: FULL, footer: null };
}

export const NAV = buildNav(LEAN);

/** Alle Menüpunkte samt Einstellungen, in der Reihenfolge der Spalte. */
export const navSections = (nav: Nav): NavSection[] => [
  ...nav.groups.flatMap((g) => g.sections),
  ...(nav.footer ? [nav.footer] : []),
];

/**
 * Leserecht je Seite. Steht getrennt vom Menü, weil manche Seiten keinen eigenen Reiter haben
 * (Anforderungsliste, Cockpit, KI-Register, im schlanken Modus auch Kennzahlen und DSGVO) und
 * trotzdem geschützt sein müssen. Deshalb aus beiden Varianten zusammengesetzt.
 */
export const ROUTE_PERMISSION: Record<string, string> = {
  '/soa': 'soa.read',
  '/cockpit': 'soa.read',
  '/ai': 'ai.read',
  ...Object.fromEntries(
    [true, false]
      .flatMap((lean) => navSections(buildNav(lean)).flatMap((s) => s.tabs))
      .filter((t) => t.permission && !t.to.includes('?'))
      .map((t) => [t.to, t.permission!]),
  ),
};

/** Wie gut passt ein Reiter zur aktuellen Adresse? Die genaueste Angabe gewinnt, 0 heißt gar nicht. */
export function matches(tab: NavTab, pathname: string, search: string): number {
  const framework = new URLSearchParams(search).get('framework');
  let best = 0;
  for (const candidate of [tab.to, ...(tab.activeFor ?? [])]) {
    const [path = '', query] = candidate.split('?');
    const pathOk = path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
    if (!pathOk) continue;
    let score: number;
    if (query) {
      if (new URLSearchParams(query).get('framework') !== framework) continue;
      score = 3;
    } else score = candidate === tab.to ? 2 : 1;
    best = Math.max(best, score);
  }
  return best;
}
