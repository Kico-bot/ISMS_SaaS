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
import { ExportButtons } from '../components/ExportButtons';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface Finding {
  severity: 'error' | 'warning';
  message: string;
}

interface ActivityRow {
  id: string;
  name: string;
  purpose: string | null;
  role: string;
  legalBasis: string | null;
  specialCategories: boolean;
  thirdCountryTransfer: boolean;
  dpiaRequired: boolean;
  status: string;
  retention: string | null;
  ownerName: string | null;
  tomCount: number;
  assetCount: number;
  hasDpia: boolean;
  dpiaStatus: string | null;
  breachCount: number;
}

interface ActivityDetail extends Omit<
  ActivityRow,
  'tomCount' | 'assetCount' | 'hasDpia' | 'dpiaStatus' | 'breachCount'
> {
  legalBasisNote: string | null;
  dataSubjectCategories: string[];
  dataCategories: string[];
  recipients: string[];
  safeguards: string | null;
  ownerPersonId: string | null;
  toms: { id: string; refNo: string; title: string; status: string; domain: string | null }[];
  assets: { id: string; refNo: string; name: string; category: string; hasPii: boolean }[];
  breaches: { id: string; refNo: string; title: string; severity: string; detectedAt: string }[];
  dpia: { id: string; status: string; result: string | null; dpoConsultedAt: string | null } | null;
  findings: Finding[];
  dpiaSuggested: boolean;
  dpiaReasons: string[];
}

interface DpiaDetail {
  id: string;
  processingName: string;
  ownerName: string | null;
  status: string;
  result: string | null;
  descriptionOfProcessing: string | null;
  necessityAssessment: string | null;
  risks: {
    title: string;
    likelihood: number;
    impact: number;
    mitigation: string | null;
    score: number;
    high: boolean;
  }[];
  dpoOpinion: string | null;
  dpoName: string | null;
  dpoConsultedAt: string | null;
  findings: Finding[];
}

interface Summary {
  total: number;
  active: number;
  draft: number;
  specialCategories: number;
  thirdCountry: number;
  transferWithoutSafeguards: number;
  dpiaRequired: number;
  dpiaMissing: number;
  withoutToms: number;
}

interface MeasureOption {
  id: string;
  refNo: string;
  title: string;
  status: string;
}

const ROLE_LABEL: Record<string, string> = {
  controller: 'Verantwortlicher',
  processor: 'Auftragsverarbeiter',
  joint: 'Gemeinsam verantwortlich',
};
const LEGAL_BASIS_LABEL: Record<string, string> = {
  art6_1a: 'Art. 6 Abs. 1 lit. a — Einwilligung',
  art6_1b: 'Art. 6 Abs. 1 lit. b — Vertrag',
  art6_1c: 'Art. 6 Abs. 1 lit. c — rechtliche Verpflichtung',
  art6_1d: 'Art. 6 Abs. 1 lit. d — lebenswichtige Interessen',
  art6_1e: 'Art. 6 Abs. 1 lit. e — öffentliches Interesse',
  art6_1f: 'Art. 6 Abs. 1 lit. f — berechtigtes Interesse',
  art9_2a: 'Art. 9 Abs. 2 lit. a — ausdrückliche Einwilligung',
  art9_2b: 'Art. 9 Abs. 2 lit. b — Arbeitsrecht / Sozialrecht',
  art9_2h: 'Art. 9 Abs. 2 lit. h — Gesundheitsvorsorge',
  other: 'andere Grundlage',
};
const DPIA_RESULT_LABEL: Record<string, string> = {
  approved: 'zulässig',
  approved_with_measures: 'zulässig mit Maßnahmen',
  rejected: 'nicht zulässig',
};

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');
const list = (v: string[]) => (v.length ? v.join(', ') : '–');

