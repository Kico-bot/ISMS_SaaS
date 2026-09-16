import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import {
  EmptyState,
  ErrorNote,
  FindingSeverityBadge,
  PageHeader,
  Spinner,
  StatTile,
  StatusBadge,
} from '../components/ui';
import { EvidenceSection } from '../components/EvidenceSection';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface FindingRow {
  id: string;
  refNo: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  dueAt: string | null;
  overdue: boolean | null;
  auditRefNo: string | null;
  auditTitle: string | null;
  refCode: string | null;
  framework: string | null;
  measureRefNo: string | null;
  raisedByName: string | null;
  actionCount: number;
  actionsDone: number;
}

interface FindingDetail extends FindingRow {
  description: string | null;
  closedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  requirementTitle: string | null;
  measureTitle: string | null;
  actions: {
    id: string;
    refNo: string;
    title: string;
    kind: string;
    status: string;
    dueAt: string | null;
    ownerName: string | null;
  }[];
}

interface AuditOption {
  id: string;
  refNo: string;
  title: string;
}

const SOURCE_LABEL: Record<string, string> = {
  audit: 'Audit',
  self_assessment: 'Selbstbewertung',
  incident: 'Vorfall',
  management_review: 'Managementbewertung',
  risk_review: 'Risikoüberprüfung',
};

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

export function FindingsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['findings'],
    queryFn: () => api<{ items: FindingRow[] }>('/findings?size=200'),
  });
  const audits = useQuery({
    queryKey: ['audits'],
    queryFn: () => api<{ items: AuditOption[] }>('/audits?size=100'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['findings'] });
    void qc.invalidateQueries({ queryKey: ['summary'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/findings', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
    },
  });

  const rows = (list.data?.items ?? []).filter(
    (f) => !onlyOpen || ['open', 'in_progress'].includes(f.status),
  );
  const all = list.data?.items ?? [];
  const major = all.filter(
    (f) => f.severity === 'major' && ['open', 'in_progress'].includes(f.status),
  ).length;
  const overdue = all.filter((f) => f.overdue).length;
  const verified = all.filter((f) => f.status === 'verified').length;

  return (
    <>
      <PageHeader
        eyebrow="Prüfung & Verbesserung"
        title="Feststellungen"
        description="Abweichungen aus Audits, Selbstbewertungen und Vorfällen. Eine Nichtkonformität wird erst geschlossen, wenn eine Korrekturmaßnahme sie behandelt — und bestätigt wird die Schließung von jemand anderem."
        actions={
          can('finding.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Feststellung erheben
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? create.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Offene Hauptabweichungen"
          value={major}
          tone={major > 0 ? 'bad' : 'good'}
          hint="blockieren die Zertifizierung"
        />
        <StatTile label="Überfällig" value={overdue} tone={overdue > 0 ? 'warn' : 'good'} />
        <StatTile label="Bestätigt geschlossen" value={verified} tone="good" />
        <StatTile label="Gesamt" value={all.length} />
      </section>

      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: String(f.get('title')).trim(),
              description: String(f.get('description') || '') || null,
              severity: String(f.get('severity')),
              source: String(f.get('source')),
              auditId: String(f.get('auditId') || '') || null,
              dueAt: String(f.get('dueAt') || '') || null,
            });
          }}
        >
          <div className="lg:col-span-2">
            <label className="label" htmlFor="title">
              Feststellung
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              className="input"
              placeholder="z. B. Zugriffsrechte werden nicht überprüft"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="severity">
              Einstufung
            </label>
            <select id="severity" name="severity" className="input" defaultValue="minor">
              <option value="observation">Beobachtung</option>
              <option value="minor">Nebenabweichung</option>
              <option value="major">Hauptabweichung</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="source">
              Herkunft
            </label>
            <select id="source" name="source" className="input" defaultValue="audit">
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="label" htmlFor="description">
              Nachweis / Beobachtung
            </label>
            <input
              id="description"
              name="description"
              className="input"
              placeholder="Was wurde konkret festgestellt?"
            />
          </div>
          <div>
            <label className="label" htmlFor="auditId">
              Audit
            </label>
            <select id="auditId" name="auditId" className="input" defaultValue="">
              <option value="">– ohne Audit –</option>
              {(audits.data?.items ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.refNo} · {a.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="dueAt">
              Frist
            </label>
            <input id="dueAt" name="dueAt" type="date" className="input" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Erheben
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={onlyOpen}
          onChange={(e) => setOnlyOpen(e.target.checked)}
          className="rounded border-slate-300"
        />
        Nur offene Feststellungen
      </label>

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title={onlyOpen ? 'Keine offenen Feststellungen' : 'Noch keine Feststellungen erfasst'}
          hint="Feststellungen entstehen im internen Audit, in der Selbstbewertung oder aus der Ursachenanalyse eines Vorfalls."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-24">Nr.</th>
                <th className="th">Feststellung</th>
                <th className="th w-40">Einstufung</th>
                <th className="th w-32">Herkunft</th>
                <th className="th w-28">Frist</th>
                <th className="th w-32">Maßnahmen</th>
                <th className="th w-36">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((f) => (
                <tr key={f.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(f.id)}>
                  <td className="td font-mono text-xs text-slate-600">{f.refNo}</td>
                  <td className="td">
                    <span className="font-medium text-slate-800">{f.title}</span>
                    {f.refCode && <span className="ml-2 font-mono text-xs text-slate-500">{f.refCode}</span>}
                  </td>
                  <td className="td">
                    <FindingSeverityBadge severity={f.severity} />
                  </td>
                  <td className="td text-xs text-slate-600">
                    {SOURCE_LABEL[f.source] ?? f.source}
                    {f.auditRefNo && <span className="ml-1 font-mono text-slate-500">{f.auditRefNo}</span>}
                  </td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      f.overdue ? 'font-medium text-level-critical' : 'text-slate-600',
                    )}
                  >
                    {date(f.dueAt)}
                  </td>
                  <td className="td text-xs tabular-nums text-slate-600">
                    {f.actionCount === 0 ? (
                      <span className="text-level-medium">keine</span>
                    ) : (
                      `${f.actionsDone} / ${f.actionCount} erledigt`
                    )}
                  </td>
                  <td className="td">
                    <StatusBadge status={f.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <FindingPanel id={openId} onClose={() => setOpenId(null)} onChanged={invalidate} />}
    </>
  );
}

