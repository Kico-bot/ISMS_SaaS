import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { TENANT_ROLE_LABEL } from '../lib/labels';
import { EmptyState } from './ui';

interface NavItem {
  to: string;
  label: string;
  permission?: string;
  /** Nur zeigen, wenn dieses Regelwerk aktiv ist. Abgeschaltet bleibt es in den Einstellungen zu finden. */
  framework?: string;
  /** Erreichbar über eine Programmseite, aber kein eigener Menüpunkt; die Rechteprüfung gilt trotzdem. */
  hidden?: boolean;
  /** Weitere Adressen, auf denen dieser Menüpunkt als aktiv gilt (Pfad, optional mit `?framework=`). */
  activeFor?: string[];
}

interface NavGroup {
  section: string;
  items: NavItem[];
  /** Selten gebraucht: zugeklappt, bis man es öffnet oder sich darin befindet. */
  collapsible?: boolean;
}

/**
 * Navigation nach Aufgaben, nicht nach Normkapiteln: erst das Lagebild, dann die drei Programme,
 * dann der Bestand, an dem gearbeitet wird, dann die Prüfung. Was man selten braucht, liegt
 * zugeklappt unter „Organisation“.
 */
export const NAV: NavGroup[] = [
  {
    section: 'Überblick',
    items: [
      { to: '/', label: 'Lagebild' },
      { to: '/my', label: 'Mein Bereich' },
      { to: '/deadlines', label: 'Fristen' },
    ],
  },
  {
    section: 'Programme',
    items: [
      { to: '/programme/iso27001', label: 'ISO 27001', permission: 'soa.read', activeFor: ['/soa'] },
      {
        to: '/programme/nis2',
        label: 'NIS2',
        permission: 'soa.read',
        activeFor: ['/cockpit?framework=NIS2', '/cockpit'],
      },
      {
        to: '/programme/ai-act',
        label: 'EU AI Act',
        permission: 'soa.read',
        activeFor: ['/cockpit?framework=EU_AI_ACT'],
      },
      { to: '/soa', label: 'Anforderungen & SoA', permission: 'soa.read', hidden: true },
      { to: '/cockpit', label: 'Cockpit', permission: 'soa.read', hidden: true },
    ],
  },
  {
    section: 'Bestand',
    items: [
      { to: '/assets', label: 'Asset-Inventar', permission: 'asset.read' },
      { to: '/risks', label: 'Risikoregister', permission: 'risk.read' },
      { to: '/measures', label: 'Maßnahmen', permission: 'measure.read' },
      { to: '/documents', label: 'Dokumente', permission: 'document.read' },
      { to: '/incidents', label: 'Sicherheitsvorfälle', permission: 'incident.read' },
      { to: '/continuity', label: 'Notfallplanung', permission: 'continuity.read' },
      { to: '/ai', label: 'KI-Register', permission: 'ai.read' },
      { to: '/privacy', label: 'Verarbeitungsverzeichnis', permission: 'privacy.read', framework: 'DSGVO' },
    ],
  },
  {
    section: 'Prüfen & verbessern',
    items: [
      { to: '/audits', label: 'Auditprogramm', permission: 'audit.read' },
      { to: '/findings', label: 'Feststellungen', permission: 'audit.read' },
      { to: '/actions', label: 'Verbesserungen', permission: 'action.read' },
      { to: '/reviews', label: 'Managementbewertung', permission: 'audit.read' },
      { to: '/kpis', label: 'Kennzahlen', permission: 'audit.read' },
    ],
  },
  {
    section: 'Organisation',
    collapsible: true,
    items: [
      { to: '/context', label: 'Kontext & Ziele', permission: 'context.read' },
      { to: '/planning', label: 'Kommunikation & Änderungen', permission: 'context.read' },
      { to: '/competence', label: 'Kompetenz & Schulung', permission: 'competence.read' },
      { to: '/persons', label: 'Beschäftigte', permission: 'context.read' },
      { to: '/members', label: 'Mitglieder & Rollen', permission: 'tenant.members' },
      { to: '/audit-log', label: 'Änderungsprotokoll', permission: 'auditlog.read' },
      { to: '/settings', label: 'Einstellungen', permission: 'tenant.settings' },
    ],
  },
];

