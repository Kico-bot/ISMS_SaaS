import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExportButtons } from '../components/ExportButtons';
import { ErrorNote, FrameworkChip, NormHint, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface SoaRow {
  requirementId: string;
  refCode: string;
  title: string;
  kind: string;
  level: string | null;
  groupRefCode: string;
  groupTitle: string;
  applicability: 'applicable' | 'not_applicable';
  justification: string | null;
  maturity: number | null;
  targetMaturity: number | null;
  measureCount: number;
  implementedCount: number;
  measures: { id: string; refNo: string; title: string; status: string; coverage: string }[];
}

interface Framework {
  key: string;
  name: string;
  isActive: boolean;
  isPrimary: boolean;
}

export function SoaPage() {
  const [params, setParams] = useSearchParams();
  const framework = params.get('framework') ?? 'ISO27001';
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { can } = useAuth();
  const qc = useQueryClient();

  const frameworks = useQuery({ queryKey: ['frameworks'], queryFn: () => api<Framework[]>('/frameworks') });
  const soa = useQuery({
    queryKey: ['soa', framework],
    queryFn: () => api<SoaRow[]>(`/soa?framework=${framework}`),
  });

  const save = useMutation({
    mutationFn: (v: { requirementId: string; body: Record<string, unknown> }) =>
      api(`/soa/${v.requirementId}`, { method: 'PATCH', body: JSON.stringify(v.body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['soa', framework] });
      void qc.invalidateQueries({ queryKey: ['coverage'] });
    },
  });

  const rows = (soa.data ?? []).filter(
    (r) => !onlyOpen || (r.applicability === 'applicable' && r.implementedCount === 0),
  );
  const groups = [...new Map(rows.map((r) => [r.groupRefCode, r.groupTitle])).entries()];

  return (
    <>
      <PageHeader
        eyebrow="Anforderungen & Maßnahmen"
        title="Anforderungen & Anwendbarkeitserklärung"
        norm={['iso:6.1.3', 'iso:5.2']}
        description="Je Anforderung: gilt sie für uns, wie reif sind wir, und welche Maßnahmen erfüllen sie. Eine Maßnahme kann auf mehrere Normen zugleich einzahlen."
        actions={
          <>
            <select
              className="input w-auto"
              value={framework}
              onChange={(e) => setParams({ framework: e.target.value })}
              aria-label="Framework"
            >
              {frameworks.data
                ?.filter((f) => f.isActive)
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
            </select>
            <ExportButtons
              csvPath={`/exports/soa.csv?framework=${framework}`}
              documentPath={`/exports/soa.html?framework=${framework}`}
              label="Anwendbarkeitserklärung"
            />
          </>
        }
      />
      <ErrorNote error={soa.error ?? save.error} />

      <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={onlyOpen}
          onChange={(e) => setOnlyOpen(e.target.checked)}
          className="rounded border-slate-300"
        />
        Nur offene Anforderungen (anwendbar, keine umgesetzte Maßnahme)
      </label>

      {soa.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          {groups.map(([groupRef, groupTitle]) => {
            const groupRows = rows.filter((r) => r.groupRefCode === groupRef);
            const covered = groupRows.filter((r) => r.implementedCount > 0).length;
            return (
              <section key={groupRef} className="card overflow-hidden">
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
                  <h2 className="text-sm font-medium text-slate-800">
                    <span className="tabular-nums text-slate-500">{groupRef}</span> {groupTitle}
                  </h2>
                  <span className="text-xs tabular-nums text-slate-500">
                    {covered} / {groupRows.length} abgedeckt
                  </span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px]">
                    <thead className="border-b border-slate-200">
                      <tr>
                        <th className="th w-28">Referenz</th>
                        <th className="th">Anforderung</th>
                        <th className="th w-40">
                          <span className="flex items-center gap-1.5">
                            Anwendbar
                            <NormHint refs="iso:6.1.3" />
                          </span>
                        </th>
                        <th className="th w-28">
                          <span className="flex items-center gap-1.5">
                            Reifegrad
                            <NormHint refs={['iso:9.1', 'bsi:200-2']} />
                          </span>
                        </th>
                        <th className="th w-44">
                          <span className="flex items-center gap-1.5">
                            Maßnahmen
                            <NormHint refs="iso:6.1.3" />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {groupRows.map((r) => (
                        <Fragment key={r.requirementId}>
                          <tr className="hover:bg-slate-50">
                            <td className="td font-mono text-xs text-slate-600">
                              {r.refCode}
                              {r.level && (
                                <span className="ml-1 text-[10px] uppercase text-slate-400">{r.level}</span>
                              )}
                            </td>
                            <td className="td">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpanded(expanded === r.requirementId ? null : r.requirementId)
                                }
                                className="text-left hover:underline"
                              >
                                {r.title}
                              </button>
                            </td>
                            <td className="td">
                              {can('soa.write') ? (
                                <select
                                  className="input py-1 text-xs"
                                  value={r.applicability}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === 'not_applicable') {
                                      const justification = window.prompt(
                                        'Begründung, warum diese Anforderung nicht anwendbar ist:',
                                      );
                                      if (!justification?.trim()) return;
                                      save.mutate({
                                        requirementId: r.requirementId,
                                        body: { applicability: value, justification },
                                      });
                                    } else {
                                      save.mutate({
                                        requirementId: r.requirementId,
                                        body: { applicability: value },
                                      });
                                    }
                                  }}
                                >
                                  <option value="applicable">Anwendbar</option>
                                  <option value="not_applicable">Nicht anwendbar</option>
                                </select>
                              ) : (
                                <span className="text-xs">
                                  {r.applicability === 'applicable' ? 'Anwendbar' : 'Nicht anwendbar'}
                                </span>
                              )}
                            </td>
                            <td className="td">
                              {can('soa.write') ? (
                                <select
                                  className="input py-1 text-xs"
                                  value={r.maturity ?? ''}
                                  onChange={(e) =>
                                    save.mutate({
                                      requirementId: r.requirementId,
                                      body: {
                                        maturity: e.target.value === '' ? null : Number(e.target.value),
                                      },
                                    })
                                  }
                                >
                                  <option value="">–</option>
                                  {[0, 1, 2, 3, 4, 5].map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="tabular-nums text-sm">{r.maturity ?? '–'}</span>
                              )}
                            </td>
                            <td className="td">
                              {r.measureCount === 0 ? (
                                <span className="text-xs text-slate-400">keine</span>
                              ) : (
                                <span className="text-xs tabular-nums text-slate-600">
                                  {r.implementedCount} / {r.measureCount} umgesetzt
                                </span>
                              )}
                            </td>
                          </tr>
                          {expanded === r.requirementId && (
                            <tr className="bg-slate-50/60">
                              <td className="td" />
                              <td className="td" colSpan={4}>
                                {r.justification && (
                                  <p className="mb-2 text-xs text-slate-600">
                                    <span className="font-medium">Begründung der Nichtanwendbarkeit:</span>{' '}
                                    {r.justification}
                                  </p>
                                )}
                                {r.measures.length === 0 ? (
                                  <p className="text-xs text-slate-500">Noch keine Maßnahme verknüpft.</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {r.measures.map((m) => (
                                      <li key={m.id} className="flex items-center gap-2 text-xs">
                                        <span className="font-mono text-slate-500">{m.refNo}</span>
                                        <span className="text-slate-800">{m.title}</span>
                                        <StatusBadge status={m.status} />
                                        {m.coverage === 'partial' && (
                                          <span className="text-slate-400">teilweise</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {rows.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">Keine Anforderungen für diesen Filter.</p>
          )}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-500">
        <FrameworkChip k={framework} /> Für ISO/IEC 27001 werden aus Lizenzgründen nur Referenz und Kurztitel
        gespeichert — der Normtext bleibt beim Herausgeber.
      </p>
    </>
  );
}
