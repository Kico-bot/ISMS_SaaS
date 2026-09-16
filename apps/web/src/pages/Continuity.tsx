import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import {
  EmptyState,
  ErrorNote,
  OwnerSelect,
  PageHeader,
  Spinner,
  StatTile,
  StatusBadge,
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface OverviewRow {
  processId: string;
  processName: string;
  department: string | null;
  tier: number | null;
  ownerName: string | null;
  biaId: string | null;
  biaStatus: string | null;
  mtpdHours: number | null;
  rtoHours: number | null;
  rpoHours: number | null;
  maxImpact: number | null;
  resourceCount: number | null;
  planCount: number | null;
  nextTestAt: string | null;
  testOverdue: boolean | null;
}

interface Finding {
  severity: 'error' | 'warning';
  message: string;
}

interface BiaDetail {
  id: string;
  processId: string;
  processName: string;
  tier: number | null;
  ownerName: string | null;
  mtpdHours: number | null;
  rtoHours: number | null;
  rpoHours: number | null;
  mbco: string | null;
  status: string;
  approvedAt: string | null;
  approvedByName: string | null;
  impacts: { dimension: string; horizon: string; score: number }[];
  resources: {
    assetId: string;
    refNo: string;
    name: string;
    category: string;
    availability: number;
    criticality: number | null;
  }[];
  plans: {
    id: string;
    title: string;
    status: string;
    nextTestAt: string | null;
    testOverdue: boolean | null;
  }[];
  findings: Finding[];
}

interface PlanRow {
  id: string;
  title: string;
  status: string;
  activationCriteria: string | null;
  testIntervalMonths: number;
  lastTestAt: string | null;
  nextTestAt: string | null;
  testOverdue: boolean | null;
  processId: string;
  processName: string;
  rtoHours: number | null;
  stepCount: number;
  exerciseCount: number;
}

interface PlanDetail extends PlanRow {
  strategy: string | null;
  rpoHours: number | null;
  mbco: string | null;
  steps: {
    id: string;
    seq: number;
    phase: string | null;
    title: string;
    instruction: string | null;
    responsibleName: string | null;
  }[];
  exercises: {
    id: string;
    heldAt: string;
    kind: string;
    result: string | null;
    lessonsLearned: string | null;
  }[];
}

interface DueRow {
  planId: string;
  title: string;
  processName: string;
  nextTestAt: string | null;
  lastTestAt: string | null;
  overdue: boolean | null;
}

interface AssetOption {
  id: string;
  refNo: string;
  name: string;
  availability: number;
}

const DIMENSIONS = ['financial', 'reputation', 'legal', 'operational'] as const;
const HORIZONS = ['2h', '8h', '24h', '72h', '1w'] as const;
const DIMENSION_LABEL: Record<string, string> = {
  financial: 'Finanziell',
  reputation: 'Reputation',
  legal: 'Rechtlich / vertraglich',
  operational: 'Betrieblich',
};
const HORIZON_LABEL: Record<string, string> = {
  '2h': '2 Std.',
  '8h': '8 Std.',
  '24h': '24 Std.',
  '72h': '72 Std.',
  '1w': '1 Woche',
};
const IMPACT_LABEL: Record<number, string> = {
  0: 'keine',
  1: 'gering',
  2: 'spürbar',
  3: 'schwer',
  4: 'existenzbedrohend',
};
const IMPACT_STYLE: Record<number, string> = {
  0: 'bg-slate-100 text-slate-500',
  1: 'bg-green-100 text-green-800',
  2: 'bg-amber-100 text-amber-900',
  3: 'bg-orange-100 text-orange-900',
  4: 'bg-red-100 text-red-800',
};
const EXERCISE_KIND_LABEL: Record<string, string> = {
  tabletop: 'Planbesprechung',
  walkthrough: 'Durchsprache',
  simulation: 'Simulation',
  failover: 'Echter Schwenk',
  real_event: 'Ernstfall',
};
const TIER_LABEL: Record<number, string> = { 1: 'kritisch', 2: 'wichtig', 3: 'unterstützend' };

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');
const hours = (v: number | null) => (v == null ? '–' : v >= 48 ? `${Math.round(v / 24)} Tage` : `${v} Std.`);

type Tab = 'processes' | 'plans';

export function ContinuityPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('processes');
  const [creating, setCreating] = useState(false);
  const [openProcess, setOpenProcess] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ['bcm-overview'],
    queryFn: () => api<OverviewRow[]>('/processes/overview'),
  });
  const due = useQuery({ queryKey: ['bcm-due'], queryFn: () => api<DueRow[]>('/continuity-plans/due') });

  const writable = can('continuity.write');
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['bcm-overview'] });
    void qc.invalidateQueries({ queryKey: ['bcm-due'] });
    void qc.invalidateQueries({ queryKey: ['plans'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<{ id: string }>('/processes', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (p) => {
      invalidate();
      setCreating(false);
      setOpenProcess(p.id);
    },
  });

  const rows = overview.data ?? [];
  const withBia = rows.filter((r) => r.biaId).length;
  const approved = rows.filter((r) => r.biaStatus === 'approved').length;
  const overdue = (due.data ?? []).filter((d) => d.overdue).length;

  return (
    <>
      <PageHeader
        eyebrow="Betrieb & Vorfälle"
        title="Geschäftsfortführung"
        description="Business-Impact-Analyse und Notfallpläne nach ISO 27001 A.5.29/A.5.30. Ein Plan, der nie geübt wurde, ist eine Behauptung — deshalb führt jede Übung die nächste Fälligkeit mit."
        actions={
          writable ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Prozess erfassen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={overview.error ?? due.error ?? create.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Prozesse" value={rows.length} hint={`${withBia} mit BIA`} />
        <StatTile
          label="BIA freigegeben"
          value={approved}
          tone={approved === withBia && withBia > 0 ? 'good' : 'warn'}
        />
        <StatTile label="Notfallpläne" value={rows.reduce((n, r) => n + (r.planCount ?? 0), 0)} />
        <StatTile label="Übungen überfällig" value={overdue} tone={overdue > 0 ? 'bad' : 'good'} />
      </section>

      {(due.data?.length ?? 0) > 0 && (
        <section className="card mb-6 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-medium text-slate-700">Übungen in den nächsten 90 Tagen</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {due.data!.map((d) => (
              <li key={d.planId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800">{d.title}</p>
                  <p className="text-xs text-slate-500">{d.processName}</p>
                </div>
                <span
                  className={clsx(
                    'text-xs tabular-nums',
                    d.overdue ? 'font-medium text-level-critical' : 'text-level-medium',
                  )}
                >
                  {d.nextTestAt
                    ? `${d.overdue ? 'überfällig seit' : 'fällig'} ${date(d.nextTestAt)}`
                    : 'noch nie geübt'}
                  {d.lastTestAt && <span className="ml-2 text-slate-400">zuletzt {date(d.lastTestAt)}</span>}
                </span>
              </li>
            ))}
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
              name: String(f.get('name')).trim(),
              department: String(f.get('department') || '') || null,
              tier: Number(f.get('tier')) || null,
              ownerPersonId: String(f.get('ownerPersonId') || '') || null,
            });
          }}
        >
          <div className="lg:col-span-2">
            <label className="label" htmlFor="name">
              Geschäftsprozess
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={3}
              className="input"
              placeholder="Auftragsabwicklung"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="department">
              Bereich
            </label>
            <input id="department" name="department" className="input" placeholder="Vertrieb" />
          </div>
          <div>
            <label className="label" htmlFor="tier">
              Stufe
            </label>
            <select id="tier" name="tier" className="input" defaultValue="1">
              <option value="1">1 — kritisch</option>
              <option value="2">2 — wichtig</option>
              <option value="3">3 — unterstützend</option>
            </select>
          </div>
          <OwnerSelect label="Prozessverantwortung" />
          <div className="flex items-end gap-2 lg:col-span-3">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Erfassen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ['processes', 'Prozesse & BIA'],
            ['plans', 'Notfallpläne'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === key
                ? 'border-brand-600 font-medium text-brand-700'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'processes' &&
        (overview.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Noch kein Geschäftsprozess erfasst"
            hint="Die Notfallplanung setzt am Prozess an, nicht am Server — erst über den Prozess bekommt ein Asset seine Kritikalität."
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="th">Prozess</th>
                  <th className="th w-36">Verantwortung</th>
                  <th className="th w-24">Stufe</th>
                  <th className="th w-48">MTPD / RTO / RPO</th>
                  <th className="th w-32">Auswirkung</th>
                  <th className="th w-28">Pläne</th>
                  <th className="th w-36">BIA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr
                    key={r.processId}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setOpenProcess(r.processId)}
                  >
                    <td className="td">
                      <span className="font-medium text-slate-800">{r.processName}</span>
                      {r.department && <span className="ml-2 text-xs text-slate-500">{r.department}</span>}
                    </td>
                    <td className="td text-xs text-slate-600">
                      {r.ownerName ?? <span className="text-slate-400">offen</span>}
                    </td>
                    <td className="td text-xs text-slate-600">{r.tier ? TIER_LABEL[r.tier] : '–'}</td>
                    <td className="td text-xs tabular-nums text-slate-600">
                      {r.biaId ? (
                        `${hours(r.mtpdHours)} / ${hours(r.rtoHours)} / ${hours(r.rpoHours)}`
                      ) : (
                        <span className="text-slate-400">–</span>
                      )}
                    </td>
                    <td className="td">
                      {r.maxImpact == null ? (
                        <span className="text-xs text-slate-400">nicht bewertet</span>
                      ) : (
                        <span className={clsx('badge', IMPACT_STYLE[r.maxImpact])}>
                          {IMPACT_LABEL[r.maxImpact]}
                        </span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        'td text-xs tabular-nums',
                        r.testOverdue ? 'font-medium text-level-critical' : 'text-slate-600',
                      )}
                    >
                      {r.planCount ? (
                        `${r.planCount} · ${r.testOverdue ? 'Übung fällig' : date(r.nextTestAt)}`
                      ) : (
                        <span className="text-level-medium">keiner</span>
                      )}
                    </td>
                    <td className="td">
                      {r.biaId ? (
                        <StatusBadge status={r.biaStatus ?? 'draft'} />
                      ) : (
                        <span className="text-xs text-level-medium">fehlt</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === 'plans' && <PlansTab writable={writable} onChanged={invalidate} />}

      {openProcess && (
        <BiaPanel
          processId={openProcess}
          writable={writable}
          onClose={() => setOpenProcess(null)}
          onChanged={invalidate}
        />
      )}
    </>
  );
}

function BiaPanel({
  processId,
  writable,
  onClose,
  onChanged,
}: {
  processId: string;
  writable: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [creatingPlan, setCreatingPlan] = useState(false);
  const detail = useQuery({
    queryKey: ['bia', processId],
    queryFn: () => api<BiaDetail>(`/processes/${processId}/bia`),
    retry: false,
  });
  const assets = useQuery({
    queryKey: ['assets-lite'],
    queryFn: () => api<{ items: AssetOption[] }>('/assets?size=200'),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bia', processId] });
    onChanged();
  };
  const upsert = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/processes/${processId}/bia`, { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });
  const setImpact = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/processes/${processId}/bia/impacts`, { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });
  const setResource = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/processes/${processId}/bia/resources`, { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });
  const removeResource = useMutation({
    mutationFn: (assetId: string) =>
      api(`/processes/${processId}/bia/resources/${assetId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: () => api(`/processes/${processId}/bia/approve`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const createPlan = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/processes/${processId}/plans`, { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      refresh();
      setCreatingPlan(false);
    },
  });

  const d = detail.data;
  const missing = detail.isError;
  const scoreOf = (dimension: string, horizon: string) =>
    d?.impacts.find((i) => i.dimension === dimension && i.horizon === horizon)?.score;
  const errors = (d?.findings ?? []).filter((f) => f.severity === 'error');
  const warnings = (d?.findings ?? []).filter((f) => f.severity === 'warning');

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Business-Impact-Analyse"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-brand-600">Business-Impact-Analyse</p>
            <h2 className="text-lg font-semibold text-slate-900">{d?.processName ?? 'Prozess'}</h2>
            {d && (
              <p className="mt-1 text-xs text-slate-500">
                {d.ownerName ? `Verantwortung: ${d.ownerName}` : 'Verantwortung offen'}
                {d.approvedAt && ` · freigegeben am ${date(d.approvedAt)} durch ${d.approvedByName}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {d && <StatusBadge status={d.status} />}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Schließen
            </button>
          </div>
        </div>

        <ErrorNote
          error={upsert.error ?? setImpact.error ?? setResource.error ?? approve.error ?? createPlan.error}
        />

        {missing && !d ? (
          <section className="rounded-md border border-dashed border-slate-300 p-4">
            <p className="mb-3 text-sm text-slate-600">
              Für diesen Prozess liegt noch keine Analyse vor. Beziffern Sie zuerst, wie lange ein Ausfall
              überhaupt tragbar ist.
            </p>
            {writable && <BiaForm onSubmit={(dto) => upsert.mutate(dto)} pending={upsert.isPending} />}
          </section>
        ) : !d ? (
          <Spinner />
        ) : (
          <>
            {(errors.length > 0 || warnings.length > 0) && (
              <section className="mb-6 space-y-1">
                {errors.map((f, i) => (
                  <p
                    key={`e${i}`}
                    className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    {f.message}
                  </p>
                ))}
                {warnings.map((f, i) => (
                  <p
                    key={`w${i}`}
                    className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  >
                    {f.message}
                  </p>
                ))}
              </section>
            )}

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Zeitvorgaben</h3>
              {writable ? (
                <BiaForm
                  defaults={{
                    mtpdHours: d.mtpdHours,
                    rtoHours: d.rtoHours,
                    rpoHours: d.rpoHours,
                    mbco: d.mbco,
                  }}
                  onSubmit={(dto) => upsert.mutate(dto)}
                  pending={upsert.isPending}
                />
              ) : (
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">MTPD</dt>
                    <dd className="tabular-nums text-slate-800">{hours(d.mtpdHours)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">RTO</dt>
                    <dd className="tabular-nums text-slate-800">{hours(d.rtoHours)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">RPO</dt>
                    <dd className="tabular-nums text-slate-800">{hours(d.rpoHours)}</dd>
                  </div>
                </dl>
              )}
            </section>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Auswirkung über die Zeit</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr>
                      <th className="th">Dimension</th>
                      {HORIZONS.map((h) => (
                        <th key={h} className="th text-center">
                          {HORIZON_LABEL[h]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {DIMENSIONS.map((dim) => (
                      <tr key={dim}>
                        <td className="td text-xs text-slate-700">{DIMENSION_LABEL[dim]}</td>
                        {HORIZONS.map((h) => {
                          const score = scoreOf(dim, h);
                          return (
                            <td key={h} className="td text-center">
                              {writable ? (
                                <select
                                  className={clsx(
                                    'rounded px-1 py-0.5 text-xs',
                                    score == null ? 'bg-white ring-1 ring-slate-300' : IMPACT_STYLE[score],
                                  )}
                                  value={score ?? ''}
                                  onChange={(e) =>
                                    setImpact.mutate({
                                      dimension: dim,
                                      horizon: h,
                                      score: Number(e.target.value),
                                    })
                                  }
                                >
                                  <option value="" disabled>
                                    –
                                  </option>
                                  {[0, 1, 2, 3, 4].map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              ) : score == null ? (
                                <span className="text-xs text-slate-400">–</span>
                              ) : (
                                <span className={clsx('badge', IMPACT_STYLE[score])}>{score}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-slate-500">0 = keine Auswirkung, 4 = existenzbedrohend.</p>
            </section>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Benötigte Ressourcen</h3>
              {d.resources.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">Noch kein Asset zugeordnet.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.resources.map((r) => (
                    <li
                      key={r.assetId}
                      className="group flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                    >
                      <span className="text-sm text-slate-800">
                        <span className="font-mono text-xs text-slate-500">{r.refNo}</span> {r.name}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-slate-600">
                        Verfügbarkeit {r.availability}/3
                        {r.criticality && (
                          <span className="text-slate-400">Kritikalität {r.criticality}</span>
                        )}
                        {writable && (
                          <button
                            type="button"
                            className="hidden text-slate-400 underline hover:text-slate-700 group-hover:inline"
                            onClick={() => removeResource.mutate(r.assetId)}
                          >
                            Entfernen
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {writable && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setResource.mutate({
                      assetId: String(f.get('assetId')),
                      criticality: Number(f.get('criticality')),
                    });
                  }}
                >
                  <div className="min-w-56 flex-1">
                    <label className="label" htmlFor="assetId">
                      Asset
                    </label>
                    <select id="assetId" name="assetId" className="input">
                      {(assets.data?.items ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.refNo} · {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="criticality">
                      Kritikalität
                    </label>
                    <select id="criticality" name="criticality" className="input w-auto" defaultValue="1">
                      <option value="1">1 — unverzichtbar</option>
                      <option value="2">2 — wichtig</option>
                      <option value="3">3 — ersetzbar</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-ghost" disabled={setResource.isPending}>
                    Zuordnen
                  </button>
                </form>
              )}
            </section>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Notfallpläne</h3>
              {d.plans.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">Noch kein Plan hinterlegt.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.plans.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                    >
                      <span className="text-sm text-slate-800">{p.title}</span>
                      <span
                        className={clsx(
                          'text-xs tabular-nums',
                          p.testOverdue ? 'font-medium text-level-critical' : 'text-slate-500',
                        )}
                      >
                        {p.nextTestAt ? `nächste Übung ${date(p.nextTestAt)}` : 'noch nie geübt'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {writable &&
                (creatingPlan ? (
                  <form
                    className="space-y-2 rounded-md border border-dashed border-slate-300 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      createPlan.mutate({
                        title: String(f.get('title')).trim(),
                        activationCriteria: String(f.get('activationCriteria') || '') || null,
                        strategy: String(f.get('strategy') || '') || null,
                        testIntervalMonths: Number(f.get('testIntervalMonths')),
                      });
                    }}
                  >
                    <input
                      name="title"
                      required
                      minLength={3}
                      className="input"
                      placeholder="Wiederanlauf …"
                      autoFocus
                    />
                    <input
                      name="activationCriteria"
                      className="input"
                      placeholder="Auslösekriterium — wann gilt der Plan?"
                    />
                    <input
                      name="strategy"
                      className="input"
                      placeholder="Strategie — wie wird weitergearbeitet?"
                    />
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="label" htmlFor="testIntervalMonths">
                          Übungsintervall (Monate)
                        </label>
                        <input
                          id="testIntervalMonths"
                          name="testIntervalMonths"
                          type="number"
                          min={1}
                          max={60}
                          defaultValue={12}
                          className="input w-28"
                        />
                      </div>
                      <button type="submit" className="btn-primary" disabled={createPlan.isPending}>
                        Plan anlegen
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setCreatingPlan(false)}>
                        Abbrechen
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className="btn-ghost text-xs" onClick={() => setCreatingPlan(true)}>
                    Notfallplan anlegen
                  </button>
                ))}
            </section>

            {writable && d.status !== 'approved' && (
              <section className="rounded-md border border-dashed border-slate-300 p-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={approve.isPending || errors.length > 0}
                  onClick={() => approve.mutate()}
                >
                  Analyse freigeben
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  {errors.length > 0
                    ? 'Erst sind die Widersprüche oben aufzulösen.'
                    : 'Nicht durch die Person, die den Prozess verantwortet — das prüfen Suite und Datenbank.'}
                </p>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function BiaForm({
  defaults,
  onSubmit,
  pending,
}: {
  defaults?: {
    mtpdHours: number | null;
    rtoHours: number | null;
    rpoHours: number | null;
    mbco: string | null;
  };
  onSubmit: (dto: Record<string, unknown>) => void;
  pending: boolean;
}) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const num = (k: string) => (String(f.get(k) || '') === '' ? null : Number(f.get(k)));
        onSubmit({
          mtpdHours: num('mtpdHours'),
          rtoHours: num('rtoHours'),
          rpoHours: num('rpoHours'),
          mbco: String(f.get('mbco') || '') || null,
        });
      }}
    >
      <div>
        <label className="label" htmlFor="mtpdHours">
          MTPD (Std.)
        </label>
        <input
          id="mtpdHours"
          name="mtpdHours"
          type="number"
          min={0}
          className="input"
          defaultValue={defaults?.mtpdHours ?? ''}
          placeholder="48"
        />
      </div>
      <div>
        <label className="label" htmlFor="rtoHours">
          RTO (Std.)
        </label>
        <input
          id="rtoHours"
          name="rtoHours"
          type="number"
          min={0}
          className="input"
          defaultValue={defaults?.rtoHours ?? ''}
          placeholder="8"
        />
      </div>
      <div>
        <label className="label" htmlFor="rpoHours">
          RPO (Std.)
        </label>
        <input
          id="rpoHours"
          name="rpoHours"
          type="number"
          min={0}
          className="input"
          defaultValue={defaults?.rpoHours ?? ''}
          placeholder="1"
        />
      </div>
      <div className="flex items-end">
        <button type="submit" className="btn-ghost" disabled={pending}>
          Übernehmen
        </button>
      </div>
      <div className="lg:col-span-4">
        <label className="label" htmlFor="mbco">
          Mindestbetriebsniveau im Notbetrieb
        </label>
        <input
          id="mbco"
          name="mbco"
          className="input"
          defaultValue={defaults?.mbco ?? ''}
          placeholder="Was muss im Notbetrieb mindestens laufen?"
        />
      </div>
    </form>
  );
}

function PlansTab({ writable, onChanged }: { writable: boolean; onChanged: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['plans'], queryFn: () => api<PlanRow[]>('/continuity-plans') });

  if (list.isLoading) return <Spinner />;
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Noch kein Notfallplan"
        hint="Ein Plan setzt die BIA seines Prozesses voraus — sonst fehlt ihm das Ziel."
      />
    );
  }

  return (
    <>
      <ErrorNote error={list.error} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="th">Plan</th>
              <th className="th w-44">Prozess</th>
              <th className="th w-24">RTO</th>
              <th className="th w-24">Schritte</th>
              <th className="th w-40">Zuletzt geübt</th>
              <th className="th w-40">Nächste Übung</th>
              <th className="th w-28">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(p.id)}>
                <td className="td">
                  <span className="font-medium text-slate-800">{p.title}</span>
                  {p.activationCriteria && (
                    <span className="ml-2 text-xs text-slate-500">{p.activationCriteria}</span>
                  )}
                </td>
                <td className="td text-xs text-slate-600">{p.processName}</td>
                <td className="td text-xs tabular-nums text-slate-600">{hours(p.rtoHours)}</td>
                <td className="td text-xs tabular-nums text-slate-600">{p.stepCount}</td>
                <td className="td text-xs tabular-nums text-slate-600">
                  {p.lastTestAt ? (
                    `${date(p.lastTestAt)} · ${p.exerciseCount} Übungen`
                  ) : (
                    <span className="text-level-medium">nie</span>
                  )}
                </td>
                <td
                  className={clsx(
                    'td text-xs tabular-nums',
                    p.testOverdue ? 'font-medium text-level-critical' : 'text-slate-600',
                  )}
                >
                  {date(p.nextTestAt)}
                </td>
                <td className="td">
                  <StatusBadge
                    status={
                      p.status === 'active' ? 'implemented' : p.status === 'archived' ? 'closed' : 'draft'
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && (
        <PlanPanel id={openId} writable={writable} onClose={() => setOpenId(null)} onChanged={onChanged} />
      )}
    </>
  );
}

function PlanPanel({
  id,
  writable,
  onClose,
  onChanged,
}: {
  id: string;
  writable: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['plan', id],
    queryFn: () => api<PlanDetail>(`/continuity-plans/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['plan', id] });
    void qc.invalidateQueries({ queryKey: ['plans'] });
    onChanged();
  };
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/continuity-plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: refresh,
  });
  const setStep = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/continuity-plans/${id}/steps`, { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });
  const removeStep = useMutation({
    mutationFn: (stepId: string) => api(`/continuity-plans/${id}/steps/${stepId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const exercise = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/continuity-plans/${id}/exercises`, { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });

  const d = detail.data;
  const nextSeq = (d?.steps.at(-1)?.seq ?? 0) + 1;

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Notfallplan"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{d.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {d.processName} · Wiederanlauf in {hours(d.rtoHours)}
                  {d.rpoHours != null && ` · höchstens ${hours(d.rpoHours)} Datenverlust`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {writable ? (
                  <select
                    className="input w-auto py-1 text-xs"
                    value={d.status}
                    onChange={(e) => update.mutate({ status: e.target.value })}
                  >
                    <option value="draft">Entwurf</option>
                    <option value="active">Aktiv</option>
                    <option value="archived">Archiviert</option>
                  </select>
                ) : (
                  <StatusBadge status={d.status} />
                )}
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Schließen
                </button>
              </div>
            </div>

            <ErrorNote error={update.error ?? setStep.error ?? exercise.error} />

            {(d.activationCriteria || d.strategy || d.mbco) && (
              <section className="mb-6 space-y-2 text-sm">
                {d.activationCriteria && (
                  <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Auslösekriterium</span>
                    <br />
                    {d.activationCriteria}
                  </p>
                )}
                {d.strategy && (
                  <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Strategie</span>
                    <br />
                    {d.strategy}
                  </p>
                )}
                {d.mbco && (
                  <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    <span className="text-xs uppercase tracking-wide text-slate-500">
                      Mindestbetriebsniveau
                    </span>
                    <br />
                    {d.mbco}
                  </p>
                )}
              </section>
            )}

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Ablauf</h3>
              {d.steps.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">Noch kein Schritt hinterlegt.</p>
              ) : (
                <ol className="mb-3 space-y-1">
                  {d.steps.map((s) => (
                    <li
                      key={s.id}
                      className="group flex items-start justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">
                          <span className="mr-2 font-mono text-xs text-slate-400">{s.seq}</span>
                          {s.phase && (
                            <span className="mr-2 text-xs uppercase tracking-wide text-brand-600">
                              {s.phase}
                            </span>
                          )}
                          {s.title}
                        </p>
                        {s.instruction && <p className="mt-0.5 text-xs text-slate-500">{s.instruction}</p>}
                      </div>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                        {s.responsibleName ?? '–'}
                        {writable && (
                          <button
                            type="button"
                            className="hidden text-slate-400 underline hover:text-slate-700 group-hover:inline"
                            onClick={() => removeStep.mutate(s.id)}
                          >
                            Entfernen
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {writable && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setStep.mutate({
                      seq: Number(f.get('seq')),
                      phase: String(f.get('phase') || '') || null,
                      title: String(f.get('title')).trim(),
                      instruction: String(f.get('instruction') || '') || null,
                      responsiblePersonId: String(f.get('ownerPersonId') || '') || null,
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <div className="w-16">
                    <label className="label" htmlFor="seq">
                      Nr.
                    </label>
                    <input
                      id="seq"
                      name="seq"
                      type="number"
                      min={1}
                      defaultValue={nextSeq}
                      className="input"
                    />
                  </div>
                  <div className="w-32">
                    <label className="label" htmlFor="phase">
                      Phase
                    </label>
                    <input id="phase" name="phase" className="input" placeholder="Alarmierung" />
                  </div>
                  <div className="min-w-48 flex-1">
                    <label className="label" htmlFor="stepTitle">
                      Schritt
                    </label>
                    <input
                      id="stepTitle"
                      name="title"
                      required
                      minLength={3}
                      className="input"
                      placeholder="Was ist zu tun?"
                    />
                  </div>
                  <div className="w-48">
                    <OwnerSelect id="stepOwner" label="Zuständig" />
                  </div>
                  <button type="submit" className="btn-ghost" disabled={setStep.isPending}>
                    Aufnehmen
                  </button>
                </form>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Übungen</h3>
              {d.exercises.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">
                  Noch nie geübt — der Plan bleibt bis dahin ein Entwurf.
                </p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.exercises.map((e) => (
                    <li key={e.id} className="rounded border border-slate-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-800">
                          {EXERCISE_KIND_LABEL[e.kind] ?? e.kind}
                        </span>
                        <span className="text-xs tabular-nums text-slate-500">{date(e.heldAt)}</span>
                      </div>
                      {e.result && <p className="mt-0.5 text-xs text-slate-600">{e.result}</p>}
                      {e.lessonsLearned && (
                        <p className="mt-0.5 text-xs text-level-medium">Erkenntnis: {e.lessonsLearned}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {writable && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    exercise.mutate({
                      heldAt: String(f.get('heldAt')),
                      kind: String(f.get('kind')),
                      result: String(f.get('result') || '') || null,
                      lessonsLearned: String(f.get('lessonsLearned') || '') || null,
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <div>
                    <label className="label" htmlFor="heldAt">
                      Datum
                    </label>
                    <input
                      id="heldAt"
                      name="heldAt"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="input w-auto"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="kind">
                      Art
                    </label>
                    <select id="kind" name="kind" className="input w-auto" defaultValue="tabletop">
                      {Object.entries(EXERCISE_KIND_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-40 flex-1">
                    <label className="label" htmlFor="result">
                      Ergebnis
                    </label>
                    <input id="result" name="result" className="input" placeholder="RTO eingehalten?" />
                  </div>
                  <div className="min-w-40 flex-1">
                    <label className="label" htmlFor="lessonsLearned">
                      Erkenntnis
                    </label>
                    <input
                      id="lessonsLearned"
                      name="lessonsLearned"
                      className="input"
                      placeholder="Was ist zu verbessern?"
                    />
                  </div>
                  <button type="submit" className="btn-ghost" disabled={exercise.isPending}>
                    Übung festhalten
                  </button>
                </form>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
