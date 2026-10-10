import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import {
  ErrorNote,
  NormHint,
  OwnerSelect,
  PageHeader,
  RiskLevelBadge,
  Spinner,
  StatTile,
  StatusBadge,
} from '../components/ui';
import { ExportButtons } from '../components/ExportButtons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface RiskRow {
  id: string;
  refNo: string;
  title: string;
  status: string;
  treatment: string | null;
  likelihood: number | null;
  impact: number | null;
  score: number | null;
  level: string | null;
  ownerName: string | null;
  measureCount: number;
  acceptedAt: string | null;
}

interface MatrixCell {
  likelihood: number;
  impact: number;
  n: number;
  risks: { id: string; refNo: string; title: string }[];
}

interface Matrix {
  size: number;
  thresholds: { low: number; medium: number; high: number };
  likelihoodLabels: string[] | null;
  impactLabels: string[] | null;
  cells: MatrixCell[];
  byLevel: Record<string, number>;
}

function levelOf(score: number, t: Matrix['thresholds']): string {
  if (score <= t.low) return 'low';
  if (score <= t.medium) return 'medium';
  if (score <= t.high) return 'high';
  return 'critical';
}

/** Wenn der Mandant keine eigenen Stufen benannt hat — dieselben wie in packages/shared/src/risk.ts. */
const LIKELIHOOD_LABELS = ['Selten', 'Unwahrscheinlich', 'Möglich', 'Wahrscheinlich', 'Fast sicher'];
const IMPACT_LABELS = ['Vernachlässigbar', 'Gering', 'Moderat', 'Erheblich', 'Katastrophal'];

const CELL_BG: Record<string, string> = {
  low: 'bg-green-50',
  medium: 'bg-amber-50',
  high: 'bg-orange-100',
  critical: 'bg-red-100',
};

