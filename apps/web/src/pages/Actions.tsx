import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { ErrorNote, PageHeader, Spinner, StatTile, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface ActionRow {
  id: string;
  refNo: string;
  title: string;
  kind: string;
  status: string;
  dueAt: string | null;
  ownerName: string | null;
  overdue: boolean;
  origin: { kind: string; id: string; label: string } | null;
}

const KIND_LABEL: Record<string, string> = { corrective: 'Korrektur', preventive: 'Vorbeugung', improvement: 'Verbesserung' };
const ORIGIN_LABEL: Record<string, string> = { finding: 'Feststellung', risk: 'Risiko', incident: 'Vorfall', review: 'Management-Review' };

export function ActionsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const list = useQuery({ queryKey: ['actions'], queryFn: () => api<{ items: ActionRow[] }>('/actions?size=200') });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['actions'] });
    void qc.invalidateQueries({ queryKey: ['summary'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) => api('/actions', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => api(`/actions/${v.id}`, { method: 'PATCH', body: JSON.stringify(v.body) }),
    onSuccess: invalidate,
  });
  const verify = useMutation({
    mutationFn: (v: { id: string; result: string }) => api(`/actions/${v.id}/verify`, { method: 'POST', body: JSON.stringify({ result: v.result }) }),
    onSuccess: invalidate,
  });

  const rows = (list.data?.items ?? []).filter((a) => !onlyOpen || !['done', 'verified', 'rejected'].includes(a.status));
  const overdue = (list.data?.items ?? []).filter((a) => a.overdue).length;
  const verified = (list.data?.items ?? []).filter((a) => a.status === 'verified').length;

  return (
    <>
      <PageHeader
        eyebrow="Betrieb & Vorfälle"
        title="Verbesserungsregister (KVP)"
        description="Korrektur- und Verbesserungsmaßnahmen nach ISO 27001 Kap. 10. Jede Maßnahme kennt ihren Auslöser, und ihre Wirksamkeit bestätigt jemand anderes als die verantwortliche Person."
        actions={
          can('action.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Maßnahme anlegen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? create.error ?? update.error ?? verify.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Offen" value={rows.length} />
        <StatTile label="Überfällig" value={overdue} tone={overdue > 0 ? 'bad' : 'good'} />
        <StatTile label="Wirksamkeit bestätigt" value={verified} tone="good" />
        <StatTile label="Gesamt" value={list.data?.items.length ?? 0} />
      </section>

      {creating && (
        <form
          className="card mb-4 flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: String(f.get('title')),
              kind: String(f.get('kind')),
              dueAt: String(f.get('dueAt') || '') || null,
            });
          }}
        >
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="title">
              Maßnahme
            </label>
            <input id="title" name="title" required minLength={3} className="input" placeholder="z. B. Patch-Fenster verkürzen" autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Art
            </label>
            <select id="kind" name="kind" className="input w-auto" defaultValue="corrective">
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="dueAt">
              Fällig bis
            </label>
            <input id="dueAt" name="dueAt" type="date" className="input w-auto" />
          </div>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            Anlegen
          </button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
            Abbrechen
          </button>
        </form>
      )}

      <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="rounded border-slate-300" />
        Nur offene Maßnahmen
      </label>

      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-28">Nr.</th>
                <th className="th">Maßnahme</th>
                <th className="th w-32">Auslöser</th>
                <th className="th w-32">Fällig</th>
                <th className="th w-36">Status</th>
                <th className="th w-40">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs text-slate-600">{a.refNo}</td>
                  <td className="td">
                    <span className="font-medium text-slate-800">{a.title}</span>
                    <span className="ml-2 text-xs text-slate-500">{KIND_LABEL[a.kind]}</span>
                  </td>
                  <td className="td text-xs text-slate-600">
                    {a.origin ? (
                      <>
                        {ORIGIN_LABEL[a.origin.kind] ?? a.origin.kind}
                        <span className="ml-1 font-mono text-slate-500">{a.origin.label}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">frei</span>
                    )}
                  </td>
                  <td className={clsx('td text-xs tabular-nums', a.overdue ? 'font-medium text-level-critical' : 'text-slate-600')}>
                    {a.dueAt ? new Date(a.dueAt).toLocaleDateString('de-DE') : '–'}
                  </td>
                  <td className="td">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="td">
                    {can('action.write') && ['open', 'in_progress'].includes(a.status) && (
                      <button type="button" className="btn-ghost py-0.5 text-xs" onClick={() => update.mutate({ id: a.id, body: { status: 'done' } })}>
                        Als umgesetzt melden
                      </button>
                    )}
                    {can('action.verify') && a.status === 'done' && (
                      <button
                        type="button"
                        className="btn-ghost py-0.5 text-xs"
                        onClick={() => {
                          const result = window.prompt('Wie wurde die Wirksamkeit geprüft?');
                          if (result && result.trim().length >= 5) verify.mutate({ id: a.id, result });
                        }}
                      >
                        Wirksamkeit bestätigen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-slate-500" colSpan={6}>
                    {onlyOpen ? 'Keine offenen Maßnahmen.' : 'Noch keine Maßnahmen erfasst.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
