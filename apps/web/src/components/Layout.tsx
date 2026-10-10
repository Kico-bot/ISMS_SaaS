import clsx from 'clsx';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { EmptyState } from './ui';

interface NavItem {
  to: string;
  label: string;
  permission?: string;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Überblick',
    items: [
      { to: '/', label: 'Start' },
      { to: '/deadlines', label: 'Fristen' },
    ],
  },
  {
    section: 'Managementsystem',
    items: [
      { to: '/context', label: 'Kontext & Ziele', permission: 'context.read' },
      { to: '/planning', label: 'Kommunikation & Änderungen', permission: 'context.read' },
      { to: '/competence', label: 'Kompetenz & Schulung', permission: 'competence.read' },
    ],
  },
  {
    section: 'Anforderungen & Maßnahmen',
    items: [
      { to: '/soa', label: 'Anforderungen & SoA', permission: 'soa.read' },
      { to: '/cockpit', label: 'Cockpit NIS2 & AI Act', permission: 'soa.read' },
      { to: '/measures', label: 'Maßnahmen', permission: 'measure.read' },
      { to: '/documents', label: 'Dokumente', permission: 'document.read' },
    ],
  },
  {
    section: 'Risiken',
    items: [
      { to: '/assets', label: 'Asset-Inventar', permission: 'asset.read' },
      { to: '/risks', label: 'Risikoregister', permission: 'risk.read' },
    ],
  },
  {
    section: 'Vorfälle & Notbetrieb',
    items: [
      { to: '/incidents', label: 'Sicherheitsvorfälle', permission: 'incident.read' },
      { to: '/continuity', label: 'Notfallplanung', permission: 'continuity.read' },
    ],
  },
  {
    section: 'Datenschutz & KI',
    items: [
      { to: '/privacy', label: 'Verarbeitungsverzeichnis', permission: 'privacy.read' },
      { to: '/ai', label: 'KI-Register', permission: 'ai.read' },
    ],
  },
  {
    section: 'Prüfung & Verbesserung',
    items: [
      { to: '/audits', label: 'Auditprogramm', permission: 'audit.read' },
      { to: '/findings', label: 'Feststellungen', permission: 'audit.read' },
      { to: '/actions', label: 'Verbesserungen (KVP)', permission: 'action.read' },
      { to: '/kpis', label: 'Kennzahlen', permission: 'audit.read' },
      { to: '/reviews', label: 'Managementbewertung', permission: 'audit.read' },
    ],
  },
  {
    section: 'Verwaltung',
    items: [
      { to: '/persons', label: 'Beschäftigte', permission: 'context.read' },
      { to: '/audit-log', label: 'Änderungsprotokoll', permission: 'auditlog.read' },
      { to: '/settings', label: 'Einstellungen', permission: 'tenant.settings' },
      { to: '/members', label: 'Mitglieder & Rollen', permission: 'tenant.members' },
    ],
  },
];

export function Layout() {
  const { session, logout, can } = useAuth();

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
            const items = group.items.filter((i) => !i.permission || can(i.permission));
            if (items.length === 0) return null;
            return (
              <div key={group.section} className="mb-5">
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {group.section}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        clsx(
                          'block rounded-lg border-l-2 px-3 py-1.5 text-sm transition-colors',
                          isActive
                            ? 'border-l-brand-400 bg-white/10 font-medium text-white'
                            : 'border-l-transparent text-slate-300 hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <p className="truncate text-sm text-slate-200">{session?.user.displayName}</p>
          <p className="truncate text-xs text-slate-400">{session?.activeTenant?.roles.join(', ')}</p>
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
