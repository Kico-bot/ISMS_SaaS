import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { EmptyState, ErrorNote, NormHint, PageHeader, Spinner, StatusBadge } from '../components/ui';
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

interface ScopeRow {
  requirementId: string;
  groupRefCode: string;
  groupTitle: string;
}

const KIND_LABEL: Record<string, string> = {
  internal: 'Internes Audit',
  external: 'Externes Audit',
  certification: 'Zertifizierungsaudit',
  supplier: 'Lieferantenaudit',
};

/** Der Zertifizierungszyklus: in drei Jahren muss jedes Kapitel einmal auditiert sein. */
const CYCLE_MONTHS = 36;

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

/** Kapitel 4–10 numerisch, dann Anhang A — eine Textsortierung stellte „10“ vor „4“. */
const chapterOrder = (code: string) => {
  const annex = code.startsWith('A.');
  const n = Number(annex ? code.slice(2) : code);
  return (annex ? 100 : 0) + (Number.isFinite(n) ? n : 99);
};

export function AuditsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['audits'],
    queryFn: () => api<{ items: AuditRow[] }>('/audits?size=200'),
  });
  const programme = useQuery({
    queryKey: ['audit-programme'],
    queryFn: () => api<ProgrammeRow[]>(`/audits/programme?framework=ISO27001&cycleMonths=${CYCLE_MONTHS}`),
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
  const chapters = [...(programme.data ?? [])].sort(
    (a, b) => chapterOrder(a.groupRefCode) - chapterOrder(b.groupRefCode),
  );
  const done = chapters.filter((c) => c.total > 0 && c.auditedInCycle >= c.total).length;
  const missing = chapters.filter((c) => c.auditedInCycle === 0);

  return (
    <>
      <PageHeader
        eyebrow="Prüfung & Verbesserung"
        title="Auditprogramm"
        norm={['iso:9.2', 'iso:A.5.35']}
        description="Interne Audits nach ISO 27001 Kap. 9.2: planen, durchführen, Bericht hinterlegen. Die Übersicht zeigt, welche Kapitel im Dreijahreszyklus schon geprüft wurden."
        actions={
          can('audit.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Audit planen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? programme.error ?? create.error} />

      <section className="card mb-6 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            Programm: ISO 27001 in {CYCLE_MONTHS / 12} Jahren vollständig prüfen <NormHint refs="iso:9.2" />
          </h2>
          <p className="text-xs text-slate-600">
            <span className="font-medium tabular-nums text-slate-900">{done}</span> von {chapters.length}{' '}
            Kapiteln vollständig auditiert
          </p>
        </div>
        {programme.isLoading ? (
          <Spinner />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {chapters.map((c) => {
              const state = c.auditedInCycle >= c.total ? 'done' : c.auditedInCycle > 0 ? 'partial' : 'open';
              return (
                <li
                  key={c.groupRefCode}
                  title={`${c.groupTitle}: ${c.auditedInCycle} von ${c.total} Anforderungen geprüft${
                    c.lastAuditedOn ? `, zuletzt ${date(c.lastAuditedOn)}` : ''
                  }`}
                  className={clsx(
                    'rounded-md border px-2.5 py-1.5 text-xs',
                    state === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                    state === 'partial' && 'border-amber-200 bg-amber-50 text-amber-900',
                    state === 'open' && 'border-slate-200 bg-white text-slate-500',
                  )}
                >
                  <span className="font-mono font-medium">{c.groupRefCode}</span> {c.groupTitle}
                  {c.openFindings > 0 && (
                    <span className="ml-1.5 font-medium text-level-medium">· {c.openFindings} offen</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />
            vollständig geprüft
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />
            teilweise geprüft
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-300" />
            noch offen
          </span>
        </p>
        {missing.length > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            Noch nie geprüft: {missing.map((c) => c.groupRefCode).join(', ')}. Planen Sie sie in eines der
            nächsten Audits ein.
          </p>
        )}
      </section>

      {creating && (
        <AuditForm
          onCancel={() => setCreating(false)}
          onSubmit={(dto) => create.mutate(dto)}
          pending={create.isPending}
          suggested={missing.map((c) => c.groupRefCode)}
        />
      )}

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch kein Audit geplant"
          hint="Ein internes Audit je Jahr ist üblich; der Umfang darf über den Zyklus verteilt werden."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-28">Nr.</th>
                <th className="th">Audit</th>
                <th className="th w-44">Zeitraum</th>
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
                    <span className="ml-2 text-xs text-slate-500">{KIND_LABEL[a.kind] ?? a.kind}</span>
                  </td>
                  <td className="td text-xs tabular-nums text-slate-600">
                    {date(a.plannedFrom)} bis {date(a.plannedTo)}
                  </td>
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

/**
 * Den Umfang wählt man in Kapiteln, nicht in 139 Einzelanforderungen — so plant ein Auditor auch.
 * Gespeichert werden trotzdem die Anforderungen, denn auf ihnen rechnet die Programmabdeckung.
 */
function AuditForm({
  onCancel,
  onSubmit,
  pending,
  suggested,
}: {
  onCancel: () => void;
  onSubmit: (dto: Record<string, unknown>) => void;
  pending: boolean;
  suggested: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(suggested));
  const reqs = useQuery({
    queryKey: ['soa', 'ISO27001'],
    queryFn: () => api<ScopeRow[]>('/soa?framework=ISO27001'),
  });
  const groups = [...new Map((reqs.data ?? []).map((r) => [r.groupRefCode, r.groupTitle])).entries()].sort(
    (a, b) => chapterOrder(a[0]) - chapterOrder(b[0]),
  );

  const toggle = (code: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
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
          requirementIds: (reqs.data ?? [])
            .filter((r) => selected.has(r.groupRefCode))
            .map((r) => r.requirementId),
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
            placeholder="Internes Audit 2026: IT-Betrieb"
            autoFocus
          />
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
        <div className="lg:col-span-2">
          <label className="label" htmlFor="scope">
            Welche Bereiche oder Standorte?
            <NormHint refs={['iso:9.2', 'iso:4.3']} />
          </label>
          <input id="scope" name="scope" className="input" placeholder="z. B. Rechenzentrum, IT-Betrieb" />
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
      </div>

      <fieldset className="mb-3">
        <legend className="label">
          Welche Kapitel werden geprüft? ({selected.size} gewählt)
          <NormHint refs="iso:9.2" />
        </legend>
        {suggested.length > 0 && (
          <p className="mb-2 text-xs text-slate-500">
            Vorausgewählt sind die Kapitel, die im Zyklus noch nicht geprüft wurden.
          </p>
        )}
        {reqs.isLoading ? (
          <Spinner />
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map(([code, title]) => (
              <label
                key={code}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                  selected.has(code) ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-slate-200',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(code)}
                  onChange={() => toggle(code)}
                  className="rounded border-slate-300"
                />
                <span className="font-mono font-medium">{code}</span> {title}
              </label>
            ))}
          </div>
        )}
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

/** Der Ablauf eines Audits in vier Schritten — jeweils mit genau einer nächsten Aktion. */
const STEPS = [
  { status: 'planned', label: 'Geplant' },
  { status: 'in_progress', label: 'Läuft' },
  { status: 'reported', label: 'Bericht liegt vor' },
  { status: 'closed', label: 'Abgeschlossen' },
] as const;

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
  const writable = can('audit.write') && d?.status !== 'closed';
  const step = d ? STEPS.findIndex((s) => s.status === d.status) : 0;
  const openFindings = d?.findings.filter((f) => ['open', 'in_progress'].includes(f.status)).length ?? 0;
  const chapters = d
    ? [
        ...new Set(
          d.scope.map((r) =>
            r.refCode
              .split('.')
              .slice(0, r.refCode.startsWith('A.') ? 2 : 1)
              .join('.'),
          ),
        ),
      ]
    : [];

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
                  {KIND_LABEL[d.kind] ?? d.kind} · {date(d.plannedFrom)} bis {date(d.plannedTo)}
                  {d.leadAuditorName && ` · ${d.leadAuditorName}`}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Schließen
              </button>
            </div>

            <ErrorNote error={patch.error} />

            <ol className="mb-5 grid grid-cols-4 gap-1">
              {STEPS.map((s, i) => (
                <li
                  key={s.status}
                  className={clsx(
                    'rounded px-2 py-1.5 text-center text-xs',
                    i < step && 'bg-emerald-50 text-emerald-800',
                    i === step && 'bg-brand-600 font-medium text-white',
                    i > step && 'bg-slate-100 text-slate-500',
                  )}
                >
                  {s.label}
                </li>
              ))}
            </ol>

            {writable && (
              <section className="mb-6 rounded-md border border-slate-200 p-3">
                {d.status === 'planned' && (
                  <NextStep
                    text="Das Audit beginnt: Feststellungen erfassen Sie unter „Feststellungen“ mit Bezug auf dieses Audit."
                    action="Audit starten"
                    onClick={() => patch.mutate({ status: 'in_progress' })}
                  />
                )}
                {d.status === 'in_progress' && (
                  <>
                    <FileField
                      label="Auditbericht"
                      hint="Kap. 9.2.2 verlangt die Ergebnisse als dokumentierte Information"
                      value={d.reportFileId}
                      filename={d.reportFile?.filename ?? null}
                      onChange={(f) => patch.mutate({ reportFileId: f?.id ?? null })}
                    />
                    <NextStep
                      text={
                        d.reportFileId
                          ? 'Mit dem Bericht zählt das Audit im Programm und erscheint in der Managementbewertung.'
                          : 'Erst mit hinterlegtem Bericht lässt sich das Audit als berichtet markieren.'
                      }
                      action="Bericht abgeben"
                      disabled={!d.reportFileId}
                      onClick={() => patch.mutate({ status: 'reported' })}
                    />
                  </>
                )}
                {d.status === 'reported' && (
                  <NextStep
                    text={
                      openFindings > 0
                        ? `Noch ${openFindings} offene Feststellung(en). Sie können das Audit trotzdem abschließen. Die Feststellungen bleiben offen, bis sie behoben sind.`
                        : 'Alle Feststellungen sind erledigt.'
                    }
                    action="Audit abschließen"
                    onClick={() => patch.mutate({ status: 'closed' })}
                  />
                )}
              </section>
            )}

            {!writable && d.reportFile && (
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
            )}

            <section className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                Feststellungen ({d.findings.length}) <NormHint refs={['iso:9.2', 'iso:10.2']} />
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
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                Geprüfte Kapitel <NormHint refs="iso:9.2" />
              </h3>
              <p className="text-sm text-slate-700">
                {chapters.length === 0 ? (
                  <span className="text-slate-500">Kein Umfang festgelegt.</span>
                ) : (
                  <>
                    {chapters.join(', ')}{' '}
                    <span className="text-xs text-slate-500">({d.scope.length} Anforderungen)</span>
                  </>
                )}
              </p>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function NextStep({
  text,
  action,
  onClick,
  disabled,
}: {
  text: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 text-xs text-slate-600">{text}</p>
      <button type="button" className="btn-primary" disabled={disabled} onClick={onClick}>
        {action}
      </button>
    </div>
  );
}
