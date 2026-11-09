import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { FEATURES, type Feature, frameworkAvailable } from '../lib/features';
import { TENANT_ROLE_LABEL } from '../lib/labels';
import { EmptyState } from './ui';

interface NavTab {
  to: string;
  label: string;
  permission?: string;
  /** Nur zeigen, wenn dieses Regelwerk aktiv ist. Abgeschaltet bleibt es in den Einstellungen zu finden. */
  framework?: string;
  /** Nur zeigen, wenn diese Funktion eingeblendet ist (siehe lib/features.ts). */
  feature?: Feature;
  /** Weitere Adressen, auf denen dieser Reiter als aktiv gilt (Pfad, optional mit `?framework=`). */
  activeFor?: string[];
}

/** Ein Menüpunkt. Hat er mehrere Reiter, stehen sie als Leiste über der Seite. */
interface NavSection {
  label: string;
  tabs: NavTab[];
}

interface NavGroup {
  /** Überschrift der Gruppe; ohne steht sie für sich (Start, Normen, Einstellungen). */
  label?: string;
  sections: NavSection[];
}

/**
 * Elf Menüpunkte statt zwei Dutzend. Die Gruppen folgen dem Kreislauf der ISO 27001: planen
 * (Kap. 4 bis 6), betreiben (Kap. 7, 8 und Anhang A), prüfen und verbessern (Kap. 9, 10).
 * Was zusammengehört, ist ein Menüpunkt mit Reitern; jedes Register bleibt dabei eine eigene
 * Seite mit eigener Adresse, so dass Links aus Aufgaben, Fristen und E-Mails weiter treffen.
 */
export const NAV: NavGroup[] = [
  {
    sections: [
      {
        label: 'Start',
        tabs: [
          { to: '/', label: 'Lagebild' },
          { to: '/my', label: 'Mein Bereich', feature: 'myArea' },
          { to: '/deadlines', label: 'Fristen' },
        ],
      },
      {
        label: 'Normen',
        tabs: [
          {
            to: '/programme/iso27001',
            label: 'ISO 27001',
            permission: 'soa.read',
            activeFor: ['/soa', '/soa?framework=ISO27001'],
          },
          {
            to: '/programme/nis2',
            label: 'NIS2',
            permission: 'soa.read',
            framework: 'NIS2',
            activeFor: ['/cockpit', '/cockpit?framework=NIS2', '/soa?framework=NIS2'],
          },
          {
            to: '/programme/ai-act',
            label: 'EU AI Act',
            permission: 'soa.read',
            framework: 'EU_AI_ACT',
            activeFor: ['/ai', '/cockpit?framework=EU_AI_ACT', '/soa?framework=EU_AI_ACT'],
          },
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
          { to: '/kpis', label: 'Kennzahlen', permission: 'audit.read', feature: 'kpis' },
        ],
      },
    ],
  },
  {
    sections: [
      {
        label: 'Einstellungen',
        tabs: [
          { to: '/settings', label: 'Regelwerke', permission: 'tenant.settings' },
          { to: '/members', label: 'Mitglieder & Rollen', permission: 'tenant.members' },
          { to: '/audit-log', label: 'Änderungsprotokoll', permission: 'auditlog.read' },
        ],
      },
    ],
  },
];

/**
 * Leserecht je Seite. Steht getrennt vom Menü, weil manche Seiten keinen eigenen Reiter haben
 * (Anforderungsliste, Cockpit, KI-Register) und trotzdem geschützt sein müssen.
 */
const ROUTE_PERMISSION: Record<string, string> = {
  '/soa': 'soa.read',
  '/cockpit': 'soa.read',
  '/ai': 'ai.read',
  ...Object.fromEntries(
    NAV.flatMap((g) => g.sections.flatMap((s) => s.tabs))
      .filter((t) => t.permission && !t.to.includes('?'))
      .map((t) => [t.to, t.permission!]),
  ),
};

