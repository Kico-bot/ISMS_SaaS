import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { TENANT_ROLE_LABEL } from '../lib/labels';
import { NAV, ROUTE_PERMISSION, matches, navSections, type NavTab } from '../lib/nav';
import { EmptyState } from './ui';

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
    !can('soa.read') || frameworks.isError || (frameworks.data?.has(key) ?? false);
  const visible = (t: NavTab) =>
    (!t.permission || can(t.permission)) && (!t.framework || frameworkShown(t.framework));
  // Genau ein Reiter ist aktiv, auch auf Seiten, die selbst keinen haben (Cockpit, Anforderungen).
  const ranked = navSections(NAV)
    .flatMap((s) => s.tabs.map((t) => ({ s, t })))
    .filter(({ t }) => visible(t))
    .map((r) => ({ ...r, score: matches(r.t, pathname, search) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);
  const activeSection = ranked[0]?.s;
  const activeTab = ranked[0]?.t;
  const sectionTabs = activeSection?.tabs.filter(visible) ?? [];
  const settings = NAV.footer?.tabs.find(visible);

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
          {NAV.groups.map((group, gi) => {
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
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm text-slate-200">{session?.user.displayName}</p>
            {settings && (
              <Link
                to={settings.to}
                aria-label="Einstellungen"
                title="Einstellungen"
                aria-current={activeSection === NAV.footer ? 'page' : undefined}
                className={clsx(
                  'rounded-md p-1 transition-colors',
                  activeSection === NAV.footer
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white',
                )}
              >
                <GearIcon />
              </Link>
            )}
          </div>
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

/** Zahnrad für die Einstellungen unten in der Spalte. */
function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        strokeLinejoin="round"
      />
    </svg>
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
