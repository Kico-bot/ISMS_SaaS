import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExportButtons } from '../components/ExportButtons';
import { ErrorNote, FrameworkChip, NormHint, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { BSI_CHECK_LABEL, PROTECTION_VARIANT_LABEL, REQUIREMENT_LEVEL_LABEL } from '../lib/labels';

interface SoaRow {
  requirementId: string;
  refCode: string;
  title: string;
  kind: string;
  level: string | null;
  /** Nationale Fundstelle, z. B. „§ 30 Abs. 2 Nr. 10 BSIG“. */
  altRef: string | null;
  hint: string | null;
  /** Ab wann die Pflicht gilt (AI Act gestaffelt). */
  appliesFrom: string | null;
  groupRefCode: string;
  groupTitle: string;
  applicability: 'applicable' | 'not_applicable';
  justification: string | null;
  maturity: number | null;
  targetMaturity: number | null;
  measureCount: number;
  implementedCount: number;
  checkStatus: string;
  measures: { id: string; refNo: string; title: string; status: string; coverage: string }[];
}

interface Framework {
  key: string;
  name: string;
  isActive: boolean;
  isPrimary: boolean;
  /** Katalog mit Bausteinen (IT-Grundschutz): Modellierung + Check statt Anwendbarkeitserklärung. */
  modular: boolean;
  inScopeCount: number;
}

/**
 * Anforderungen je Regelwerk. ISO 27001 verlangt eine Anwendbarkeitserklärung (Kap. 6.1.3 d);
 * IT-Grundschutz kennt keine, sondern Modellierung und IT-Grundschutz-Check (BSI 200-2). Die Seite
 * zeigt deshalb je nach Katalog das eine oder das andere — dieselben Daten, die passende Sicht.
 */
export function SoaPage() {
  const [params, setParams] = useSearchParams();
  const framework = params.get('framework') ?? 'ISO27001';
  const frameworks = useQuery({ queryKey: ['frameworks'], queryFn: () => api<Framework[]>('/frameworks') });
  const fw = frameworks.data?.find((f) => f.key === framework);
  const modular = fw?.modular ?? false;
  const view = params.get('view') ?? (modular && fw?.inScopeCount === 0 ? 'modeling' : 'check');

  return (
    <>
      <PageHeader
        eyebrow="Anforderungen & Maßnahmen"
        title={modular ? 'IT-Grundschutz: Modellierung und Check' : 'Anforderungen & Anwendbarkeitserklärung'}
        norm={modular ? 'bsi:200-2' : ['iso:6.1.3', 'iso:5.2']}
        description={
          modular
            ? 'Legen Sie zuerst fest, welche Bausteine für Sie gelten. Dann zeigt der Check nur deren Anforderungen. Eine Erklärung zur Anwendbarkeit verlangt IT-Grundschutz nicht.'
            : 'Je Anforderung: gilt sie für uns, wie reif sind wir, und welche Maßnahmen erfüllen sie. Eine Maßnahme kann auf mehrere Normen zugleich einzahlen.'
        }
        actions={
          <>
            <select
              className="input w-auto"
              value={framework}
              onChange={(e) => setParams({ framework: e.target.value })}
              aria-label="Regelwerk"
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
              label={modular ? 'IT-Grundschutz-Check' : 'Anwendbarkeitserklärung'}
            />
          </>
        }
      />

      {modular && (
        <div className="tabs">
          {(
            [
              ['modeling', 'Modellierung'],
              ['check', 'IT-Grundschutz-Check'],
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
      )}

      {modular && view === 'modeling' ? (
        <Modeling framework={framework} />
      ) : (
        <RequirementTable framework={framework} mode={modular ? 'check' : 'soa'} />
      )}

      <p className="mt-6 text-xs text-slate-500">
        <FrameworkChip k={framework} /> Für ISO/IEC 27001 werden aus Lizenzgründen nur Referenz und Kurztitel
        gespeichert. Den Normtext erhalten Sie beim Herausgeber.
      </p>
    </>
  );
}

// --- Anwendbarkeitserklärung bzw. IT-Grundschutz-Check ------------------------------------

const CHECK_STYLE: Record<string, string> = {
  yes: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-900',
  no: 'bg-slate-100 text-slate-700',
  dispensable: 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200',
};

function RequirementTable({ framework, mode }: { framework: string; mode: 'soa' | 'check' }) {
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { can } = useAuth();
  const qc = useQueryClient();
  const check = mode === 'check';

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

  // Im Check heißt „nicht anwendbar“ „entbehrlich“ — gemeint ist dasselbe, begründet ist beides.
  const yes = check ? 'Erforderlich' : 'Anwendbar';
  const no = check ? 'Entbehrlich' : 'Nicht anwendbar';

  return (
    <>
      <ErrorNote error={soa.error ?? save.error} />

      <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={onlyOpen}
          onChange={(e) => setOnlyOpen(e.target.checked)}
          className="rounded border-slate-300"
        />
        Nur offene Anforderungen ({yes.toLowerCase()}, keine umgesetzte Maßnahme)
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
                        {check && (
                          <th className="th w-28">
                            <span className="flex items-center gap-1.5">
                              Umsetzung
                              <NormHint
                                refs="bsi:200-2"
                                note="Ergibt sich aus den zugeordneten Maßnahmen: ja = umgesetzt und vollständig abgedeckt, teilweise = umgesetzt, aber nur zum Teil abgedeckt."
                              />
                            </span>
                          </th>
                        )}
                        <th className="th w-40">
                          <span className="flex items-center gap-1.5">
                            {check ? 'Erforderlich?' : 'Anwendbar'}
                            <NormHint refs={check ? 'bsi:200-2' : 'iso:6.1.3'} />
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
                            <NormHint refs={check ? 'bsi:200-2' : 'iso:6.1.3'} />
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
                                <span className="block font-sans text-[10px] text-slate-400">
                                  {REQUIREMENT_LEVEL_LABEL[r.level] ?? r.level}
                                </span>
                              )}
                              {r.altRef && (
                                <span className="block font-sans text-[10px] text-slate-500">{r.altRef}</span>
                              )}
                              {r.appliesFrom && r.appliesFrom > new Date().toISOString().slice(0, 10) && (
                                <span className="mt-0.5 block font-sans text-[10px] font-medium text-amber-700">
                                  gilt ab {new Date(r.appliesFrom).toLocaleDateString('de-DE')}
                                </span>
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
                            {check && (
                              <td className="td">
                                <span className={clsx('badge', CHECK_STYLE[r.checkStatus])}>
                                  {BSI_CHECK_LABEL[r.checkStatus] ?? r.checkStatus}
                                </span>
                              </td>
                            )}
                            <td className="td">
                              {can('soa.write') ? (
                                <select
                                  className="input py-1 text-xs"
                                  value={r.applicability}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === 'not_applicable') {
                                      const justification = window.prompt(
                                        check
                                          ? 'Begründung, warum diese Anforderung entbehrlich ist:'
                                          : 'Begründung, warum diese Anforderung nicht anwendbar ist:',
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
                                  <option value="applicable">{yes}</option>
                                  <option value="not_applicable">{no}</option>
                                </select>
                              ) : (
                                <span className="text-xs">{r.applicability === 'applicable' ? yes : no}</span>
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
                              <td className="td" colSpan={check ? 5 : 4}>
                                {r.hint && (
                                  <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                                    {r.hint}
                                  </p>
                                )}
                                {r.justification && (
                                  <p className="mb-2 text-xs text-slate-600">
                                    <span className="font-medium">Begründung:</span> {r.justification}
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
            <p className="py-8 text-center text-sm text-slate-500">
              {check && !onlyOpen
                ? 'Noch keine Bausteine ausgewählt. Im Reiter „Modellierung“ legen Sie fest, welche für Sie gelten.'
                : 'Keine Anforderungen für diesen Filter.'}
            </p>
          )}
        </div>
      )}
    </>
  );
}

// --- Modellierung -----------------------------------------------------------------------

interface ModuleRow {
  id: string;
  refCode: string;
  title: string;
  layerRefCode: string;
  layerTitle: string;
  modeled: boolean;
  elevated: boolean;
  note: string | null;
  basisCount: number;
  standardCount: number;
  elevatedCount: number;
}

interface ModelingData {
  protectionVariant: 'basis' | 'standard' | 'kern';
  inScopeCount: number;
  baselineRefCodes: string[];
  modules: ModuleRow[];
}

const VARIANT_HELP: Record<string, string> = {
  basis:
    'Einstieg: nur die Basis-Anforderungen, für alle Bausteine. Schnell, aber kein vollständiger Schutz.',
  standard: 'Der Normalfall: Basis- und Standard-Anforderungen. Grundlage einer Zertifizierung.',
  kern: 'Wie Standard, aber nur für die besonders wichtigen Teile, die „Kronjuwelen“.',
};

function Modeling({ framework }: { framework: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const writable = can('soa.write');
  const [filter, setFilter] = useState('');
  const [onlyModeled, setOnlyModeled] = useState(false);

  const data = useQuery({
    queryKey: ['modeling', framework],
    queryFn: () => api<ModelingData>(`/modeling?framework=${framework}`),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['modeling', framework] });
    void qc.invalidateQueries({ queryKey: ['soa', framework] });
    void qc.invalidateQueries({ queryKey: ['frameworks'] });
    void qc.invalidateQueries({ queryKey: ['coverage'] });
    void qc.invalidateQueries({ queryKey: ['requirements', framework] });
  };

  const variant = useMutation({
    mutationFn: (protectionVariant: string) =>
      api('/modeling/variant', { method: 'PATCH', body: JSON.stringify({ framework, protectionVariant }) }),
    onSuccess: refresh,
  });
  const model = useMutation({
    mutationFn: (v: { id: string; elevated: boolean; note?: string | null }) =>
      api(`/modeling/modules/${v.id}`, {
        method: 'PUT',
        body: JSON.stringify({ elevated: v.elevated, note: v.note }),
      }),
    onSuccess: refresh,
  });
  const unmodel = useMutation({
    mutationFn: (id: string) => api<void>(`/modeling/modules/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const baseline = useMutation({
    mutationFn: () => api(`/modeling/baseline?framework=${framework}`, { method: 'POST' }),
    onSuccess: refresh,
  });

  if (data.isLoading || !data.data) return <Spinner />;
  const d = data.data;
  const modeledCount = d.modules.filter((m) => m.modeled).length;
  const needle = filter.trim().toLowerCase();
  const visible = d.modules.filter(
    (m) =>
      (!onlyModeled || m.modeled) &&
      (!needle || m.refCode.toLowerCase().includes(needle) || m.title.toLowerCase().includes(needle)),
  );
  const layers = [...new Map(visible.map((m) => [m.layerRefCode, m.layerTitle])).entries()];
  const inCheck = (m: ModuleRow) =>
    m.basisCount +
    (d.protectionVariant === 'basis' ? 0 : m.standardCount) +
    (m.elevated ? m.elevatedCount : 0);

  return (
    <div className="space-y-6">
      <ErrorNote error={data.error ?? variant.error ?? model.error ?? unmodel.error ?? baseline.error} />

      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-800">
          1. Absicherungsvariante <NormHint refs="bsi:200-2" />
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['basis', 'standard', 'kern'] as const).map((v) => (
            <label
              key={v}
              className={clsx(
                'flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm',
                d.protectionVariant === v ? 'border-brand-500 bg-brand-50' : 'border-slate-200',
                !writable && 'cursor-default',
              )}
            >
              <span className="flex items-center gap-2 font-medium text-slate-800">
                <input
                  type="radio"
                  name="variant"
                  checked={d.protectionVariant === v}
                  disabled={!writable || variant.isPending}
                  onChange={() => variant.mutate(v)}
                />
                {PROTECTION_VARIANT_LABEL[v]}
              </span>
              <span className="text-xs text-slate-600">{VARIANT_HELP[v]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
              2. Bausteine wählen <NormHint refs="bsi:200-2" />
            </h2>
            <p className="text-xs text-slate-600">
              <span className="tabular-nums">{modeledCount}</span> von {d.modules.length} Bausteinen gewählt ·{' '}
              <span className="tabular-nums">{d.inScopeCount}</span> Anforderungen im Check
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-48 py-1 text-sm"
              placeholder="Suchen …"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Bausteine durchsuchen"
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={onlyModeled}
                onChange={(e) => setOnlyModeled(e.target.checked)}
                className="rounded border-slate-300"
              />
              nur gewählte
            </label>
            {writable && (
              <button
                type="button"
                className="btn-ghost py-1 text-xs"
                disabled={baseline.isPending}
                onClick={() => baseline.mutate()}
                title={d.baselineRefCodes.join(', ')}
              >
                Prozess-Bausteine übernehmen
              </button>
            )}
          </div>
        </header>
        {modeledCount === 0 && (
          <p className="border-b border-slate-200 bg-brand-50 px-4 py-2 text-xs text-brand-900">
            Tipp: „Prozess-Bausteine übernehmen“ wählt die {d.baselineRefCodes.length} Bausteine, die in der
            Regel für die ganze Organisation gelten (ISMS, Organisation, Konzepte, Betrieb, Detektion). Danach
            ergänzen Sie, was Sie tatsächlich betreiben: Server, Clients, Netze, Gebäude.
          </p>
        )}
        <div className="divide-y divide-slate-100">
          {layers.map(([layerRef, layerTitle]) => (
            <div key={layerRef}>
              <h3 className="bg-white px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {layerRef} · {layerTitle}
              </h3>
              <ul>
                {visible
                  .filter((m) => m.layerRefCode === layerRef)
                  .map((m) => (
                    <li
                      key={m.id}
                      className={clsx(
                        'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm',
                        m.modeled && 'bg-brand-50/40',
                      )}
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={m.modeled}
                          disabled={!writable}
                          onChange={(e) =>
                            e.target.checked
                              ? model.mutate({ id: m.id, elevated: false })
                              : unmodel.mutate(m.id)
                          }
                          className="rounded border-slate-300"
                        />
                        <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{m.refCode}</span>
                        <span className="truncate text-slate-800">{m.title}</span>
                      </label>
                      <span className="text-xs tabular-nums text-slate-500">
                        {m.modeled ? `${inCheck(m)} Anforderungen` : `${m.basisCount + m.standardCount}`}
                      </span>
                      {m.modeled && m.elevatedCount > 0 && (
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={m.elevated}
                            disabled={!writable}
                            onChange={(e) => model.mutate({ id: m.id, elevated: e.target.checked })}
                            className="rounded border-slate-300"
                          />
                          erhöhter Schutzbedarf (+{m.elevatedCount})
                        </label>
                      )}
                      {m.modeled && (
                        <input
                          className="input basis-full py-1 text-xs sm:ml-[6.5rem] sm:basis-auto sm:flex-1"
                          placeholder="Worauf angewandt? z. B. „alle Arbeitsplatzrechner der Verwaltung“"
                          defaultValue={m.note ?? ''}
                          disabled={!writable}
                          aria-label={`Zielobjekte für ${m.refCode}`}
                          onBlur={(e) => {
                            const note = e.target.value.trim() || null;
                            if (note !== (m.note ?? null))
                              model.mutate({ id: m.id, elevated: m.elevated, note });
                          }}
                        />
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">Kein Baustein passt zu diesem Filter.</p>
          )}
        </div>
      </section>
    </div>
  );
}
