import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { ErrorNote, NormHint, PageHeader, Spinner, StatTile, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface IncidentRow {
  id: string;
  refNo: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  detectedAt: string;
  isPersonalDataBreach: boolean;
  nis2Relevant: boolean;
  handlerName: string | null;
  openObligations: number;
  overdueObligations: number;
  nextObligationDueAt: string | null;
}

interface Obligation {
  id: string;
  regime: string;
  label: string;
  dueAt: string | null;
  authority: string;
  fulfilledAt: string | null;
  reference: string | null;
  note: string | null;
}

interface MonitorRow {
  id: string;
  regime: string;
  label: string;
  dueAt: string;
  overdue: boolean;
  hoursLeft: string;
  incidentId: string;
  incidentRefNo: string;
  incidentTitle: string;
  severity: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-orange-100 text-orange-900',
  critical: 'bg-red-100 text-red-800',
};
const SEVERITY_LABEL: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};
const CATEGORY_LABEL: Record<string, string> = {
  malware: 'Schadsoftware',
  phishing: 'Phishing',
  data_loss: 'Datenverlust',
  availability: 'Verfügbarkeit',
  unauthorized_access: 'Unbefugter Zugriff',
  physical: 'Physisch',
  supplier: 'Dienstleister',
  other: 'Sonstiges',
};

function formatDeadline(
  dueAt: string,
  hoursLeft: number,
): { text: string; tone: 'bad' | 'warn' | 'neutral' } {
  const date = new Date(dueAt).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (hoursLeft < 0)
    return { text: `${date} · seit ${Math.abs(Math.round(hoursLeft))} h überfällig`, tone: 'bad' };
  if (hoursLeft < 24) return { text: `${date} · noch ${Math.round(hoursLeft)} h`, tone: 'warn' };
  return { text: `${date} · noch ${Math.round(hoursLeft / 24)} Tage`, tone: 'neutral' };
}