export function RisksPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['risks'],
    queryFn: () => api<{ items: RiskRow[]; total: number }>('/risks?size=200'),
  });
  const matrix = useQuery({ queryKey: ['risk-matrix'], queryFn: () => api<Matrix>('/risks/matrix') });

  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<RiskRow>('/risks', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['risks'] });
      setCreating(false);
      setSelected(r.id);
    },
  });

  const m = matrix.data;

  return (
    <>
      <PageHeader
        eyebrow="Risiken"
        title="Risikoregister"
        norm={['iso:6.1.2', 'iso:8.2', 'bsi:200-3']}
        description="Jedes Risiko hat eine Bewertung: wie es heute steht, mit den Maßnahmen, die bereits wirken. Ist eine neue Maßnahme umgesetzt, bewerten Sie neu — die Historie zeigt, was sie gebracht hat."
        actions={
          <>
            <ExportButtons csvPath="/exports/risks.csv" label="Risikoregister" />
            {can('risk.write') && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                Risiko erfassen
              </button>
            )}
          </>
        }
      />
      <ErrorNote error={list.error ?? matrix.error ?? create.error} />

      {m && (
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Kritisch"
            value={m.byLevel.critical ?? 0}
            tone={(m.byLevel.critical ?? 0) > 0 ? 'bad' : 'neutral'}
          />
          <StatTile
            label="Hoch"
            value={m.byLevel.high ?? 0}
            tone={(m.byLevel.high ?? 0) > 0 ? 'warn' : 'neutral'}
          />
          <StatTile label="Mittel" value={m.byLevel.medium ?? 0} />
          <StatTile label="Niedrig" value={m.byLevel.low ?? 0} tone="good" />
        </section>
      )}

      {creating && (
        <form
          className="card mb-4 flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const title = String(f.get('title') ?? '').trim();
            if (title.length >= 3)
              create.mutate({ title, ownerPersonId: String(f.get('ownerPersonId') || '') || null });
          }}
        >
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="new-risk">
              Risiko
              <NormHint refs="iso:6.1.2" />
            </label>
            <input
              id="new-risk"
              name="title"
              required
              minLength={3}
              className="input"
              placeholder="z. B. Ransomware auf Produktionsservern"
              autoFocus
            />
          </div>
          <div className="w-56">
            <OwnerSelect id="new-risk-owner" label="Risk-Owner" />
          </div>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            Erfassen
          </button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
            Abbrechen
          </button>
        </form>
      )}

      {m && (
        <section className="card mb-6 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            Risikomatrix — Stand heute <NormHint refs={['iso:6.1.2', 'bsi:200-3']} />
          </h2>
          <div className="flex items-stretch gap-2 overflow-x-auto">
            <span className="flex items-center text-[11px] font-medium text-slate-500 [writing-mode:vertical-rl] rotate-180">
              Wie schlimm wäre es? →
            </span>
            <table className="border-separate border-spacing-1">
              <tbody>
                {[5, 4, 3, 2, 1].map((impact) => (
                  <tr key={impact}>
                    <th scope="row" className="w-24 pr-2 text-right text-[11px] font-normal text-slate-500">
                      {m.impactLabels?.[impact - 1] ?? IMPACT_LABELS[impact - 1]}
                    </th>
                    {[1, 2, 3, 4, 5].map((likelihood) => {
                      const cell = m.cells.find((c) => c.likelihood === likelihood && c.impact === impact);
                      const lvl = levelOf(likelihood * impact, m.thresholds);
                      return (
                        <td
                          key={likelihood}
                          className={clsx(
                            'h-14 w-20 rounded border border-slate-200 text-center align-middle',
                            CELL_BG[lvl],
                          )}
                          title={
                            cell?.risks.map((r) => `${r.refNo} ${r.title}`).join('\n') ??
                            `Score ${likelihood * impact}`
                          }
                        >
                          {cell ? (
                            <span className="text-sm font-semibold tabular-nums text-slate-800">
                              {cell.n}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td />
                  {[1, 2, 3, 4, 5].map((l) => (
                    <th key={l} scope="col" className="pt-1 text-[11px] font-normal text-slate-500">
                      {m.likelihoodLabels?.[l - 1] ?? LIKELIHOOD_LABELS[l - 1]}
                    </th>
                  ))}
                </tr>
                <tr>
                  <td />
                  <td colSpan={5} className="pt-1 text-center text-[11px] font-medium text-slate-500">
                    Wie wahrscheinlich ist es? →
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-24">Nr.</th>
                <th className="th">Risiko</th>
                <th className="th w-32">Status</th>
                <th className="th w-36">Risiko heute</th>
                <th className="th w-28">Maßnahmen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data?.items.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(r.id)}>
                  <td className="td font-mono text-xs text-slate-600">{r.refNo}</td>
                  <td className="td">
                    <span className="font-medium text-slate-800">{r.title}</span>
                    {r.acceptedAt && <span className="ml-2 text-xs text-emerald-700">bewusst getragen</span>}
                  </td>
                  <td className="td">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="td">
                    <RiskLevelBadge level={r.level} score={r.score} />
                  </td>
                  <td className="td tabular-nums text-slate-600">{r.measureCount}</td>
                </tr>
              ))}
              {list.data?.items.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-slate-500" colSpan={5}>
                    Noch keine Risiken erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && <RiskDetail id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

interface RiskDetailData extends RiskRow {
  description: string | null;
  acceptanceRationale: string | null;
  acceptedUntil: string | null;
  measures: { id: string; refNo: string; title: string; status: string }[];
  assets: { id: string; refNo: string; name: string }[];
  history: {
    id: string;
    likelihood: number;
    impact: number;
    score: number;
    assessedAt: string;
    note: string | null;
  }[];
}

function RiskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['risk', id], queryFn: () => api<RiskDetailData>(`/risks/${id}`) });
  const matrix = useQuery({ queryKey: ['risk-matrix'], queryFn: () => api<Matrix>('/risks/matrix') });
  const likelihoodLabels = matrix.data?.likelihoodLabels ?? LIKELIHOOD_LABELS;
  const impactLabels = matrix.data?.impactLabels ?? IMPACT_LABELS;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['risk', id] });
    void qc.invalidateQueries({ queryKey: ['risks'] });
    void qc.invalidateQueries({ queryKey: ['risk-matrix'] });
    void qc.invalidateQueries({ queryKey: ['summary'] });
  };

  const assess = useMutation({
    mutationFn: (v: { likelihood: number; impact: number; note: string | null }) =>
      api(`/risks/${id}/assessments`, { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: invalidate,
  });
  const accept = useMutation({
    mutationFn: (v: { validUntil: string; rationale: string }) =>
      api(`/risks/${id}/accept`, { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: invalidate,
  });

  const d = detail.data;

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Risiko bearbeiten"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-slate-500">{d.refNo}</p>
                <h2 className="text-lg font-semibold text-slate-900">{d.title}</h2>
              </div>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Schließen
              </button>
            </div>

            <ErrorNote error={assess.error ?? accept.error} />

            <section className="mb-5 rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  Wie hoch ist das Risiko heute? <NormHint refs={['iso:6.1.2', 'bsi:200-3']} />
                </h3>
                <RiskLevelBadge level={d.level} score={d.score} />
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Bewerten Sie den Stand von heute — mit den Maßnahmen, die bereits umgesetzt sind, nicht mit
                den geplanten. Ist eine geplante Maßnahme umgesetzt, bewerten Sie neu.
              </p>
              {can('risk.write') && (
                <form
                  // neu aufbauen, sobald sich die gespeicherte Bewertung ändert
                  key={`${d.likelihood}-${d.impact}`}
                  className="grid gap-2 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    assess.mutate({
                      likelihood: Number(f.get('likelihood')),
                      impact: Number(f.get('impact')),
                      note: String(f.get('note') ?? '').trim() || null,
                    });
                  }}
                >
                  <div>
                    <label className="label" htmlFor="risk-l">
                      Wie wahrscheinlich ist es?
                      <NormHint refs="iso:6.1.2" />
                    </label>
                    <select id="risk-l" name="likelihood" className="input" defaultValue={d.likelihood ?? 3}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} – {likelihoodLabels[n - 1]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="risk-i">
                      Wie schlimm wäre es?
                      <NormHint refs="iso:6.1.2" />
                    </label>
                    <select id="risk-i" name="impact" className="input" defaultValue={d.impact ?? 3}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} – {impactLabels[n - 1]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="risk-note">
                      Was hat sich geändert? <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="risk-note"
                      name="note"
                      className="input"
                      placeholder="z. B. Datensicherung jetzt getrennt vom Netz"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button type="submit" className="btn-primary" disabled={assess.isPending}>
                      Bewertung speichern
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Behandlungsplan <NormHint refs="iso:6.1.3" />
              </h3>
              {d.measures.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Maßnahme verknüpft.</p>
              ) : (
                <ul className="space-y-1">
                  {d.measures.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-slate-500">{m.refNo}</span>
                      <span className="min-w-0 flex-1 truncate">{m.title}</span>
                      <StatusBadge status={m.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {d.acceptedAt ? (
              <section className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <h3 className="text-sm font-medium text-emerald-900 flex items-center gap-1.5">
                  Risiko wird bewusst getragen <NormHint refs={['iso:6.1.3', 'iso:8.3']} />
                </h3>
                <p className="mt-1 text-xs text-emerald-800">
                  Gültig bis {d.acceptedUntil} · {d.acceptanceRationale}
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Freigegeben für die Bewertung {d.likelihood} × {d.impact}. Ändert sich die Bewertung, muss
                  neu freigegeben werden.
                </p>
              </section>
            ) : (
              can('risk.accept') &&
              d.score != null && (
                <form
                  className="mb-4 space-y-2 rounded-md border border-slate-200 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    accept.mutate({
                      validUntil: String(f.get('validUntil')),
                      rationale: String(f.get('rationale')),
                    });
                  }}
                >
                  <h3 className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    Risiko bewusst tragen <NormHint refs={['iso:6.1.3', 'iso:8.3']} />
                  </h3>
                  <p className="text-xs text-slate-500">
                    Wenn weitere Maßnahmen mehr kosten, als sie bringen: Die Leitung bestätigt, dass das
                    Risiko in seiner heutigen Höhe getragen wird. Nicht durch den Risk-Owner selbst — das
                    prüft die Suite und die Datenbank.
                  </p>
                  <div>
                    <label className="label" htmlFor="validUntil">
                      Gültig bis
                      <NormHint refs="iso:8.3" />
                    </label>
                    <input id="validUntil" name="validUntil" type="date" required className="input w-auto" />
                  </div>
                  <div>
                    <label className="label" htmlFor="rationale">
                      Begründung
                      <NormHint refs="iso:8.3" />
                    </label>
                    <textarea
                      id="rationale"
                      name="rationale"
                      required
                      minLength={10}
                      rows={2}
                      className="input"
                    />
                  </div>
                  <button type="submit" className="btn-primary">
                    Freigeben
                  </button>
                </form>
              )
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Bisherige Bewertungen <NormHint refs="iso:6.1.2" />
              </h3>
              <ul className="space-y-1 text-xs text-slate-600">
                {d.history.map((h) => (
                  <li key={h.id} className="flex gap-2">
                    <span className="tabular-nums text-slate-400">
                      {new Date(h.assessedAt).toLocaleDateString('de-DE')}
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      {h.likelihood} × {h.impact} = {h.score}
                    </span>
                    {h.note && <span className="text-slate-500">· {h.note}</span>}
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
