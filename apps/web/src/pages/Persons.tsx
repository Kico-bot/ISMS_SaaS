import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { EmptyState, ErrorNote, PageHeader, Spinner, StatTile } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface Person {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  position: string | null;
  isActive: boolean;
  hasLogin: boolean;
  assetCount: number;
  riskCount: number;
  measureCount: number;
  actionCount: number;
  objectiveCount: number;
}

export function PersonsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const list = useQuery({
    queryKey: ['persons', includeInactive],
    queryFn: () => api<Person[]>(`/persons${includeInactive ? '?includeInactive=true' : ''}`),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['persons'] });

  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/persons', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
    },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/persons/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const reactivate = useMutation({
    mutationFn: (id: string) =>
      api(`/persons/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) }),
    onSuccess: invalidate,
  });

  const rows = list.data ?? [];
  const active = rows.filter((p) => p.isActive);
  const withLogin = active.filter((p) => p.hasLogin).length;
  const withoutResponsibility = active.filter(
    (p) => p.assetCount + p.riskCount + p.measureCount + p.actionCount + p.objectiveCount === 0,
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Beschäftigte"
        description="Wer im ISMS Verantwortung trägt. Nicht jede Person braucht ein Benutzerkonto — Assets, Risiken und Maßnahmen lassen sich auch Menschen zuordnen, die nie einloggen."
        actions={
          can('context.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Person erfassen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? create.error ?? deactivate.error ?? reactivate.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Aktive Beschäftigte" value={active.length} />
        <StatTile
          label="Mit Benutzerkonto"
          value={withLogin}
          hint={`${active.length - withLogin} ohne Login`}
        />
        <StatTile
          label="Ohne Verantwortung"
          value={withoutResponsibility}
          tone={withoutResponsibility > 0 ? 'neutral' : 'good'}
        />
        <StatTile
          label="Zuweisungen gesamt"
          value={rows.reduce(
            (n, p) => n + p.assetCount + p.riskCount + p.measureCount + p.actionCount + p.objectiveCount,
            0,
          )}
        />
      </section>

      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              name: String(f.get('name')).trim(),
              email: String(f.get('email') || '') || null,
              department: String(f.get('department') || '') || null,
              position: String(f.get('position') || '') || null,
            });
          }}
        >
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              className="input"
              placeholder="Bernd Betrieb"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              E-Mail
            </label>
            <input id="email" name="email" type="email" className="input" placeholder="bernd@firma.de" />
          </div>
          <div>
            <label className="label" htmlFor="department">
              Abteilung
            </label>
            <input id="department" name="department" className="input" placeholder="IT-Betrieb" />
          </div>
          <div>
            <label className="label" htmlFor="position">
              Funktion
            </label>
            <input id="position" name="position" className="input" placeholder="Systemadministrator" />
          </div>
          <div className="flex items-end gap-2 lg:col-span-4">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Erfassen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
            <p className="text-xs text-slate-500">
              Ein Benutzerkonto vergeben Sie separat unter „Mitglieder &amp; Rollen“ — dort entsteht die
              Person automatisch mit.
            </p>
          </div>
        </form>
      )}

      <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          className="rounded border-slate-300"
        />
        Ausgeschiedene anzeigen
      </label>

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Noch keine Beschäftigten erfasst" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Name</th>
                <th className="th w-40">Abteilung</th>
                <th className="th w-44">Funktion</th>
                <th className="th w-28">Zugang</th>
                <th className="th w-56">Verantwortung</th>
                {can('context.write') && <th className="th w-28" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className={clsx('hover:bg-slate-50', !p.isActive && 'opacity-50')}>
                  <td className="td">
                    <span className="font-medium text-slate-800">{p.name}</span>
                    {p.email && <span className="ml-2 text-xs text-slate-500">{p.email}</span>}
                  </td>
                  <td className="td text-xs text-slate-600">{p.department ?? '–'}</td>
                  <td className="td text-xs text-slate-600">{p.position ?? '–'}</td>
                  <td className="td text-xs">
                    {p.hasLogin ? (
                      <span className="badge bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
                        Benutzer
                      </span>
                    ) : (
                      <span className="text-slate-400">kein Login</span>
                    )}
                  </td>
                  <td className="td text-xs tabular-nums text-slate-600">
                    {[
                      p.assetCount && `${p.assetCount} Assets`,
                      p.riskCount && `${p.riskCount} Risiken`,
                      p.measureCount && `${p.measureCount} Maßnahmen`,
                      p.actionCount && `${p.actionCount} KVP`,
                      p.objectiveCount && `${p.objectiveCount} Ziele`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || <span className="text-slate-400">keine</span>}
                  </td>
                  {can('context.write') && (
                    <td className="td">
                      {p.isActive ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 underline hover:text-slate-700"
                          onClick={() => deactivate.mutate(p.id)}
                        >
                          Ausscheiden
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-slate-400 underline hover:text-slate-700"
                          onClick={() => reactivate.mutate(p.id)}
                        >
                          Reaktivieren
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