export function PrivacyPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const list_ = useQuery({
    queryKey: ['processing'],
    queryFn: () => api<{ items: ActivityRow[] }>('/processing-activities?size=200'),
  });
  const summary = useQuery({
    queryKey: ['processing-summary'],
    queryFn: () => api<Summary>('/processing-activities/summary'),
  });

  const writable = can('privacy.write');
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['processing'] });
    void qc.invalidateQueries({ queryKey: ['processing-summary'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<{ id: string }>('/processing-activities', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (a) => {
      invalidate();
      setCreating(false);
      setOpenId(a.id);
    },
  });

  const rows = list_.data?.items ?? [];
  const s = summary.data;

  return (
    <>
      <PageHeader
        eyebrow="Datenschutz"
        title="Verarbeitungsverzeichnis"
        description="Das Verzeichnis nach Art. 30 DSGVO mit den technischen und organisatorischen Maßnahmen nach Art. 32 und der Folgenabschätzung nach Art. 35. Die TOM sind dieselben Maßnahmen wie im ISMS — keine zweite Liste daneben."
        actions={
          <>
            <ExportButtons
              csvPath="/exports/processing-activities.csv"
              documentPath="/exports/processing-activities.html"
              label="Verarbeitungsverzeichnis"
            />
            {writable && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                Verarbeitung erfassen
              </button>
            )}
          </>
        }
      />
      <ErrorNote error={list_.error ?? summary.error ?? create.error} />

      {s && (
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Verarbeitungen"
            value={s.total}
            hint={`${s.active} aktiv, ${s.draft} im Entwurf`}
          />
          <StatTile
            label="Drittland ohne Garantien"
            value={s.transferWithoutSafeguards}
            hint={`${s.thirdCountry} Übermittlungen gesamt`}
            tone={s.transferWithoutSafeguards > 0 ? 'bad' : 'good'}
          />
          <StatTile
            label="DSFA fehlt"
            value={s.dpiaMissing}
            hint={`${s.dpiaRequired} als pflichtig markiert`}
            tone={s.dpiaMissing > 0 ? 'bad' : 'good'}
          />
          <StatTile label="Ohne TOM" value={s.withoutToms} tone={s.withoutToms > 0 ? 'warn' : 'good'} />
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
              purpose: String(f.get('purpose') || '') || null,
              role: String(f.get('role')),
              ownerPersonId: String(f.get('ownerPersonId') || '') || null,
            });
          }}
        >
          <div className="lg:col-span-2">
            <label className="label" htmlFor="name">
              Verarbeitungstätigkeit
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={3}
              className="input"
              placeholder="Bewerbermanagement"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="role">
              Rolle
            </label>
            <select id="role" name="role" className="input" defaultValue="controller">
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <OwnerSelect label="Fachverantwortung" />
          <div className="lg:col-span-3">
            <label className="label" htmlFor="purpose">
              Zweck (Art. 30 Abs. 1 lit. b)
            </label>
            <input
              id="purpose"
              name="purpose"
              className="input"
              placeholder="Wozu werden die Daten verarbeitet?"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Erfassen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {list_.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch keine Verarbeitungstätigkeit erfasst"
          hint="Beginnen Sie mit den Verarbeitungen, die jedes Unternehmen hat: Beschäftigtendaten, Bewerbungen, Kundenstammdaten."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1020px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Verarbeitung</th>
                <th className="th w-40">Rolle</th>
                <th className="th w-56">Rechtsgrundlage</th>
                <th className="th w-32">Besonderheiten</th>
                <th className="th w-24">TOM</th>
                <th className="th w-32">DSFA</th>
                <th className="th w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(a.id)}>
                  <td className="td">
                    <span className="font-medium text-slate-800">{a.name}</span>
                    {a.purpose && <span className="ml-2 text-xs text-slate-500">{a.purpose}</span>}
                  </td>
                  <td className="td text-xs text-slate-600">{ROLE_LABEL[a.role] ?? a.role}</td>
                  <td className="td text-xs text-slate-600">
                    {a.legalBasis ? (
                      (LEGAL_BASIS_LABEL[a.legalBasis] ?? a.legalBasis)
                    ) : a.role === 'processor' ? (
                      // Art. 30 Abs. 2: der Auftragsverarbeiter führt sein Verzeichnis ohne eigene Grundlage.
                      <span className="text-slate-400">nicht erforderlich</span>
                    ) : (
                      <span className="text-level-critical">fehlt</span>
                    )}
                  </td>
                  <td className="td text-xs">
                    <span className="flex flex-wrap gap-1">
                      {a.specialCategories && (
                        <span className="badge bg-orange-100 text-orange-900">Art. 9</span>
                      )}
                      {a.thirdCountryTransfer && (
                        <span className="badge bg-amber-100 text-amber-900">Drittland</span>
                      )}
                      {a.breachCount > 0 && (
                        <span className="badge bg-red-100 text-red-800">{a.breachCount} Panne</span>
                      )}
                      {!a.specialCategories && !a.thirdCountryTransfer && a.breachCount === 0 && (
                        <span className="text-slate-400">–</span>
                      )}
                    </span>
                  </td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      a.tomCount === 0 ? 'text-level-medium' : 'text-slate-600',
                    )}
                  >
                    {a.tomCount || 'keine'}
                  </td>
                  <td className="td text-xs">
                    {a.hasDpia ? (
                      <StatusBadge status={a.dpiaStatus ?? 'draft'} />
                    ) : a.dpiaRequired ? (
                      <span className="text-level-critical">fehlt</span>
                    ) : (
                      <span className="text-slate-400">nicht nötig</span>
                    )}
                  </td>
                  <td className="td">
                    <StatusBadge status={a.status === 'retired' ? 'archived' : a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <ActivityPanel
          id={openId}
          writable={writable}
          onClose={() => setOpenId(null)}
          onChanged={invalidate}
        />
      )}
    </>
  );
}

