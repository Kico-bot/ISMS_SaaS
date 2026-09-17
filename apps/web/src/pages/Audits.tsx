import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import {
  EmptyState,
  ErrorNote,
  NormHint,
  PageHeader,
  Progress,
  Spinner,
  StatTile,
  StatusBadge,
} from '../components/ui';
import { FileField } from '../components/FileField';
import { api, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface AuditRow {
  id: string;
  refNo: string;
  title: string;
  kind: string;
  status: string;
  plannedFrom: string | null;
  plannedTo: string | null;
  scope: string | null;
  frameworkKey: string | null;
  leadAuditorName: string | null;
  scopeSize: number;
  findings: number;
  majorFindings: number;
  openFindings: number;
}

interface AuditDetail extends Omit<AuditRow, 'scope' | 'findings'> {
  reportFileId: string | null;
  reportFile: { id: string; filename: string; sizeBytes: number } | null;
  scope: { id: string; refCode: string; title: string; framework: string }[];
  findings: {
    id: string;
    refNo: string;
    title: string;
    severity: string;
    status: string;
    dueAt: string | null;
    refCode: string | null;
    actionCount: number;
  }[];
}

interface ProgrammeRow {
  groupRefCode: string;
  groupTitle: string;
  total: number;
  auditedInCycle: number;
  lastAuditedOn: string | null;
  openFindings: number;
}

interface RequirementOption {
  id: string;
  refCode: string;
  title: string;
  kind: string;
}

const KIND_LABEL: Record<string, string> = {
  internal: 'Internes Audit',
  external: 'Externes Audit',
  certification: 'Zertifizierungsaudit',
  supplier: 'Lieferantenaudit',
};

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

export function AuditsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cycleMonths, setCycleMonths] = useState(36);

  const list = useQuery({
    queryKey: ['audits'],
    queryFn: () => api<{ items: AuditRow[] }>('/audits?size=200'),
  });
  const programme = useQuery({
    queryKey: ['audit-programme', cycleMonths],
    queryFn: () => api<ProgrammeRow[]>(`/audits/programme?framework=ISO27001&cycleMonths=${cycleMonths}`),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['audits'] });
    void qc.invalidateQueries({ queryKey: ['audit-programme'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<AuditRow>('/audits', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (a) => {
      invalidate();
      setCreating(false);
      setOpenId(a.id);
    },
  });

  const rows = list.data?.items ?? [];
  const cov = programme.data ?? [];
  const totalReqs = cov.reduce((n, g) => n + g.total, 0);
  const auditedReqs = cov.reduce((n, g) => n + g.auditedInCycle, 0);
  const coveragePct = totalReqs > 0 ? Math.round((auditedReqs / totalReqs) * 100) : 0;
  const gaps = cov.filter((g) => g.auditedInCycle < g.total).length;

  return (
    <>
      <PageHeader
        eyebrow="Prüfung & Verbesserung"
        title="Auditprogramm"
        norm={['iso:9.2', 'iso:A.5.35']}
        description="Interne Audits nach ISO 27001 Kap. 9.2. Jedes Audit hält fest, welche Anforderungen es abgedeckt hat — nur so lässt sich belegen, dass im Zyklus nichts ausgelassen wurde."
        actions={
          can('audit.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Audit planen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? programme.error ?? create.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Abdeckung im Zyklus"
          value={`${coveragePct}%`}
          hint={`${auditedReqs} von ${totalReqs} Anforderungen`}
          tone={coveragePct >= 100 ? 'good' : coveragePct >= 60 ? 'warn' : 'bad'}
        />
        <StatTile label="Kapitel mit Lücken" value={gaps} tone={gaps > 0 ? 'warn' : 'good'} />
        <StatTile label="Audits gesamt" value={rows.length} />
        <StatTile
          label="Offene Feststellungen"
          value={rows.reduce((n, a) => n + a.openFindings, 0)}
          tone={rows.some((a) => a.openFindings > 0) ? 'warn' : 'good'}
        />
      </section>

      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            Programmabdeckung ISO/IEC 27001 — Kapitel <NormHint refs="iso:9.2" />
          </h2>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Zyklus
            <select
              className="input w-auto py-1 text-xs"
              value={cycleMonths}
              onChange={(e) => setCycleMonths(Number(e.target.value))}
            >
              <option value={12}>12 Monate</option>
              <option value={24}>24 Monate</option>
              <option value={36}>36 Monate (Zertifizierungszyklus)</option>
            </select>
          </label>
        </div>
        {programme.isLoading ? (
          <Spinner />
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-20">Kapitel</th>
                <th className="th">Titel</th>
                <th className="th w-48">Im Zyklus auditiert</th>
                <th className="th w-32">Zuletzt</th>
                <th className="th w-32">Offene Feststellungen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cov.map((g) => (
                <tr key={g.groupRefCode}>
                  <td className="td font-mono text-xs text-slate-600">{g.groupRefCode}</td>
                  <td className="td text-sm text-slate-700">{g.groupTitle}</td>
                  <td className="td">
                    <p className="mb-1 text-xs tabular-nums text-slate-600">
                      {g.auditedInCycle} von {g.total}
                    </p>
                    <Progress value={g.auditedInCycle} max={Math.max(g.total, 1)} tone="level" />
                  </td>
                  <td className="td text-xs tabular-nums text-slate-600">{date(g.lastAuditedOn)}</td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      g.openFindings > 0 ? 'font-medium text-level-medium' : 'text-slate-400',
                    )}
                  >
                    {g.openFindings || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {creating && (
        <AuditForm
          onCancel={() => setCreating(false)}
          onSubmit={(dto) => create.mutate(dto)}
          pending={create.isPending}
        />
      )}

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch kein Audit geplant"
          hint="Ein internes Audit je Jahr ist das Minimum; der Umfang darf über den Zyklus verteilt werden."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-28">Nr.</th>
                <th className="th">Audit</th>
                <th className="th w-40">Art</th>
                <th className="th w-40">Zeitraum</th>
                <th className="th w-28">Umfang</th>
                <th className="th w-36">Feststellungen</th>
                <th className="th w-32">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(a.id)}>
                  <td className="td font-mono text-xs text-slate-600">{a.refNo}</td>
                  <td className="td">
                    <span className="font-medium text-slate-800">{a.title}</span>
                    {a.leadAuditorName && (
                      <span className="ml-2 text-xs text-slate-500">{a.leadAuditorName}</span>
                    )}
                  </td>
                  <td className="td text-xs text-slate-600">{KIND_LABEL[a.kind] ?? a.kind}</td>
                  <td className="td text-xs tabular-nums text-slate-600">
                    {date(a.plannedFrom)} – {date(a.plannedTo)}
                  </td>
                  <td className="td text-xs tabular-nums text-slate-600">{a.scopeSize} Anf.</td>
                  <td className="td text-xs tabular-nums text-slate-600">
                    {a.findings === 0 ? (
                      <span className="text-slate-400">keine</span>
                    ) : (
                      <>
                        {a.findings}
                        {a.majorFindings > 0 && (
                          <span className="ml-1 font-medium text-level-critical">
                            · {a.majorFindings} Haupt
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="td">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <AuditPanel id={openId} onClose={() => setOpenId(null)} onChanged={invalidate} />}
    </>
  );
}

function AuditForm({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (dto: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const reqs = useQuery({
    queryKey: ['requirements', 'ISO27001'],
    queryFn: () => api<RequirementOption[]>('/frameworks/ISO27001/requirements'),
  });
  const leaves = (reqs.data ?? []).filter((r) => r.refCode.split('.').length >= 2 || r.kind === 'control');

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form
      className="card mb-6 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit({
          title: String(f.get('title')).trim(),
          kind: String(f.get('kind')),
          frameworkKey: 'ISO27001',
          scope: String(f.get('scope') || '') || null,
          plannedFrom: String(f.get('plannedFrom') || '') || null,
          plannedTo: String(f.get('plannedTo') || '') || null,
          requirementIds: [...selected],
        });
      }}
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="title">
            Audit
            <NormHint refs="iso:9.2" />
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={3}
            className="input"
            placeholder="Internes Audit 2026 — IT-Betrieb"
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="kind">
            Art
            <NormHint refs="iso:9.2" />
          </label>
          <select id="kind" name="kind" className="input" defaultValue="internal">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="scope">
            Organisatorischer Umfang
            <NormHint refs={['iso:9.2', 'iso:4.3']} />
          </label>
          <input id="scope" name="scope" className="input" placeholder="Rechenzentrum, IT-Betrieb" />
        </div>
        <div>
          <label className="label" htmlFor="plannedFrom">
            Von
            <NormHint refs="iso:9.2" />
          </label>
          <input id="plannedFrom" name="plannedFrom" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="plannedTo">
            Bis
            <NormHint refs="iso:9.2" />
          </label>
          <input id="plannedTo" name="plannedTo" type="date" className="input" />
        </div>
      </div>

      <fieldset className="mb-3">
        <legend className="label">
          Anforderungen im Umfang ({selected.size} gewählt)
          <NormHint refs="iso:9.2" />
        </legend>
        <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-2">
          {reqs.isLoading ? (
            <Spinner />
          ) : (
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {leaves.map((r) => (
                <label key={r.id} className="flex items-start gap-2 py-0.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span>
                    <span className="font-mono text-slate-500">{r.refCode}</span> {r.title}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          Audit planen
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function AuditPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['audit', id], queryFn: () => api<AuditDetail>(`/audits/${id}`) });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/audits/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['audit', id] });
      onChanged();
    },
  });

  const d = detail.data;

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
        aria-label="Audit"
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
                  {KIND_LABEL[d.kind] ?? d.kind} · {date(d.plannedFrom)} – {date(d.plannedTo)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {can('audit.write') && d.status !== 'closed' ? (
                  <select
                    className="input w-auto py-1 text-xs"
                    value={d.status}
                    onChange={(e) => patch.mutate({ status: e.target.value })}
                  >
                    <option value="planned">Geplant</option>
                    <option value="in_progress">In Umsetzung</option>
                    <option value="reported">Berichtet</option>
                    <option value="closed">Geschlossen</option>
                  </select>
                ) : (
                  <StatusBadge status={d.status} />
                )}
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Schließen
                </button>
              </div>
            </div>

            <ErrorNote error={patch.error} />

            {d.status === 'planned' && (
              <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Erst der Status „Berichtet“ zählt in der Programmabdeckung — ein geplantes Audit belegt
                nichts. Dafür muss der Auditbericht hinterlegt sein (Kap. 9.2.2 f).
              </p>
            )}

            {can('audit.write') && d.status !== 'closed' ? (
              <div className="mb-6">
                <FileField
                  label="Auditbericht"
                  hint="ohne Bericht kein Status „Berichtet“"
                  value={d.reportFileId}
                  filename={d.reportFile?.filename ?? null}
                  onChange={(f) => patch.mutate({ reportFileId: f?.id ?? null })}
                />
              </div>
            ) : (
              d.reportFile && (
                <p className="mb-6 text-xs text-slate-600">
                  Auditbericht:{' '}
                  <button
                    type="button"
                    className="text-brand-700 underline"
                    onClick={() => void downloadFile(d.reportFile!.id, d.reportFile!.filename)}
                  >
                    {d.reportFile.filename}
                  </button>
                </p>
              )
            )}

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">
                Feststellungen ({d.findings.length})
              </h3>
              {d.findings.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Feststellungen erfasst.</p>
              ) : (
                <ul className="space-y-1">
                  {d.findings.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                    >
                      <span className="min-w-0 text-sm text-slate-800">
                        <span className="font-mono text-xs text-slate-500">{f.refNo}</span> {f.title}
                        {f.actionCount === 0 && ['open', 'in_progress'].includes(f.status) && (
                          <span className="ml-2 text-xs text-level-medium">ohne Maßnahme</span>
                        )}
                      </span>
                      <StatusBadge status={f.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-700">
                Auditumfang ({d.scope.length} Anforderungen)
              </h3>
              <ul className="grid gap-x-4 sm:grid-cols-2">
                {d.scope.map((r) => (
                  <li key={r.id} className="py-0.5 text-xs text-slate-700">
                    <span className="font-mono text-slate-500">{r.refCode}</span> {r.title}
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
