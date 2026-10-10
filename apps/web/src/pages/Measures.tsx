import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ErrorNote,
  FrameworkChip,
  NormHint,
  OwnerSelect,
  PageHeader,
  Spinner,
  StatusBadge,
} from '../components/ui';
import { ExportButtons } from '../components/ExportButtons';
import { EvidenceSection } from '../components/EvidenceSection';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Link } from 'react-router-dom';

interface MeasureRow {
  id: string;
  refNo: string;
  title: string;
  status: string;
  domain: string | null;
  maturity: number | null;
  dueDate: string | null;
  ownerName: string | null;
  mappingCount: number;
  frameworks: string[];
}

interface Mapping {
  requirementId: string;
  framework: string;
  refCode: string;
  title: string;
  coverage: string;
  createdVia: string;
}

interface Suggestion {
  requirementId: string;
  framework: string;
  refCode: string;
  title: string;
  relation: string;
  isGroup: boolean;
}

interface Requirement {
  id: string;
  refCode: string;
  title: string;
  kind: string;
  /** IT-Grundschutz: nur Anforderungen modellierter Bausteine zählen. */
  inScope: boolean;
}

export function MeasuresPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['measures'],
    queryFn: () => api<{ items: MeasureRow[]; total: number }>('/measures?size=200'),
  });

  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<MeasureRow>('/measures', { method: 'POST', body: JSON.stringify({ ...dto, status: 'planned' }) }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ['measures'] });
      setCreating(false);
      setSelected(m.id);
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Anforderungen & Maßnahmen"
        title="Maßnahmen"
        norm={['iso:6.1.3', 'iso:8.3']}
        description="Eine Maßnahme, mehrere Normen: MFA erfüllt ISO A.5.17, IT-Grundschutz, NIS2 Art. 21 und DSGVO Art. 32 zugleich — einmal gepflegt, überall angerechnet."
        actions={
          <>
            <ExportButtons csvPath="/exports/measures.csv" label="Maßnahmenregister" />
            {can('measure.write') && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                Maßnahme anlegen
              </button>
            )}
          </>
        }
      />
      <ErrorNote error={list.error ?? create.error} />

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
            <label className="label" htmlFor="new-measure">
              Titel der Maßnahme
              <NormHint refs="iso:6.1.3" />
            </label>
            <input
              id="new-measure"
              name="title"
              required
              minLength={3}
              className="input"
              placeholder="z. B. MFA für alle Konten"
              autoFocus
            />
          </div>
          <div className="w-56">
            <OwnerSelect id="new-measure-owner" />
          </div>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            Anlegen
          </button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
            Abbrechen
          </button>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-24">Nr.</th>
                <th className="th">Maßnahme</th>
                <th className="th w-32">Status</th>
                <th className="th w-40">Verantwortlich</th>
                <th className="th w-64">Erfüllt Anforderungen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data?.items.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(m.id)}>
                  <td className="td font-mono text-xs text-slate-600">{m.refNo}</td>
                  <td className="td font-medium text-slate-800">{m.title}</td>
                  <td className="td">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="td text-slate-600">
                    {m.ownerName ?? <span className="text-slate-400">nicht zugewiesen</span>}
                  </td>
                  <td className="td">
                    {m.mappingCount === 0 ? (
                      <span className="text-xs text-slate-400">noch nicht zugeordnet</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1">
                        {m.frameworks.map((f) => (
                          <FrameworkChip key={f} k={f} />
                        ))}
                        <span className="text-xs tabular-nums text-slate-500">{m.mappingCount}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {list.data?.items.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-slate-500" colSpan={5}>
                    Noch keine Maßnahmen erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && <MeasureDetail id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function MeasureDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [framework, setFramework] = useState('ISO27001');
  const [pending, setPending] = useState<Suggestion[]>([]);

  const detail = useQuery({
    queryKey: ['measure', id],
    queryFn: () => api<MeasureRow & { mappings: Mapping[]; description: string | null }>(`/measures/${id}`),
  });
  const requirements = useQuery({
    queryKey: ['requirements', framework],
    queryFn: () => api<Requirement[]>(`/frameworks/${framework}/requirements`),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['measure', id] });
    void qc.invalidateQueries({ queryKey: ['measures'] });
    void qc.invalidateQueries({ queryKey: ['coverage'] });
    void qc.invalidateQueries({ queryKey: ['soa'] });
  };

  const map = useMutation({
    mutationFn: (v: { requirementId: string; fromCrosswalk?: boolean; coverage?: string }) =>
      api<{ suggestions: Suggestion[] }>(`/measures/${id}/requirements`, {
        method: 'POST',
        body: JSON.stringify({
          requirementId: v.requirementId,
          coverage: v.coverage ?? 'full',
          fromCrosswalk: v.fromCrosswalk ?? false,
        }),
      }),
    onSuccess: (res, v) => {
      invalidate();
      // Vorschläge nur beim manuellen Mappen zeigen, nicht beim Übernehmen eines Vorschlags.
      if (!v.fromCrosswalk) setPending(res.suggestions.filter((s) => !s.isGroup));
    },
  });

  const unmap = useMutation({
    mutationFn: (requirementId: string) =>
      api<void>(`/measures/${id}/requirements/${requirementId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      api(`/measures/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });

  const mappedIds = new Set(detail.data?.mappings.map((m) => m.requirementId));
  const options = (requirements.data ?? []).filter((r) => !mappedIds.has(r.id) && r.inScope);

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
        aria-label="Maßnahme bearbeiten"
      >
        {detail.isLoading || !detail.data ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-slate-500">{detail.data.refNo}</p>
                <h2 className="text-lg font-semibold text-slate-900">{detail.data.title}</h2>
              </div>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Schließen
              </button>
            </div>

            <ErrorNote error={map.error ?? unmap.error ?? setStatus.error} />

            <div className="mb-6">
              <label className="label" htmlFor="status">
                Status
                <NormHint refs={['iso:6.1.3', 'iso:9.1']} />
              </label>
              <select
                id="status"
                className="input w-auto"
                value={detail.data.status}
                disabled={!can('measure.write')}
                onChange={(e) => setStatus.mutate(e.target.value)}
              >
                <option value="planned">Geplant</option>
                <option value="in_progress">In Umsetzung</option>
                <option value="implemented">Umgesetzt</option>
                <option value="verified">Verifiziert</option>
                <option value="not_applicable">Nicht anwendbar</option>
              </select>
            </div>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Erfüllte Anforderungen <NormHint refs="iso:6.1.3" />
              </h3>
              {detail.data.mappings.length === 0 ? (
                <p className="mb-3 text-sm text-slate-500">
                  Noch keine Zuordnung. Ordnen Sie die Maßnahme einer Anforderung zu — passende Anforderungen
                  anderer aktiver Normen schlägt die Suite dann vor.
                </p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {detail.data.mappings.map((m) => (
                    <li
                      key={m.requirementId}
                      className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-sm"
                    >
                      <FrameworkChip k={m.framework} />
                      <span className="font-mono text-xs text-slate-600">{m.refCode}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-800">{m.title}</span>
                      {m.coverage === 'partial' && <span className="text-xs text-slate-400">teilweise</span>}
                      {m.createdVia === 'crosswalk' && (
                        <span className="text-xs text-brand-600">via Zuordnung</span>
                      )}
                      {can('measure.write') && (
                        <button
                          type="button"
                          onClick={() => unmap.mutate(m.requirementId)}
                          className="text-xs text-slate-400 hover:text-red-600"
                          aria-label="Zuordnung entfernen"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {can('measure.write') && (
                <div className="flex flex-wrap gap-2">
                  <select
                    className="input w-auto"
                    value={framework}
                    onChange={(e) => setFramework(e.target.value)}
                    aria-label="Norm"
                  >
                    <option value="ISO27001">ISO 27001</option>
                    <option value="BSI_GS">IT-Grundschutz</option>
                    <option value="NIS2">NIS2</option>
                    <option value="DSGVO">DSGVO</option>
                  </select>
                  <select
                    className="input min-w-64 flex-1"
                    value=""
                    onChange={(e) => e.target.value && map.mutate({ requirementId: e.target.value })}
                    aria-label="Anforderung zuordnen"
                  >
                    <option value="">Anforderung zuordnen …</option>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.refCode} — {r.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {can('measure.write') &&
                framework === 'BSI_GS' &&
                requirements.data &&
                options.length === 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Im IT-Grundschutz stehen nur Anforderungen modellierter Bausteine zur Auswahl. Bausteine
                    wählen Sie unter{' '}
                    <Link className="text-brand-700 underline" to="/soa?framework=BSI_GS&view=modeling">
                      Anforderungen → Modellierung
                    </Link>
                    .
                  </p>
                )}
            </section>

            <EvidenceSection anchorId={id} writable={can('measure.write')} />

            {pending.length > 0 && (
              <section className="rounded-md border border-brand-200 bg-brand-50 p-3">
                <h3 className="mb-1 text-sm font-medium text-brand-900 flex items-center gap-1.5">
                  Mit abgedeckt? <NormHint refs="iso:6.1.3" />
                </h3>
                <p className="mb-2 text-xs text-brand-800">
                  Laut BSI-Zuordnungstabelle und Crosswalk zahlt diese Anforderung auf folgende Anforderungen
                  Ihrer weiteren aktiven Normen ein. Übernehmen Sie, was zutrifft — Doppelpflege entfällt.
                </p>
                <ul className="space-y-1">
                  {pending.map((s) => (
                    <li key={s.requirementId} className="flex items-center gap-2 text-sm">
                      <FrameworkChip k={s.framework} />
                      <span className="font-mono text-xs text-slate-600">{s.refCode}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-800">{s.title}</span>
                      <button
                        type="button"
                        className="btn-ghost py-0.5 text-xs"
                        onClick={() => {
                          map.mutate({
                            requirementId: s.requirementId,
                            fromCrosswalk: true,
                            coverage: 'partial',
                          });
                          setPending((p) => p.filter((x) => x.requirementId !== s.requirementId));
                        }}
                      >
                        Übernehmen
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="mt-2 text-xs text-brand-700 underline"
                  onClick={() => setPending([])}
                >
                  Vorschläge ausblenden
                </button>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