function ActivityPanel({
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
  const [tab, setTab] = useState<'record' | 'dpia'>('record');
  const detail = useQuery({
    queryKey: ['processing', id],
    queryFn: () => api<ActivityDetail>(`/processing-activities/${id}`),
  });
  const measures = useQuery({
    queryKey: ['measures-lite'],
    queryFn: () => api<{ items: MeasureOption[] }>('/measures?size=200'),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['processing', id] });
    void qc.invalidateQueries({ queryKey: ['dpia', id] });
    onChanged();
  };
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/processing-activities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: refresh,
  });
  const linkTom = useMutation({
    mutationFn: (measureId: string) =>
      api(`/processing-activities/${id}/toms`, { method: 'POST', body: JSON.stringify({ measureId }) }),
    onSuccess: refresh,
  });
  const unlinkTom = useMutation({
    mutationFn: (measureId: string) =>
      api(`/processing-activities/${id}/toms/${measureId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const d = detail.data;
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
        aria-label="Verarbeitungstätigkeit"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-brand-600">
                  {ROLE_LABEL[d.role] ?? d.role}
                </p>
                <h2 className="text-lg font-semibold text-slate-900">{d.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {d.ownerName ? `Fachverantwortung: ${d.ownerName}` : 'Fachverantwortung offen'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status === 'retired' ? 'archived' : d.status} />
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Schließen
                </button>
              </div>
            </div>

            <ErrorNote error={update.error ?? linkTom.error ?? unlinkTom.error} />

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

            <div className="mb-4 flex gap-1 border-b border-slate-200">
              {(
                [
                  ['record', 'Verzeichniseintrag'],
                  ['dpia', 'Folgenabschätzung'],
                ] as ['record' | 'dpia', string][]
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

            {tab === 'record' ? (
              <>
                {writable ? (
                  <form
                    className="mb-6 grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const arr = (k: string) =>
                        String(f.get(k) || '')
                          .split(',')
                          .map((x) => x.trim())
                          .filter(Boolean);
                      update.mutate({
                        purpose: String(f.get('purpose') || '') || null,
                        legalBasis: String(f.get('legalBasis') || '') || null,
                        dataSubjectCategories: arr('dataSubjectCategories'),
                        dataCategories: arr('dataCategories'),
                        recipients: arr('recipients'),
                        specialCategories: f.get('specialCategories') === 'on',
                        thirdCountryTransfer: f.get('thirdCountryTransfer') === 'on',
                        safeguards: String(f.get('safeguards') || '') || null,
                        retention: String(f.get('retention') || '') || null,
                        dpiaRequired: f.get('dpiaRequired') === 'on',
                      });
                    }}
                  >
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="purpose">
                        Zweck (lit. b)
                      </label>
                      <input id="purpose" name="purpose" className="input" defaultValue={d.purpose ?? ''} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="legalBasis">
                        Rechtsgrundlage
                      </label>
                      <select
                        id="legalBasis"
                        name="legalBasis"
                        className="input"
                        defaultValue={d.legalBasis ?? ''}
                      >
                        <option value="">– keine –</option>
                        {Object.entries(LEGAL_BASIS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="dataSubjectCategories">
                        Betroffene (lit. c)
                      </label>
                      <input
                        id="dataSubjectCategories"
                        name="dataSubjectCategories"
                        className="input"
                        defaultValue={d.dataSubjectCategories.join(', ')}
                        placeholder="Beschäftigte, Bewerber"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="dataCategories">
                        Datenkategorien (lit. c)
                      </label>
                      <input
                        id="dataCategories"
                        name="dataCategories"
                        className="input"
                        defaultValue={d.dataCategories.join(', ')}
                        placeholder="Stammdaten, Entgeltdaten"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="recipients">
                        Empfänger (lit. d)
                      </label>
                      <input
                        id="recipients"
                        name="recipients"
                        className="input"
                        defaultValue={d.recipients.join(', ')}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="retention">
                        Löschfrist (lit. f)
                      </label>
                      <input
                        id="retention"
                        name="retention"
                        className="input"
                        defaultValue={d.retention ?? ''}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="safeguards">
                        Garantien bei Drittlandübermittlung (Kap. V)
                      </label>
                      <input
                        id="safeguards"
                        name="safeguards"
                        className="input"
                        defaultValue={d.safeguards ?? ''}
                        placeholder="Standardvertragsklauseln …"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          name="specialCategories"
                          defaultChecked={d.specialCategories}
                          className="rounded border-slate-300"
                        />
                        besondere Kategorien (Art. 9)
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          name="thirdCountryTransfer"
                          defaultChecked={d.thirdCountryTransfer}
                          className="rounded border-slate-300"
                        />
                        Drittlandübermittlung
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          name="dpiaRequired"
                          defaultChecked={d.dpiaRequired}
                          className="rounded border-slate-300"
                        />
                        DSFA-pflichtig
                        {d.dpiaSuggested && !d.dpiaRequired && (
                          <span className="text-xs text-level-medium">empfohlen</span>
                        )}
                      </label>
                      <button type="submit" className="btn-ghost ml-auto" disabled={update.isPending}>
                        Übernehmen
                      </button>
                    </div>
                  </form>
                ) : (
                  <dl className="mb-6 grid gap-2 text-sm sm:grid-cols-2">
                    <Field label="Zweck" value={d.purpose} full />
                    <Field
                      label="Rechtsgrundlage"
                      value={d.legalBasis ? (LEGAL_BASIS_LABEL[d.legalBasis] ?? d.legalBasis) : null}
                      full
                    />
                    <Field label="Betroffene" value={list(d.dataSubjectCategories)} />
                    <Field label="Datenkategorien" value={list(d.dataCategories)} />
                    <Field label="Empfänger" value={list(d.recipients)} />
                    <Field label="Löschfrist" value={d.retention} />
                  </dl>
                )}

                <section className="mb-6">
                  <h3 className="mb-2 text-sm font-medium text-slate-700">
                    Technische und organisatorische Maßnahmen (Art. 32)
                  </h3>
                  {d.toms.length === 0 ? (
                    <p className="mb-2 text-sm text-slate-500">Noch keine Maßnahme zugeordnet.</p>
                  ) : (
                    <ul className="mb-3 space-y-1">
                      {d.toms.map((t) => (
                        <li
                          key={t.id}
                          className="group flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                        >
                          <span className="text-sm text-slate-800">
                            <span className="font-mono text-xs text-slate-500">{t.refNo}</span> {t.title}
                          </span>
                          <span className="flex items-center gap-2">
                            <StatusBadge status={t.status} />
                            {writable && (
                              <button
                                type="button"
                                className="hidden text-xs text-slate-400 underline hover:text-slate-700 group-hover:inline"
                                onClick={() => unlinkTom.mutate(t.id)}
                              >
                                Lösen
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {writable && (
                    <select
                      className="input"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) linkTom.mutate(e.target.value);
                      }}
                    >
                      <option value="">Maßnahme aus dem ISMS zuordnen …</option>
                      {(measures.data?.items ?? [])
                        .filter((m) => !d.toms.some((t) => t.id === m.id))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.refNo} · {m.title}
                          </option>
                        ))}
                    </select>
                  )}
                </section>

                {d.breaches.length > 0 && (
                  <section className="mb-6">
                    <h3 className="mb-2 text-sm font-medium text-slate-700">
                      Datenpannen mit Bezug zu dieser Verarbeitung
                    </h3>
                    <ul className="space-y-1">
                      {d.breaches.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm"
                        >
                          <span className="text-slate-800">
                            <span className="font-mono text-xs text-slate-500">{b.refNo}</span> {b.title}
                          </span>
                          <span className="text-xs tabular-nums text-slate-600">{date(b.detectedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {writable && (
                  <section className="rounded-md border border-dashed border-slate-300 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="input w-auto"
                        value={d.status}
                        onChange={(e) => update.mutate({ status: e.target.value })}
                      >
                        <option value="draft">Entwurf</option>
                        <option value="active">Aktiv</option>
                        <option value="retired">Ausgelaufen</option>
                      </select>
                      <p className="text-xs text-slate-500">
                        {errors.length > 0
                          ? 'Aktiv stellen geht erst, wenn die roten Punkte behoben sind.'
                          : 'Ein aktiver Eintrag ist die Aussage: so verarbeiten wir rechtmäßig.'}
                      </p>
                    </div>
                  </section>
                )}
              </>
            ) : (
              <DpiaTab
                activityId={id}
                writable={writable}
                suggested={d.dpiaSuggested}
                reasons={d.dpiaReasons}
                onChanged={refresh}
              />
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={clsx(full && 'sm:col-span-2')}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value ?? <span className="text-slate-400">–</span>}</dd>
    </div>
  );
}

function DpiaTab({
  activityId,
  writable,
  suggested,
  reasons,
  onChanged,
}: {
  activityId: string;
  writable: boolean;
  suggested: boolean;
  reasons: string[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [risks, setRisks] = useState<
    { title: string; likelihood: number; impact: number; mitigation: string }[] | null
  >(null);
  const detail = useQuery({
    queryKey: ['dpia', activityId],
    queryFn: () => api<DpiaDetail>(`/processing-activities/${activityId}/dpia`),
    retry: false,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['dpia', activityId] });
    setRisks(null);
    onChanged();
  };
  const upsert = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/processing-activities/${activityId}/dpia`, { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: () => api(`/processing-activities/${activityId}/dpia/submit`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const opinion = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/processing-activities/${activityId}/dpia/opinion`, { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });

  const d = detail.data;
  const current =
    risks ??
    (d?.risks ?? []).map((r) => ({
      title: r.title,
      likelihood: r.likelihood,
      impact: r.impact,
      mitigation: r.mitigation ?? '',
    }));
  const errors = (d?.findings ?? []).filter((f) => f.severity === 'error');

  if (detail.isError && !d) {
    return (
      <section className="rounded-md border border-dashed border-slate-300 p-4">
        <p className="mb-3 text-sm text-slate-600">
          Für diese Verarbeitung liegt keine Folgenabschätzung vor.
          {suggested && (
            <span className="ml-1 text-level-medium">Empfohlen wegen: {reasons.join(', ')}.</span>
          )}
        </p>
        {writable && (
          <button type="button" className="btn-primary" onClick={() => upsert.mutate({ risks: [] })}>
            Folgenabschätzung anlegen
          </button>
        )}
        <ErrorNote error={upsert.error} />
      </section>
    );
  }
  if (!d) return <Spinner />;

  return (
    <>
      <ErrorNote error={upsert.error ?? submit.error ?? opinion.error} />

      {errors.length > 0 && (
        <section className="mb-4 space-y-1">
          {errors.map((f, i) => (
            <p key={i} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {f.message}
            </p>
          ))}
        </section>
      )}

      <p className="mb-4 text-xs text-slate-500">
        Status: <StatusBadge status={d.status} />
        {d.result && <span className="ml-2">Ergebnis: {DPIA_RESULT_LABEL[d.result] ?? d.result}</span>}
      </p>

      {writable && d.status !== 'approved' ? (
        <form
          className="mb-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            upsert.mutate({
              descriptionOfProcessing: String(f.get('descriptionOfProcessing') || '') || null,
              necessityAssessment: String(f.get('necessityAssessment') || '') || null,
              risks: current
                .filter((r) => r.title.trim().length >= 3)
                .map((r) => ({ ...r, mitigation: r.mitigation || null })),
            });
          }}
        >
          <div>
            <label className="label" htmlFor="descriptionOfProcessing">
              Systematische Beschreibung (Art. 35 Abs. 7 lit. a)
            </label>
            <textarea
              id="descriptionOfProcessing"
              name="descriptionOfProcessing"
              rows={3}
              className="input"
              defaultValue={d.descriptionOfProcessing ?? ''}
            />
          </div>
          <div>
            <label className="label" htmlFor="necessityAssessment">
              Notwendigkeit und Verhältnismäßigkeit (lit. b)
            </label>
            <textarea
              id="necessityAssessment"
              name="necessityAssessment"
              rows={3}
              className="input"
              defaultValue={d.necessityAssessment ?? ''}
            />
          </div>

          <div>
            <p className="label">Risiken für die Rechte und Freiheiten (lit. c/d)</p>
            <ul className="space-y-2">
              {current.map((r, i) => {
                const score = r.likelihood * r.impact;
                return (
                  <li
                    key={i}
                    className="grid gap-2 rounded border border-slate-200 p-2 sm:grid-cols-[1fr_auto_auto_auto]"
                  >
                    <input
                      className="input"
                      value={r.title}
                      placeholder="Risiko"
                      onChange={(e) =>
                        setRisks(current.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                      }
                    />
                    <select
                      className="input w-auto"
                      value={r.likelihood}
                      onChange={(e) =>
                        setRisks(
                          current.map((x, j) => (j === i ? { ...x, likelihood: Number(e.target.value) } : x)),
                        )
                      }
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          W {n}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input w-auto"
                      value={r.impact}
                      onChange={(e) =>
                        setRisks(
                          current.map((x, j) => (j === i ? { ...x, impact: Number(e.target.value) } : x)),
                        )
                      }
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          S {n}
                        </option>
                      ))}
                    </select>
                    <span
                      className={clsx(
                        'self-center text-xs tabular-nums',
                        score >= 15 ? 'font-medium text-level-critical' : 'text-slate-500',
                      )}
                    >
                      {score}
                    </span>
                    <input
                      className="input sm:col-span-4"
                      value={r.mitigation}
                      placeholder={
                        score >= 15 ? 'Abhilfemaßnahme — bei hohem Risiko verpflichtend' : 'Abhilfemaßnahme'
                      }
                      onChange={(e) =>
                        setRisks(current.map((x, j) => (j === i ? { ...x, mitigation: e.target.value } : x)))
                      }
                    />
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn-ghost mt-2 py-1 text-xs"
              onClick={() => setRisks([...current, { title: '', likelihood: 3, impact: 3, mitigation: '' }])}
            >
              Risiko ergänzen
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary" disabled={upsert.isPending}>
              Übernehmen
            </button>
            {d.status === 'draft' && (
              <button
                type="button"
                className="btn-ghost"
                disabled={submit.isPending || errors.length > 0}
                onClick={() => submit.mutate()}
              >
                Zur Stellungnahme vorlegen
              </button>
            )}
            <p className="text-xs text-slate-500">Jede Änderung nimmt eine erteilte Stellungnahme zurück.</p>
          </div>
        </form>
      ) : (
        <dl className="mb-6 space-y-2 text-sm">
          <Field label="Systematische Beschreibung" value={d.descriptionOfProcessing} />
          <Field label="Notwendigkeit und Verhältnismäßigkeit" value={d.necessityAssessment} />
          <div>
            <dt className="text-xs text-slate-500">Risiken</dt>
            <dd>
              <ul className="mt-1 space-y-1">
                {d.risks.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                  >
                    <span className="text-slate-800">
                      {r.title}
                      {r.mitigation && (
                        <span className="mt-0.5 block text-xs text-slate-500">{r.mitigation}</span>
                      )}
                    </span>
                    <span
                      className={clsx(
                        'text-xs tabular-nums',
                        r.high ? 'font-medium text-level-critical' : 'text-slate-500',
                      )}
                    >
                      {r.score}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      )}

      <section className="rounded-md border border-slate-200 p-3">
        <h3 className="mb-2 text-sm font-medium text-slate-700">Stellungnahme nach Art. 35 Abs. 2</h3>
        {d.dpoOpinion ? (
          <>
            <p className="whitespace-pre-line text-sm text-slate-700">{d.dpoOpinion}</p>
            <p className="mt-1 text-xs text-slate-500">
              {d.dpoName} am {date(d.dpoConsultedAt)} · {d.result ? DPIA_RESULT_LABEL[d.result] : ''}
            </p>
          </>
        ) : d.status === 'in_review' && writable ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              opinion.mutate({ opinion: String(f.get('opinion')), result: String(f.get('result')) });
            }}
          >
            <textarea
              name="opinion"
              rows={3}
              required
              minLength={10}
              className="input"
              placeholder="Rat der oder des Datenschutzbeauftragten"
            />
            <div className="flex flex-wrap items-center gap-2">
              <select name="result" className="input w-auto" defaultValue="approved_with_measures">
                {Object.entries(DPIA_RESULT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary" disabled={opinion.isPending}>
                Stellungnahme abgeben
              </button>
              <p className="text-xs text-slate-500">
                Nicht durch die Person, welche die Verarbeitung verantwortet.
              </p>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">
            {d.status === 'draft'
              ? 'Die Abschätzung ist noch nicht vorgelegt.'
              : 'Noch keine Stellungnahme erteilt.'}
          </p>
        )}
      </section>
    </>
  );
}
