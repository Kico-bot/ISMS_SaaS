import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  ErrorNote,
  NormHint,
  PageHeader,
  Spinner,
  StatTile,
  StatusBadge,
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { COVERAGE_COLOR } from '../lib/chart-colors';

type Status = 'covered' | 'in_progress' | 'indirect' | 'open' | 'not_applicable';

interface Link_ {
  requirementId: string;
  framework: string;
  refCode: string;
  title: string;
  isGroup: boolean;
  source: string;
  implemented: number;
  total: number;
}

interface Row {
  id: string;
  refCode: string;
  altRef: string | null;
  /** „Geht über ISO 27001 hinaus“ u. Ä. — aus dem Katalog. */
  hint: string | null;
  title: string;
  appliesFrom: string | null;
  status: Status;
  measures: { id: string; refNo: string; title: string; status: string }[];
  indirectMeasures: {
    id: string;
    refNo: string;
    title: string;
    status: string;
    viaFramework: string;
    viaRefCode: string;
  }[];
  links: Link_[];
}

interface Flow {
  nodes: { id: string; name: string; layer: number; framework: string; status: string }[];
  links: { source: string; target: string }[];
}

const STATUS_LABEL: Record<Status, string> = {
  covered: 'erfüllt',
  in_progress: 'in Arbeit',
  indirect: 'indirekt abgedeckt',
  open: 'offen',
  not_applicable: 'nicht anwendbar',
};

const STATUS_HINT: Record<Status, string> = {
  covered: 'Eine umgesetzte Maßnahme ist direkt zugeordnet.',
  in_progress: 'Maßnahmen sind zugeordnet, aber noch keine umgesetzt.',
  indirect:
    'Eine umgesetzte Maßnahme hängt an einer verknüpften Anforderung — keine echte Lücke, nur eine fehlende Zuordnung.',
  open: 'Weder direkt noch über verknüpfte Anforderungen abgedeckt.',
  not_applicable: 'Mit Begründung als nicht anwendbar erklärt.',
};

const FW_LABEL: Record<string, string> = {
  ISO27001: 'ISO 27001',
  BSI_GS: 'IT-Grundschutz',
  NIS2: 'NIS2',
  DSGVO: 'DSGVO',
  EU_AI_ACT: 'AI Act',
};

const COCKPITS = [
  { key: 'NIS2', label: 'NIS2 / BSIG' },
  { key: 'EU_AI_ACT', label: 'AI Act (Betreiber)' },
] as const;

/**
 * Cockpit: wie ein Regelwerk über die anderen erfüllt wird. Für NIS2 ist das die Frage einer
 * Prüfung nach § 30 BSIG — „womit erfüllen Sie Buchstabe j?“ —, für den AI Act die nach den
 * Betreiberpflichten der Systeme im KI-Register. Das Cockpit hat keine eigenen Daten: es liest
 * Zuordnungen, Crosswalk, Modellierung und den Stand der Maßnahmen.
 */