export function IncidentsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['incidents'],
    queryFn: () => api<{ items: IncidentRow[] }>('/incidents?size=200'),
  });
  const monitor = useQuery({
    queryKey: ['obligations'],
    queryFn: () => api<MonitorRow[]>('/incidents/obligations'),
  });

  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<IncidentRow>('/incidents', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (inc) => {
      void qc.invalidateQueries({ queryKey: ['incidents'] });
      setCreating(false);
      setSelected(inc.id);
    },
  });

  const overdue = (monitor.data ?? []).filter((o) => o.overdue).length;
  const soon = (monitor.data ?? []).filter((o) => !o.overdue && Number(o.hoursLeft) < 24).length;

  return (
    <>
      <PageHeader
        eyebrow="Betrieb & Vorfälle"
        title="Sicherheitsvorfälle"
        norm={['iso:A.5.24', 'nis2:Art. 23', 'dsgvo:Art. 33']}
        description="Erfassen, eindämmen, melden. Die gesetzlichen Fristen nach DSGVO Art. 33 und NIS2 Art. 23 berechnet die Suite ab dem Zeitpunkt, den Sie als Kenntnisnahme festhalten."
        actions={
          can('incident.report') || can('incident.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Vorfall melden
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? monitor.error ?? create.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Überfällige Meldungen"
          value={overdue}
          tone={overdue > 0 ? 'bad' : 'good'}
          hint={overdue > 0 ? 'sofort handeln' : 'alles fristgerecht'}
        />
        <StatTile label="Fällig in unter 24 h" value={soon} tone={soon > 0 ? 'warn' : 'neutral'} />
        <StatTile
          label="Offene Vorfälle"
          value={(list.data?.items ?? []).filter((i) => !['resolved', 'closed'].includes(i.status)).length}
        />
        <StatTile
          label="Datenpannen"
          value={(list.data?.items ?? []).filter((i) => i.isPersonalDataBreach).length}
          hint="DSGVO Art. 33"
        />
      </section>

      {(monitor.data ?? []).length > 0 && (
        <section className="card mb-6 overflow-hidden">
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-2">
            <h2 className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
              Fristenmonitor <NormHint refs={['nis2:Art. 23', 'dsgvo:Art. 33']} />
            </h2>
          </header>
          <ul className="divide-y divide-slate-100">
            {monitor.data!.slice(0, 8).map((o) => {
              const f = formatDeadline(o.dueAt, Number(o.hoursLeft));
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(o.incidentId)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-2 text-left hover:bg-slate-50"
                  >
                    <span
                      className={clsx(
                        'inline-block h-2 w-2 shrink-0 rounded-full',
                        f.tone === 'bad'
                          ? 'bg-level-critical'
                          : f.tone === 'warn'
                            ? 'bg-level-medium'
                            : 'bg-slate-300',
                      )}
                      aria-hidden
                    />
                    <span className="text-sm font-medium text-slate-800">{o.label}</span>
                    <span className="font-mono text-xs text-slate-500">{o.incidentRefNo}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{o.incidentTitle}</span>
                    <span
                      className={clsx(
                        'text-xs tabular-nums',
                        f.tone === 'bad' ? 'font-medium text-level-critical' : 'text-slate-600',
                      )}
                    >
                      {f.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: String(f.get('title')),
              category: String(f.get('category')),
              severity: String(f.get('severity')),
              description: String(f.get('description') || '') || null,
            });
          }}
        >
          <div className="sm:col-span-2">
            <label className="label" htmlFor="title">
              Was ist passiert?
              <NormHint refs="iso:A.5.26" />
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              className="input"
              placeholder="z. B. Schadsoftware auf Domänencontroller erkannt"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="category">
              Kategorie
              <NormHint refs="iso:A.5.25" />
            </label>
            <select id="category" name="category" className="input" defaultValue="other">
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="severity">
              Schweregrad
              <NormHint refs="iso:A.5.25" />
            </label>
            <select id="severity" name="severity" className="input" defaultValue="medium">
              {Object.entries(SEVERITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="label" htmlFor="description">
              Beschreibung
              <NormHint refs={['iso:A.5.26', 'iso:A.5.28']} />
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="input"
              placeholder="Betroffene Systeme, Beobachtungen, erste Maßnahmen"
            />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Erfassen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-24">Nr.</th>
                <th className="th">Vorfall</th>
                <th className="th w-28">Schwere</th>
                <th className="th w-32">Status</th>
                <th className="th w-40">Meldepflichten</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data?.items.map((i) => (
                <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(i.id)}>
                  <td className="td font-mono text-xs text-slate-600">{i.refNo}</td>
                  <td className="td">
                    <span className="font-medium text-slate-800">{i.title}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {CATEGORY_LABEL[i.category] ?? i.category}
                    </span>
                    {i.isPersonalDataBreach && (
                      <span className="ml-2 badge bg-violet-100 text-violet-800">Datenpanne</span>
                    )}
                    {i.nis2Relevant && <span className="ml-1 badge bg-blue-100 text-blue-800">NIS2</span>}
                  </td>
                  <td className="td">
                    <span className={clsx('badge', SEVERITY_STYLE[i.severity])}>
                      {SEVERITY_LABEL[i.severity]}
                    </span>
                  </td>
                  <td className="td">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="td text-xs">
                    {i.openObligations === 0 ? (
                      <span className="text-slate-400">keine offen</span>
                    ) : (
                      <span
                        className={
                          i.overdueObligations > 0 ? 'font-medium text-level-critical' : 'text-slate-600'
                        }
                      >
                        {i.openObligations} offen
                        {i.overdueObligations > 0 && `, ${i.overdueObligations} überfällig`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {list.data?.items.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-slate-500" colSpan={5}>
                    Keine Vorfälle erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && <IncidentDetail id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

interface IncidentDetail extends IncidentRow {
  description: string | null;
  breachConfirmedAt: string | null;
  nis2SignificantAt: string | null;
  affectedPersons: number | null;
  obligations: Obligation[];
  timeline: { id: string; at: string; kind: string; text: string }[];
  playbookSteps: { id: string; seq: number; title: string; instruction: string; doneAt: string | null }[];
  rca: { method: string; rootCause: string | null; analysis: { whys?: string[] } } | null;
  actions: { id: string; refNo: string; title: string; status: string }[];
}

function IncidentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api<IncidentDetail>(`/incidents/${id}`),
  });
  const playbooks = useQuery({
    queryKey: ['playbooks'],
    queryFn: () => api<{ id: string; title: string; status: string }[]>('/playbooks'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['incident', id] });
    void qc.invalidateQueries({ queryKey: ['incidents'] });
    void qc.invalidateQueries({ queryKey: ['obligations'] });
    void qc.invalidateQueries({ queryKey: ['summary'] });
  };

  const confirmBreach = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/incidents/${id}/confirm-breach`, { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: invalidate,
  });
  const markSignificant = useMutation({
    mutationFn: () => api(`/incidents/${id}/mark-significant`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: invalidate,
  });
  const fulfil = useMutation({
    mutationFn: (v: { obligationId: string; reference: string }) =>
      api(`/incidents/${id}/obligations/${v.obligationId}/fulfil`, {
        method: 'POST',
        body: JSON.stringify({ reference: v.reference }),
      }),
    onSuccess: invalidate,
  });
  const toggleStep = useMutation({
    mutationFn: (v: { stepId: string; done: boolean }) =>
      api(`/incidents/${id}/playbook-steps/${v.stepId}`, {
        method: 'POST',
        body: JSON.stringify({ done: v.done }),
      }),
    onSuccess: invalidate,
  });
  const activatePlaybook = useMutation({
    mutationFn: (playbookId: string) =>
      api(`/incidents/${id}/playbook`, { method: 'POST', body: JSON.stringify({ playbookId }) }),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: (status: string) =>
      api(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });

  const d = detail.data;
  const writable = can('incident.write');

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
        aria-label="Vorfall bearbeiten"
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
                  Erkannt am {new Date(d.detectedAt).toLocaleString('de-DE')} · {CATEGORY_LABEL[d.category]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {writable && (
                  <select
                    className="input w-auto py-1 text-xs"
                    value={d.status}
                    onChange={(e) => setStatus.mutate(e.target.value)}
                  >
                    <option value="new">Neu</option>
                    <option value="triage">In Bewertung</option>
                    <option value="contained">Eingedämmt</option>
                    <option value="resolved">Behoben</option>
                    <option value="closed">Geschlossen</option>
                  </select>
                )}
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Schließen
                </button>
              </div>
            </div>

            <ErrorNote error={confirmBreach.error ?? markSignificant.error ?? fulfil.error} />

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Meldepflichten <NormHint refs={['nis2:Art. 23', 'dsgvo:Art. 33', 'dsgvo:Art. 34']} />
              </h3>
              {d.obligations.length === 0 ? (
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-sm text-slate-600">
                    Noch keine Meldepflicht festgestellt. Die Fristen beginnen mit dem Zeitpunkt, an dem Sie
                    hier Kenntnis festhalten — setzen Sie ihn bewusst.
                  </p>
                  {writable && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => {
                          const hoch = window.confirm(
                            'Besteht voraussichtlich ein hohes Risiko für die betroffenen Personen? Dann ist zusätzlich Art. 34 DSGVO einschlägig.',
                          );
                          confirmBreach.mutate({ highRiskForIndividuals: hoch });
                        }}
                      >
                        Als Datenpanne bestätigen (DSGVO)
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => markSignificant.mutate()}
                      >
                        Als erheblich einstufen (NIS2)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <ul className="space-y-1">
                  {d.obligations.map((o) => {
                    const done = !!o.fulfilledAt;
                    const hours = o.dueAt ? (new Date(o.dueAt).getTime() - Date.now()) / 3_600_000 : null;
                    return (
                      <li
                        key={o.id}
                        className={clsx(
                          'rounded border px-3 py-2',
                          done
                            ? 'border-slate-200 bg-slate-50'
                            : hours != null && hours < 0
                              ? 'border-red-200 bg-red-50'
                              : 'border-slate-200',
                        )}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span
                            className={clsx('text-sm font-medium', done && 'text-slate-500 line-through')}
                          >
                            {o.label}
                          </span>
                          {done ? (
                            <span className="text-xs text-slate-500">
                              erledigt {new Date(o.fulfilledAt!).toLocaleDateString('de-DE')}
                              {o.reference && ` · ${o.reference}`}
                            </span>
                          ) : (
                            <span
                              className={clsx(
                                'text-xs tabular-nums',
                                hours != null && hours < 0
                                  ? 'font-medium text-level-critical'
                                  : 'text-slate-600',
                              )}
                            >
                              {o.dueAt
                                ? formatDeadline(o.dueAt, hours!).text
                                : 'unverzüglich — ohne feste Frist'}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">{o.authority}</span>
                          {!done && writable && (
                            <button
                              type="button"
                              className="btn-ghost py-0.5 text-xs"
                              onClick={() => {
                                const reference =
                                  window.prompt('Aktenzeichen oder Referenz der Meldung (optional):') ?? '';
                                fulfil.mutate({ obligationId: o.id, reference });
                              }}
                            >
                              Als gemeldet vermerken
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {d.breachConfirmedAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Datenpanne bestätigt am {new Date(d.breachConfirmedAt).toLocaleString('de-DE')}
                  {d.affectedPersons != null && ` · ${d.affectedPersons} Betroffene`}
                </p>
              )}
            </section>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Playbook <NormHint refs="iso:A.5.24" />
              </h3>
              {d.playbookSteps.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">Kein Playbook aktiviert.</span>
                  {writable && (
                    <select
                      className="input w-auto py-1 text-xs"
                      value=""
                      onChange={(e) => e.target.value && activatePlaybook.mutate(e.target.value)}
                    >
                      <option value="">Playbook wählen …</option>
                      {playbooks.data
                        ?.filter((p) => p.status === 'active')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              ) : (
                <ol className="space-y-1">
                  {d.playbookSteps.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        id={`step-${s.id}`}
                        checked={!!s.doneAt}
                        disabled={!writable}
                        onChange={(e) => toggleStep.mutate({ stepId: s.id, done: e.target.checked })}
                        className="mt-1 rounded border-slate-300"
                      />
                      <label
                        htmlFor={`step-${s.id}`}
                        className={clsx('min-w-0 flex-1', s.doneAt && 'text-slate-400 line-through')}
                      >
                        <span className="font-medium">
                          {s.seq}. {s.title}
                        </span>
                        {s.instruction && (
                          <span className="block text-xs text-slate-500">{s.instruction}</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {d.rca && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  Ursachenanalyse <NormHint refs="iso:A.5.27" />
                </h3>
                <ol className="mb-2 list-inside list-decimal space-y-0.5 text-sm text-slate-700">
                  {(d.rca.analysis.whys ?? []).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ol>
                {d.rca.rootCause && (
                  <p className="text-sm">
                    <span className="font-medium">Ursache:</span> {d.rca.rootCause}
                  </p>
                )}
              </section>
            )}

            {d.actions.length > 0 && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  Abgeleitete Maßnahmen <NormHint refs={['iso:A.5.27', 'iso:10.1']} />
                </h3>
                <ul className="space-y-1">
                  {d.actions.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-slate-500">{a.refNo}</span>
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Zeitleiste <NormHint refs={['iso:A.5.26', 'iso:A.5.28']} />
              </h3>
              <ul className="space-y-1 text-xs">
                {d.timeline.map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-slate-400">
                      {new Date(t.at).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-slate-700">{t.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
