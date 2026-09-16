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
      { to: '/deadlines', label: 'Wiedervorlage' },
    ],
  },
  {
    section: 'ISMS-Kern',
    items: [
      { to: '/context', label: 'Kontext & Ziele', permission: 'context.read' },
      { to: '/planning', label: 'Kommunikation & Änderungen', permission: 'context.read' },
      { to: '/competence', label: 'Kompetenz & Schulung', permission: 'competence.read' },
    ],
  },
  {
    section: 'Normen & Register',
    items: [
      { to: '/soa', label: 'Anforderungen & SoA', permission: 'soa.read' },
      { to: '/measures', label: 'Maßnahmen', permission: 'measure.read' },
      { to: '/documents', label: 'Dokumentenlenkung', permission: 'document.read' },
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
    section: 'Betrieb & Vorfälle',
    items: [
      { to: '/incidents', label: 'Sicherheitsvorfälle', permission: 'incident.read' },
      { to: '/continuity', label: 'Geschäftsfortführung', permission: 'continuity.read' },
    ],
  },
  {
    section: 'Datenschutz',
    items: [{ to: '/privacy', label: 'Verarbeitungsverzeichnis', permission: 'privacy.read' }],
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
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">ISMS Suite</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {session?.activeTenant?.tenantName ?? 'Kein Mandant'}
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.permission || can(i.permission));
            if (items.length === 0) return null;
            return (
              <div key={group.section} className="mb-4">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {group.section}
                </p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      clsx(
                        'block rounded-md px-2 py-1.5 text-sm',
                        isActive
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-slate-700 hover:bg-slate-50',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-sm text-slate-700">{session?.user.displayName}</p>
          <p className="truncate text-xs text-slate-500">{session?.activeTenant?.roles.join(', ')}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 text-xs text-slate-500 underline hover:text-slate-800"
          >
            Abmelden
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden px-8 py-6">
        <Guarded>
          <Outlet />
        </Guarded>
      </main>
    </div>
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
        hint="Für diesen Bereich fehlt Ihrer Rolle das Leserecht. Die Funktionstrennung ist Absicht — wenden Sie sich an die ISMS-Leitung, wenn Sie hier arbeiten sollen."
      />
    );
  }
  return <>{children}</>;
}