/** Wie gut passt ein Reiter zur aktuellen Adresse? Die genaueste Angabe gewinnt, 0 heißt gar nicht. */
function matches(tab: NavTab, pathname: string, search: string): number {
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

function useActiveFrameworks(enabled: boolean) {
  return useQuery({
    queryKey: ['frameworks'],
    queryFn: () => api<{ key: string; isActive: boolean }[]>('/frameworks'),
    enabled,
    select: (rows) => new Set(rows.filter((r) => r.isActive).map((r) => r.key)),
  });
}

export function Layout() {
  const { session, logout, can } = useAuth();
  const { pathname, search } = useLocation();
  const frameworks = useActiveFrameworks(can('soa.read'));
  // Ein abgeschaltetes Regelwerk hat keinen Reiter. Während des Ladens bleibt er weg, damit er
  // nicht kurz aufblitzt; wer die Regelwerke nicht lesen darf oder wenn die Abfrage scheitert,
  // sieht ihn, denn verstecken wäre dann geraten.
  const frameworkShown = (key: string) =>
    frameworkAvailable(key) &&
    (!can('soa.read') || frameworks.isError || (frameworks.data?.has(key) ?? false));
  const visible = (t: NavTab) =>
    (!t.permission || can(t.permission)) &&
    (!t.feature || FEATURES[t.feature]) &&
    (!t.framework || frameworkShown(t.framework));
  // Genau ein Reiter ist aktiv, auch auf Seiten, die selbst keinen haben (Cockpit, Anforderungen).
  const ranked = NAV.flatMap((g) => g.sections.flatMap((s) => s.tabs.map((t) => ({ s, t }))))
    .filter(({ t }) => visible(t))
    .map((r) => ({ ...r, score: matches(r.t, pathname, search) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);
  const activeSection = ranked[0]?.s;
  const activeTab = ranked[0]?.t;
  const sectionTabs = activeSection?.tabs.filter(visible) ?? [];

  return (
    <div className="flex min-h-screen">
      {/*
       * Dunkle Navigationsspalte: sie trennt Menü und Inhalt ohne eine weitere Linie und nimmt
       * dem Arbeitsbereich die Konkurrenz um Aufmerksamkeit. Der Inhalt ist das Register, nicht
       * das Menü.
       */}
      <aside className="flex w-64 shrink-0 flex-col bg-ink-900">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <ShieldMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-white">ISMS Suite</p>
            <p className="truncate text-xs text-slate-400">
              {session?.activeTenant?.tenantName ?? 'Kein Mandant'}
            </p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {NAV.map((group, gi) => {
            const sections = group.sections
              .map((s) => ({ s, first: s.tabs.find(visible) }))
              .filter((x) => x.first);
            if (sections.length === 0) return null;
            return (
              <div key={group.label ?? gi} className="mb-5">
                {group.label && (
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {sections.map(({ s, first }) => (
                    <Link
                      key={s.label}
                      to={first!.to}
                      aria-current={s === activeSection ? 'page' : undefined}
                      className={clsx(
                        'block rounded-lg border-l-2 px-3 py-1.5 text-sm transition-colors',
                        s === activeSection
                          ? 'border-l-brand-400 bg-white/10 font-medium text-white'
                          : 'border-l-transparent text-slate-300 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <p className="truncate text-sm text-slate-200">{session?.user.displayName}</p>
          <p className="truncate text-xs text-slate-400">
            {session?.activeTenant?.roles.map((r) => TENANT_ROLE_LABEL[r] ?? r).join(', ')}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 text-xs text-slate-400 underline underline-offset-2 hover:text-white"
          >
            Abmelden
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1440px] px-8 py-7">
          {sectionTabs.length > 1 && (
            <nav aria-label={activeSection!.label} className="tabs mb-6">
              {sectionTabs.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  aria-current={t === activeTab ? 'page' : undefined}
                  className={clsx('tab', t === activeTab && 'tab-active')}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
          <Guarded>
            <Outlet />
          </Guarded>
        </div>
      </main>
    </div>
  );
}

/** Schild mit Haken: Absicherung plus Nachweis — mehr Bedeutung braucht ein Logo hier nicht. */
function ShieldMark() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600">
      <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
        <path
          d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10v-6L12 2.5Z"
          fill="none"
          stroke="white"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="m8.8 12 2.3 2.3 4.1-4.6"
          fill="none"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * Seiten, die ohne das passende Recht gar nichts anzeigen könnten, bekommen eine klare
 * Absage statt eines leeren Gerüsts mit Fehlermeldung darunter. Das Recht steht in derselben
 * Navigationsliste wie der Menüeintrag — sonst laufen Menü und Route auseinander.
 */
export function Guarded({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const permission = ROUTE_PERMISSION[pathname];
  if (permission && !can(permission)) {
    return (
      <EmptyState
        title="Keine Berechtigung"
        hint="Für diesen Bereich fehlt Ihrer Rolle das Leserecht. Das ist gewollt, denn Aufgaben sind bewusst getrennt. Sollen Sie hier arbeiten, wenden Sie sich an die ISMS-Leitung."
      />
    );
  }
  return <>{children}</>;
}