/** Ist der Menüpunkt für die aktuelle Adresse der richtige? Die genaueste Angabe gewinnt. */
function matches(item: NavItem, pathname: string, search: string): number {
  if (item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`))
    return 3;
  const framework = new URLSearchParams(search).get('framework');
  for (const a of item.activeFor ?? []) {
    const [path, query] = a.split('?');
    if (path !== pathname) continue;
    if (query) {
      if (new URLSearchParams(query).get('framework') === framework) return 2;
    } else return 1;
  }
  return 0;
}

function useActiveFrameworks(enabled: boolean) {
  return useQuery({
    queryKey: ['frameworks'],
    queryFn: () => api<{ key: string; isActive: boolean }[]>('/frameworks'),
    enabled,
    select: (rows) => new Set(rows.filter((r) => r.isActive).map((r) => r.key)),
  });
}

const COLLAPSE_KEY = 'isms.nav.open';

function readOpen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function Layout() {
  const { session, logout, can } = useAuth();
  const { pathname, search } = useLocation();
  const frameworks = useActiveFrameworks(can('soa.read'));
  const [open, setOpen] = useState<string[]>(readOpen);
  const toggle = (section: string) => {
    const next = open.includes(section) ? open.filter((s) => s !== section) : [...open, section];
    setOpen(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      /* nur Bequemlichkeit */
    }
  };
  // Ein abgeschaltetes Regelwerk hat keinen Menüpunkt. Während des Ladens bleibt er weg, damit er
  // nicht kurz aufblitzt; wer die Regelwerke nicht lesen darf oder wenn die Abfrage scheitert,
  // sieht ihn, denn verstecken wäre dann geraten.
  const frameworkShown = (key: string) =>
    !can('soa.read') || frameworks.isError || (frameworks.data?.has(key) ?? false);
  // Genau ein Menüpunkt ist aktiv, auch auf Seiten, die selbst keinen haben (Cockpit, Anforderungen).
  const ranked = NAV.flatMap((g) => g.items)
    .filter((i) => !i.hidden)
    .map((i) => ({ to: i.to, score: matches(i, pathname, search) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  const activeTo = ranked[0]?.to;

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
          {NAV.map((group) => {
            const items = group.items.filter(
              (i) =>
                !i.hidden &&
                (!i.permission || can(i.permission)) &&
                (!i.framework || frameworkShown(i.framework)),
            );
            if (items.length === 0) return null;
            const inside = items.some((i) => i.to === activeTo);
            const expanded = !group.collapsible || inside || open.includes(group.section);
            return (
              <div key={group.section} className="mb-5">
                {group.collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggle(group.section)}
                    aria-expanded={expanded}
                    className="flex w-full items-center justify-between px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 hover:text-slate-300"
                  >
                    {group.section}
                    <span aria-hidden>{expanded ? '−' : '+'}</span>
                  </button>
                ) : (
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {group.section}
                  </p>
                )}
                {expanded && (
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        aria-current={item.to === activeTo ? 'page' : undefined}
                        className={clsx(
                          'block rounded-lg border-l-2 px-3 py-1.5 text-sm transition-colors',
                          item.to === activeTo
                            ? 'border-l-brand-400 bg-white/10 font-medium text-white'
                            : 'border-l-transparent text-slate-300 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
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
  const item = NAV.flatMap((g) => g.items).find((i) => i.to === pathname);
  if (item?.permission && !can(item.permission)) {
    return (
      <EmptyState
        title="Keine Berechtigung"
        hint="Für diesen Bereich fehlt Ihrer Rolle das Leserecht. Das ist gewollt, denn Aufgaben sind bewusst getrennt. Sollen Sie hier arbeiten, wenden Sie sich an die ISMS-Leitung."
      />
    );
  }
  return <>{children}</>;
}
