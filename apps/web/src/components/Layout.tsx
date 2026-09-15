import clsx from 'clsx';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

interface NavItem {
  to: string;
  label: string;
  permission?: string;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Überblick',
    items: [{ to: '/', label: 'Start' }],
  },
  {
    section: 'Normen & Register',
    items: [
      { to: '/soa', label: 'Anforderungen & SoA', permission: 'soa.read' },
      { to: '/measures', label: 'Maßnahmen', permission: 'measure.read' },
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
    section: 'Verwaltung',
    items: [{ to: '/members', label: 'Mitglieder & Rollen', permission: 'tenant.members' }],
  },
];

export function Layout() {
  const { session, logout, can } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="text-sm font-semibold text-slate-900">ISMS Suite</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{session?.activeTenant?.tenantName ?? 'Kein Mandant'}</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.permission || can(i.permission));
            if (items.length === 0) return null;
            return (
              <div key={group.section} className="mb-4">
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{group.section}</p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      clsx(
                        'block rounded-md px-2 py-1.5 text-sm',
                        isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-50',
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
          <button type="button" onClick={() => void logout()} className="mt-2 text-xs text-slate-500 underline hover:text-slate-800">
            Abmelden
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