function FindingPanel({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['finding', id],
    queryFn: () => api<FindingDetail>(`/findings/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['finding', id] });
    void qc.invalidateQueries({ queryKey: ['actions'] });
    onChanged();
  };

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/findings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: refresh,
  });
  const verify = useMutation({
    mutationFn: (result: string) =>
      api(`/findings/${id}/verify`, { method: 'POST', body: JSON.stringify({ result }) }),
    onSuccess: refresh,
  });
  const addAction = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/actions', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });

  const d = detail.data;
  const closed = d?.status === 'closed' || d?.status === 'verified';

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Feststellung bearbeiten"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-slate-500">{d.refNo}</p>
                <h2 className="text-lg font-semibold text-slate-900">{d.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {SOURCE_LABEL[d.source] ?? d.source}
                  {d.auditRefNo && ` · ${d.auditRefNo} ${d.auditTitle}`}
                  {d.raisedByName && ` · erhoben von ${d.raisedByName}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <FindingSeverityBadge severity={d.severity} />
                <StatusBadge status={d.status} />
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Schließen
                </button>
              </div>
            </div>

            <ErrorNote error={update.error ?? verify.error ?? addAction.error} />

            {d.description && (
              <section className="mb-6">
                <h3 className="mb-1 text-sm font-medium text-slate-700">Nachweis</h3>
                <p className="whitespace-pre-line rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {d.description}
                </p>
              </section>
            )}

            {(d.refCode || d.measureRefNo) && (
              <section className="mb-6">
                <h3 className="mb-1 text-sm font-medium text-slate-700">Bezug</h3>
                <ul className="space-y-0.5 text-sm text-slate-700">
                  {d.refCode && (
                    <li>
                      <span className="font-mono text-xs text-slate-500">{d.refCode}</span>{' '}
                      {d.requirementTitle}
                    </li>
                  )}
                  {d.measureRefNo && (
                    <li>
                      <span className="font-mono text-xs text-slate-500">{d.measureRefNo}</span>{' '}
                      {d.measureTitle}
                    </li>
                  )}
                </ul>
              </section>
            )}

            {/* Kap. 10.2: Der Beleg, dass die Abweichung behoben ist, gehört an die Feststellung. */}
            <EvidenceSection
              scope="finding"
              anchorId={d.id}
              writable={can('finding.write') || can('audit.write')}
            />

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Korrekturmaßnahmen</h3>
              {d.actions.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">
                  Noch keine Maßnahme. Eine Nichtkonformität lässt sich ohne Korrekturmaßnahme nicht schließen
                  (Kap. 10.2).
                </p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.actions.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                    >
                      <span className="min-w-0 text-sm text-slate-800">
                        <span className="font-mono text-xs text-slate-500">{a.refNo}</span> {a.title}
                        {a.ownerName && <span className="ml-2 text-xs text-slate-500">{a.ownerName}</span>}
                      </span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
              {can('action.write') && !closed && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    addAction.mutate({
                      title: String(f.get('title')).trim(),
                      kind: 'corrective',
                      findingId: id,
                      dueAt: String(f.get('dueAt') || '') || null,
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <div className="min-w-48 flex-1">
                    <label className="label" htmlFor="actionTitle">
                      Korrekturmaßnahme
                    </label>
                    <input
                      id="actionTitle"
                      name="title"
                      required
                      minLength={3}
                      className="input"
                      placeholder="Was wird geändert?"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="actionDue">
                      Fällig
                    </label>
                    <input id="actionDue" name="dueAt" type="date" className="input w-auto" />
                  </div>
                  <button type="submit" className="btn-ghost" disabled={addAction.isPending}>
                    Aufnehmen
                  </button>
                </form>
              )}
            </section>

            <section className="flex flex-wrap gap-2">
              {can('finding.write') && d.status === 'open' && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => update.mutate({ status: 'in_progress' })}
                >
                  In Bearbeitung
                </button>
              )}
              {can('finding.write') && ['open', 'in_progress'].includes(d.status) && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => update.mutate({ status: 'closed' })}
                >
                  Schließen
                </button>
              )}
              {can('finding.verify') && d.status === 'closed' && (
                <button
                  type="button"
                  className="btn-primary text-xs"
                  onClick={() => {
                    const result = window.prompt('Womit wurde die Wirksamkeit der Korrektur belegt?');
                    if (result && result.trim().length >= 5) verify.mutate(result);
                  }}
                >
                  Schließung bestätigen
                </button>
              )}
              {d.status === 'verified' && (
                <p className="text-xs text-slate-500">
                  Bestätigt {d.verifiedByName && `durch ${d.verifiedByName}`} am {date(d.verifiedAt)} — die
                  Feststellung bleibt ab jetzt unverändert.
                </p>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