export function CockpitPage() {
  const [params, setParams] = useSearchParams();
  const framework = params.get('framework') ?? 'NIS2';
  const view = params.get('view') ?? 'table';
  const frameworks = useQuery({
    queryKey: ['frameworks'],
    queryFn: () => api<{ key: string; isActive: boolean }[]>('/frameworks'),
  });
  const active = new Set(frameworks.data?.filter((f) => f.isActive).map((f) => f.key));
  const isAi = framework === 'EU_AI_ACT';

  return (
    <>
      <PageHeader
        eyebrow="Anforderungen & Maßnahmen"
        title={isAi ? 'AI Act — Betreiberpflichten' : 'NIS2-Cockpit'}
        norm={isAi ? 'aiact:Art. 26' : ['nis2:Art. 21', 'nis2:Art. 23']}
        description={
          isAi
            ? 'Nur Pflichten als Betreiber — für KI-Systeme, die Sie einsetzen. Anbieterpflichten (Konformitätsbewertung, CE-Kennzeichnung, technische Dokumentation) sind nicht enthalten. Welche Pflichten gelten, bestimmt das KI-Register.'
            : 'Die Pflichten nach NIS2 und BSI-Gesetz und womit sie erfüllt werden: ISO-27001-Controls, IT-Grundschutz-Bausteine, Maßnahmen. Gezählt werden nur Pflichten der Einrichtung, nicht die Artikel an Mitgliedstaaten.'
        }
        actions={
          <select
            className="input w-auto"
            value={framework}
            onChange={(e) => setParams({ framework: e.target.value, view })}
            aria-label="Regelwerk"
          >
            {COCKPITS.map((c) => (
              <option key={c.key} value={c.key} disabled={frameworks.data && !active.has(c.key)}>
                {c.label}
                {frameworks.data && !active.has(c.key) ? ' — nicht aktiviert' : ''}
              </option>
            ))}
          </select>
        }
      />

      {frameworks.data && !active.has(framework) ? (
        <EmptyState
          title="Dieses Regelwerk ist nicht aktiviert"
          hint="Unter Einstellungen → Regelwerke lässt es sich aktivieren."
        />
      ) : (
        <>
          <div className="tabs">
            {(
              [
                ['table', 'Tabelle'],
                ['flow', 'Flussdiagramm'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={clsx('tab', view === key && 'tab-active')}
                onClick={() => setParams({ framework, view: key })}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'flow' ? <FlowView framework={framework} /> : <TableView framework={framework} />}
        </>
      )}
    </>
  );
}

function TableView({ framework }: { framework: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ['coverage-map', framework],
    queryFn: () => api<{ rows: Row[] }>(`/coverage-map?framework=${framework}`),
  });
  const adopt = useMutation({
    mutationFn: (v: { measureId: string; requirementId: string }) =>
      api(`/measures/${v.measureId}/requirements`, {
        method: 'POST',
        body: JSON.stringify({ requirementId: v.requirementId, coverage: 'partial', fromCrosswalk: true }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coverage-map'] });
      void qc.invalidateQueries({ queryKey: ['coverage'] });
      void qc.invalidateQueries({ queryKey: ['soa'] });
    },
  });

  if (data.isLoading) return <Spinner />;
  const rows = data.data?.rows ?? [];
  if (!rows.length)
    return framework === 'EU_AI_ACT' ? (
      <EmptyState
        title="Noch keine Betreiberpflicht ausgelöst"
        hint="Pflichten entstehen erst durch ein KI-System im Register. Erfassen Sie die Systeme, die Sie einsetzen."
        action={
          <Link to="/ai" className="btn-primary">
            Zum KI-Register
          </Link>
        }
      />
    ) : (
      <EmptyState title="Keine Pflichten im Umfang" />
    );

  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const columns: { key: string; label: string; match: (l: Link_) => boolean }[] = [
    { key: 'iso', label: 'ISO 27001', match: (l) => l.framework === 'ISO27001' },
    { key: 'bsi', label: 'IT-Grundschutz', match: (l) => l.framework === 'BSI_GS' },
    {
      key: 'other',
      label: 'Weitere Regelwerke',
      match: (l) => !['ISO27001', 'BSI_GS'].includes(l.framework),
    },
  ];

  return (
    <>
      <ErrorNote error={data.error ?? adopt.error} />
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Erfüllt" value={count('covered')} tone="good" />
        <StatTile
          label="Indirekt abgedeckt"
          value={count('indirect')}
          hint="nur die Zuordnung fehlt"
          tone={count('indirect') ? 'warn' : 'neutral'}
        />
        <StatTile label="In Arbeit" value={count('in_progress')} />
        <StatTile label="Offen" value={count('open')} tone={count('open') ? 'bad' : 'good'} />
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="th w-[30%]">Pflicht</th>
              {columns.map((c) => (
                <th key={c.key} className="th">
                  {c.label}
                </th>
              ))}
              <th className="th w-24">Maßnahmen</th>
              <th className="th w-36">
                <span className="flex items-center gap-1.5">
                  Stand
                  <NormHint refs="iso:6.1.3" note="Erfüllt, in Arbeit, indirekt abgedeckt oder offen." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr
                  className="cursor-pointer align-top hover:bg-slate-50"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  <td className="td">
                    <p className="font-mono text-xs text-slate-600">
                      {r.refCode}
                      {r.altRef && <span className="ml-1.5 font-sans text-slate-500">· {r.altRef}</span>}
                    </p>
                    <p className="text-sm text-slate-800">{r.title}</p>
                    {r.hint && (
                      <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900">
                        {r.hint}
                      </p>
                    )}
                    {r.appliesFrom && r.appliesFrom > new Date().toISOString().slice(0, 10) && (
                      <p className="text-[11px] font-medium text-amber-700">
                        gilt ab {new Date(r.appliesFrom).toLocaleDateString('de-DE')}
                      </p>
                    )}
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className="td">
                      <div className="flex flex-wrap gap-1">
                        {r.links.filter(c.match).map((l) => (
                          <LinkChip key={l.requirementId} link={l} withFramework={c.key === 'other'} />
                        ))}
                        {!r.links.some(c.match) && <span className="text-xs text-slate-300">—</span>}
                      </div>
                    </td>
                  ))}
                  <td className="td text-xs tabular-nums text-slate-600">{r.measures.length || '—'}</td>
                  <td className="td">
                    <StatusPill status={r.status} />
                  </td>
                </tr>
                {open === r.id && (
                  <tr className="bg-slate-50/70">
                    <td className="td" colSpan={columns.length + 3}>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Direkt zugeordnete Maßnahmen
                          </h4>
                          {r.measures.length === 0 ? (
                            <p className="text-sm text-slate-500">Keine.</p>
                          ) : (
                            <ul className="space-y-1">
                              {r.measures.map((m) => (
                                <li key={m.id} className="flex items-center gap-2 text-sm">
                                  <span className="font-mono text-xs text-slate-500">{m.refNo}</span>
                                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                                  <StatusBadge status={m.status} />
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-2 text-xs text-slate-500">{STATUS_HINT[r.status]}</p>
                        </div>
                        <div>
                          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Umgesetzt über verknüpfte Anforderungen
                          </h4>
                          {r.indirectMeasures.length === 0 ? (
                            <p className="text-sm text-slate-500">Keine.</p>
                          ) : (
                            <ul className="space-y-1">
                              {r.indirectMeasures.map((m) => (
                                <li key={m.id} className="flex items-center gap-2 text-sm">
                                  <span className="font-mono text-xs text-slate-500">{m.refNo}</span>
                                  <span className="min-w-0 flex-1 truncate">
                                    {m.title}
                                    <span className="ml-1 text-xs text-slate-500">
                                      über {FW_LABEL[m.viaFramework] ?? m.viaFramework} {m.viaRefCode}
                                    </span>
                                  </span>
                                  {can('measure.write') && (
                                    <button
                                      type="button"
                                      className="btn-ghost py-0.5 text-xs"
                                      disabled={adopt.isPending}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        adopt.mutate({ measureId: m.id, requirementId: r.id });
                                      }}
                                    >
                                      Zuordnung übernehmen
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Verknüpfungen: ISO 27001 nach eigener, kuratierter Zuordnung; IT-Grundschutz nur für modellierte
        Bausteine, Zahl = umgesetzte von zählenden Anforderungen des Bausteins. Ein Klick auf eine Zeile
        zeigt, womit die Pflicht erfüllt wird.
      </p>
    </>
  );
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className="badge text-white"
      style={{ backgroundColor: COVERAGE_COLOR[status] }}
      title={STATUS_HINT[status]}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function LinkChip({ link: l, withFramework }: { link: Link_; withFramework: boolean }) {
  const done = l.isGroup ? l.total > 0 && l.implemented >= l.total : l.implemented > 0;
  const part = l.isGroup && l.implemented > 0 && !done;
  return (
    <span
      title={`${l.title}${l.isGroup ? ` — ${l.implemented} von ${l.total} Anforderungen umgesetzt` : ''}`}
      className={clsx(
        'rounded border px-1.5 py-0.5 font-mono text-[11px]',
        done && 'border-emerald-200 bg-emerald-50 text-emerald-800',
        part && 'border-amber-200 bg-amber-50 text-amber-900',
        !done && !part && 'border-slate-200 bg-white text-slate-500',
      )}
    >
      {withFramework && <span className="font-sans">{FW_LABEL[l.framework] ?? l.framework} </span>}
      {l.refCode}
      {l.isGroup && (
        <span className="ml-1 font-sans tabular-nums">
          {l.implemented}/{l.total}
        </span>
      )}
    </span>
  );
}

// --- Flussdiagramm -------------------------------------------------------------------------

const LAYER_TITLE = ['Pflicht', 'ISO 27001 und weitere Regelwerke', 'IT-Grundschutz-Baustein'];
const ROW = 22;
const WIDTH = 1000;
const COL_X = [190, 470, 760];
const NODE_W = 8;

/**
 * Eigenes SVG statt eines Sankey-Diagramms: Sankey schiebt jede Anforderung ohne weitere
 * Verbindung in die letzte Spalte, und dann stünde ein ISO-Control zwischen den Bausteinen. Hier
 * hat jede Ebene ihre feste Spalte; die mittlere und rechte sind nach dem Mittel ihrer Vorgänger
 * sortiert, damit sich möglichst wenige Linien kreuzen.
 */
function FlowView({ framework }: { framework: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const flow = useQuery({
    queryKey: ['coverage-flow', framework],
    queryFn: () => api<Flow>(`/coverage-map/flow?framework=${framework}`),
  });
  if (flow.isLoading) return <Spinner />;
  const f = flow.data;
  if (!f || !f.nodes.length) return <EmptyState title="Keine Verbindungen" />;

  const byLayer = [0, 1, 2].map((k) => f.nodes.filter((n) => n.layer === k));
  const pos = new Map<string, number>();
  byLayer[0]!.forEach((n, i) => pos.set(n.id, i));
  for (const k of [1, 2]) {
    const avg = (id: string) => {
      const ps = f.links.filter((l) => l.target === id && pos.has(l.source)).map((l) => pos.get(l.source)!);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.MAX_SAFE_INTEGER;
    };
    byLayer[k]!.sort((a, b) => avg(a.id) - avg(b.id));
    // Position als Rang speichern, damit die nächste Ebene daran sortiert
    byLayer[k]!.forEach((n, i) => pos.set(n.id, i));
  }
  const rows = Math.max(...byLayer.map((l) => l.length));
  const height = rows * ROW + 16;
  // Jede Spalte über die volle Höhe verteilen — kurze Spalten stehen sonst gedrängt am oberen Rand.
  const y = (n: Flow['nodes'][number]) => {
    const count = byLayer[n.layer]!.length;
    const step = count > 1 ? (rows - 1) / (count - 1) : 0;
    return 8 + (count > 1 ? pos.get(n.id)! * step : (rows - 1) / 2) * ROW + ROW / 2;
  };
  const node = new Map(f.nodes.map((n) => [n.id, n]));
  const connected = (id: string) =>
    new Set(f.links.filter((l) => l.source === id || l.target === id).flatMap((l) => [l.source, l.target]));
  const lit = hover ? connected(hover) : null;
  const label = (n: Flow['nodes'][number]) =>
    n.layer === 1 && n.framework !== 'ISO27001'
      ? `${FW_LABEL[n.framework] ?? n.framework} ${n.name}`
      : n.name;

  return (
    <section className="card p-4">
      <ErrorNote error={flow.error} />
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${height + 24}`}
          className="w-full min-w-[760px]"
          role="img"
          aria-label="Verknüpfung der Pflichten mit ISO 27001 und IT-Grundschutz"
        >
          {LAYER_TITLE.map((t, i) => (
            <text
              key={t}
              x={COL_X[i]! + (i === 0 ? 0 : NODE_W)}
              y={12}
              textAnchor={i === 0 ? 'end' : 'start'}
              fontSize={11}
              fontWeight={600}
              fill="#64748b"
            >
              {t.toUpperCase()}
            </text>
          ))}
          <g transform="translate(0 24)">
            {f.links.map((l) => {
              const a = node.get(l.source);
              const b = node.get(l.target);
              if (!a || !b) return null;
              const x0 = COL_X[a.layer]! + NODE_W;
              const x1 = COL_X[b.layer]!;
              const y0 = y(a);
              const y1 = y(b);
              const mid = (x0 + x1) / 2;
              const on =
                !lit ||
                (lit.has(l.source) && lit.has(l.target) && (l.source === hover || l.target === hover));
              return (
                <path
                  key={`${l.source}-${l.target}`}
                  d={`M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1}`}
                  fill="none"
                  stroke={on && hover ? (COVERAGE_COLOR[a.status] ?? '#94a3b8') : '#cbd5e1'}
                  strokeOpacity={on ? (hover ? 0.9 : 0.6) : 0.12}
                  strokeWidth={on && hover ? 2 : 1.2}
                />
              );
            })}
            {f.nodes.map((n) => {
              const cy = y(n);
              const dim = lit && !lit.has(n.id);
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  opacity={dim ? 0.25 : 1}
                  className="cursor-default"
                >
                  <rect
                    x={COL_X[n.layer]}
                    y={cy - 7}
                    width={NODE_W}
                    height={14}
                    rx={2}
                    fill={COVERAGE_COLOR[n.status] ?? COVERAGE_COLOR.linked}
                  />
                  <text
                    x={n.layer === 0 ? COL_X[0]! - 6 : COL_X[n.layer]! + NODE_W + 6}
                    y={cy}
                    dominantBaseline="middle"
                    textAnchor={n.layer === 0 ? 'end' : 'start'}
                    fontSize={11}
                    fill="#334155"
                    fontWeight={hover === n.id ? 600 : 400}
                  >
                    {label(n)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {(['covered', 'in_progress', 'indirect', 'open'] as Status[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COVERAGE_COLOR[s] }}
            />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-400" />
          Baustein nur über ISO verknüpft
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Mit der Maus auf einen Eintrag zeigen, um seine Verbindungen hervorzuheben. Für Besprechungen und
        Präsentationen gedacht — zum Arbeiten ist die Tabelle besser, dort lässt sich jede Verbindung bis zur
        Maßnahme verfolgen.
      </p>
    </section>
  );
}
