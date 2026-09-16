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
import { api } from '../lib/api';
import {
  OBJECTIVE_STATUS_LABEL,
  PARTY_CATEGORY_LABEL,
  PESTLE_DIMENSION_LABEL,
  RELEVANCE_LABEL,
} from '../lib/labels';
import { useAuth } from '../lib/auth-context';

interface Party {
  id: string;
  name: string;
  category: string;
  expectations: string | null;
  addressedVia: string | null;
  isBinding: boolean;
  influence: number;
}

interface Factor {
  id: string;
  dimension: string;
  title: string;
  description: string | null;
  effect: string;
  relevance: number;
  linkedRiskId: string | null;
  riskRefNo: string | null;
  riskTitle: string | null;
}

interface Objective {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
  direction: string;
  frequency: string | null;
  dueDate: string | null;
  ownerName: string | null;
  overdue: boolean | null;
  requirements: { id: string; refCode: string; title: string; framework: string }[];
}

interface PersonOption {
  id: string;
  name: string;
}

const DIMENSIONS = Object.keys(PESTLE_DIMENSION_LABEL);

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');
/**
 * Zielerreichung in Prozent. Bei „niedriger ist besser“ (etwa Wiederanlaufzeiten) zählt der
 * Kehrwert — sonst läse sich „6 von 4 Stunden“ als übererfülltes Ziel statt als verfehltes.
 */
const achievement = (current: string | null, target: string | null, direction: string) => {
  const c = Number(current);
  const t = Number(target);
  if (current == null || target == null || !Number.isFinite(c) || !Number.isFinite(t)) return null;
  if (direction === 'lower_is_better') {
    if (c <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((t / c) * 100)));
  }
  if (t === 0) return null;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
};

type Tab = 'factors' | 'parties' | 'objectives';

export function ContextPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('factors');

  const factors = useQuery({ queryKey: ['factors'], queryFn: () => api<Factor[]>('/context/factors') });
  const parties = useQuery({ queryKey: ['parties'], queryFn: () => api<Party[]>('/context/parties') });
  const objectives = useQuery({
    queryKey: ['objectives'],
    queryFn: () => api<Objective[]>('/context/objectives'),
  });

  const writable = can('context.write');
  const invalidate = (key: string) => {
    void qc.invalidateQueries({ queryKey: [key] });
    void qc.invalidateQueries({ queryKey: ['review-preview'] });
  };

  const binding = (parties.data ?? []).filter((p) => p.isBinding).length;
  const risks = (factors.data ?? []).filter((f) => f.effect === 'risk').length;
  const chances = (factors.data ?? []).filter((f) => f.effect === 'opportunity').length;
  const openObjectives = (objectives.data ?? []).filter((o) =>
    ['active', 'at_risk'].includes(o.status),
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="ISMS-Kern"
        title="Kontext & Ziele"
        norm={['iso:4.1', 'iso:4.2', 'iso:6.2']}
        description="Externe und interne Themen (Kap. 4.1), interessierte Parteien mit ihren Erwartungen (Kap. 4.2) und die Informationssicherheitsziele (Kap. 6.2). Diese drei Register speisen die Tagesordnung der Managementbewertung."
      />
      <ErrorNote error={factors.error ?? parties.error ?? objectives.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Themen als Risiko" value={risks} tone={risks > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Themen als Chance" value={chances} tone="good" />
        <StatTile
          label="Bindende Erwartungen"
          value={binding}
          hint={`${parties.data?.length ?? 0} Parteien erfasst`}
        />
        <StatTile
          label="Verfolgte Ziele"
          value={openObjectives}
          tone={openObjectives > 0 ? 'good' : 'warn'}
        />
      </section>

      <div className="tabs">
        {(
          [
            ['factors', 'PESTLE-Analyse'],
            ['parties', 'Interessierte Parteien'],
            ['objectives', 'Ziele'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx('tab', tab === key && 'tab-active')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'factors' && (
        <FactorsTab
          data={factors.data}
          loading={factors.isLoading}
          writable={writable}
          onChanged={() => invalidate('factors')}
        />
      )}
      {tab === 'parties' && (
        <PartiesTab
          data={parties.data}
          loading={parties.isLoading}
          writable={writable}
          onChanged={() => invalidate('parties')}
        />
      )}
      {tab === 'objectives' && (
        <ObjectivesTab
          data={objectives.data}
          loading={objectives.isLoading}
          writable={writable}
          onChanged={() => invalidate('objectives')}
        />
      )}
    </>
  );
}

function FactorsTab({
  data,
  loading,
  writable,
  onChanged,
}: {
  data?: Factor[];
  loading: boolean;
  writable: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/context/factors', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      onChanged();
      setAdding(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/context/factors/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });

  if (loading) return <Spinner />;
  const byDimension = (d: string) => (data ?? []).filter((f) => f.dimension === d);

  return (
    <>
      <ErrorNote error={create.error ?? remove.error} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DIMENSIONS.map((d) => (
          <section key={d} className="card flex flex-col p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">{PESTLE_DIMENSION_LABEL[d]}</h2>
              {writable && (
                <button
                  type="button"
                  className="btn-ghost py-0.5 text-xs"
                  onClick={() => setAdding(adding === d ? null : d)}
                >
                  {adding === d ? 'Abbrechen' : 'Thema'}
                </button>
              )}
            </div>

            {adding === d && (
              <form
                className="mb-2 space-y-2 rounded border border-dashed border-slate-300 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  create.mutate({
                    dimension: d,
                    title: String(f.get('title')).trim(),
                    description: String(f.get('description') || '') || null,
                    effect: String(f.get('effect')),
                    relevance: Number(f.get('relevance')),
                  });
                }}
              >
                <input name="title" required minLength={3} className="input" placeholder="Thema" autoFocus />
                <input name="description" className="input" placeholder="Auswirkung auf das ISMS" />
                <div className="flex gap-2">
                  <select name="effect" className="input" defaultValue="risk">
                    <option value="risk">Risiko</option>
                    <option value="opportunity">Chance</option>
                  </select>
                  <select name="relevance" className="input" defaultValue="2">
                    <option value="1">gering</option>
                    <option value="2">mittel</option>
                    <option value="3">hoch</option>
                  </select>
                </div>
                <button type="submit" className="btn-primary w-full py-1 text-xs" disabled={create.isPending}>
                  Aufnehmen
                </button>
              </form>
            )}

            {byDimension(d).length === 0 ? (
              <p className="text-xs text-slate-400">Kein Thema erfasst.</p>
            ) : (
              <ul className="space-y-2">
                {byDimension(d).map((f) => (
                  <li key={f.id} className="group rounded border border-slate-200 px-2 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">{f.title}</p>
                        {f.description && <p className="mt-0.5 text-xs text-slate-500">{f.description}</p>}
                        {f.riskRefNo && (
                          <p className="mt-1 text-xs text-slate-500">
                            behandelt als <span className="font-mono">{f.riskRefNo}</span> {f.riskTitle}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={clsx(
                            'badge',
                            f.effect === 'opportunity'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-amber-100 text-amber-900',
                          )}
                        >
                          {f.effect === 'opportunity' ? 'Chance' : 'Risiko'}
                        </span>
                        <span className="text-[11px] text-slate-400">{RELEVANCE_LABEL[f.relevance]}</span>
                      </div>
                    </div>
                    {writable && (
                      <button
                        type="button"
                        className="mt-1 hidden text-[11px] text-slate-400 underline hover:text-slate-700 group-hover:inline"
                        onClick={() => remove.mutate(f.id)}
                      >
                        Entfernen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

function PartiesTab({
  data,
  loading,
  writable,
  onChanged,
}: {
  data?: Party[];
  loading: boolean;
  writable: boolean;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/context/parties', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      onChanged();
      setCreating(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/context/parties/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });

  return (
    <>
      <ErrorNote error={create.error ?? remove.error} />
      {writable && !creating && (
        <button type="button" className="btn-primary mb-4" onClick={() => setCreating(true)}>
          Partei erfassen
        </button>
      )}
      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              name: String(f.get('name')).trim(),
              category: String(f.get('category')),
              expectations: String(f.get('expectations') || '') || null,
              addressedVia: String(f.get('addressedVia') || '') || null,
              isBinding: f.get('isBinding') === 'on',
              influence: Number(f.get('influence')),
            });
          }}
        >
          <div>
            <label className="label" htmlFor="name">
              Partei
              <NormHint refs="iso:4.2" />
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              className="input"
              placeholder="Bundesnetzagentur"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="category">
              Kategorie
              <NormHint refs="iso:4.2" />
            </label>
            <select id="category" name="category" className="input" defaultValue="customer">
              {Object.entries(PARTY_CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="label" htmlFor="expectations">
              Erwartung
              <NormHint refs="iso:4.2" />
            </label>
            <input
              id="expectations"
              name="expectations"
              className="input"
              placeholder="Was erwartet diese Partei von uns?"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="label" htmlFor="addressedVia">
              Wie erfüllt
              <NormHint refs="iso:4.2" />
            </label>
            <input
              id="addressedVia"
              name="addressedVia"
              className="input"
              placeholder="Vertrag, Richtlinie, Meldeprozess …"
            />
          </div>
          <div>
            <label className="label" htmlFor="influence">
              Einfluss
              <NormHint refs="iso:4.2" />
            </label>
            <select id="influence" name="influence" className="input" defaultValue="2">
              <option value="1">gering</option>
              <option value="2">mittel</option>
              <option value="3">hoch</option>
            </select>
          </div>
          <div className="flex items-end justify-between gap-2">
            <label className="mb-2 inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="isBinding" className="rounded border-slate-300" />
              bindend
            </label>
            <div className="mb-0 flex gap-2">
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                Erfassen
              </button>
              <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
                Abbrechen
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <Spinner />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Noch keine interessierten Parteien"
          hint="Aufsichtsbehörden, Kunden und Beschäftigte zuerst — deren bindende Erwartungen bestimmen den Geltungsbereich."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-48">Partei</th>
                <th className="th w-32">Kategorie</th>
                <th className="th">Erwartung</th>
                <th className="th">Wie erfüllt</th>
                <th className="th w-28">Einfluss</th>
                {writable && <th className="th w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td">
                    <span className="font-medium text-slate-800">{p.name}</span>
                    {p.isBinding && <span className="ml-2 badge bg-red-100 text-red-800">bindend</span>}
                  </td>
                  <td className="td text-xs text-slate-600">
                    {PARTY_CATEGORY_LABEL[p.category] ?? p.category}
                  </td>
                  <td className="td text-sm text-slate-700">{p.expectations ?? '–'}</td>
                  <td className="td text-sm text-slate-600">
                    {p.addressedVia ?? <span className="text-level-medium">noch offen</span>}
                  </td>
                  <td className="td text-xs text-slate-600">{RELEVANCE_LABEL[p.influence]}</td>
                  {writable && (
                    <td className="td">
                      <button
                        type="button"
                        className="text-xs text-slate-400 underline hover:text-slate-700"
                        onClick={() => remove.mutate(p.id)}
                      >
                        Entfernen
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ObjectivesTab({
  data,
  loading,
  writable,
  onChanged,
}: {
  data?: Objective[];
  loading: boolean;
  writable: boolean;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const persons = useQuery({ queryKey: ['persons'], queryFn: () => api<PersonOption[]>('/persons') });
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/context/objectives', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      onChanged();
      setCreating(false);
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api(`/context/objectives/${v.id}`, { method: 'PATCH', body: JSON.stringify(v.body) }),
    onSuccess: onChanged,
  });

  return (
    <>
      <ErrorNote error={create.error ?? update.error} />
      {writable && !creating && (
        <button type="button" className="btn-primary mb-4" onClick={() => setCreating(true)}>
          Ziel festlegen
        </button>
      )}
      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: String(f.get('title')).trim(),
              kind: String(f.get('kind')),
              ownerPersonId: String(f.get('ownerPersonId') || '') || null,
              targetValue: String(f.get('targetValue') || '') || null,
              currentValue: String(f.get('currentValue') || '') || null,
              unit: String(f.get('unit') || '') || null,
              frequency: String(f.get('frequency') || '') || null,
              direction: String(f.get('direction')),
              dueDate: String(f.get('dueDate') || '') || null,
            });
          }}
        >
          <div className="lg:col-span-2">
            <label className="label" htmlFor="title">
              Ziel
              <NormHint refs="iso:6.2" />
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              className="input"
              placeholder="Alle privilegierten Konten mit MFA absichern"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Art
              <NormHint refs="iso:6.2" />
            </label>
            <select id="kind" name="kind" className="input" defaultValue="operational">
              <option value="operational">operativ</option>
              <option value="strategic">strategisch</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ownerPersonId">
              Verantwortlich
              <NormHint refs="iso:5.3" />
            </label>
            <select id="ownerPersonId" name="ownerPersonId" className="input" defaultValue="">
              <option value="">– offen –</option>
              {(persons.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="currentValue">
              Ist
              <NormHint refs={['iso:6.2', 'iso:9.1']} />
            </label>
            <input id="currentValue" name="currentValue" className="input" placeholder="62" />
          </div>
          <div>
            <label className="label" htmlFor="targetValue">
              Soll
              <NormHint refs="iso:6.2" />
            </label>
            <input id="targetValue" name="targetValue" className="input" placeholder="100" />
          </div>
          <div>
            <label className="label" htmlFor="unit">
              Einheit
              <NormHint refs="iso:6.2" />
            </label>
            <input id="unit" name="unit" className="input" placeholder="%" />
          </div>
          <div>
            <label className="label" htmlFor="direction">
              Zielrichtung
              <NormHint refs="iso:6.2" />
            </label>
            <select id="direction" name="direction" className="input" defaultValue="higher_is_better">
              <option value="higher_is_better">höher ist besser</option>
              <option value="lower_is_better">niedriger ist besser</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="dueDate">
              Zieltermin
              <NormHint refs="iso:6.2" />
            </label>
            <input id="dueDate" name="dueDate" type="date" className="input" />
          </div>
          <div className="flex items-end gap-2 lg:col-span-4">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Festlegen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
            <p className="text-xs text-slate-500">
              Ziele im Entwurf erscheinen noch nicht in der Managementbewertung — dort zählt, was die Leitung
              verabschiedet hat.
            </p>
          </div>
        </form>
      )}

      {loading ? (
        <Spinner />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Noch keine Informationssicherheitsziele"
          hint="Kap. 6.2 verlangt messbare Ziele. Drei bis fünf reichen — jedes mit Zielwert, Termin und verantwortlicher Person."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Ziel</th>
                <th className="th w-40">Verantwortlich</th>
                <th className="th w-44">Fortschritt</th>
                <th className="th w-32">Termin</th>
                <th className="th w-40">Norm</th>
                <th className="th w-40">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map((o) => {
                const p = achievement(o.currentValue, o.targetValue, o.direction);
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="td">
                      <span className="font-medium text-slate-800">{o.title}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {o.kind === 'strategic' ? 'strategisch' : 'operativ'}
                      </span>
                    </td>
                    <td className="td text-xs text-slate-600">
                      {o.ownerName ?? <span className="text-slate-400">offen</span>}
                    </td>
                    <td className="td">
                      {o.targetValue ? (
                        <>
                          <p className="mb-1 text-xs tabular-nums text-slate-600">
                            {o.currentValue ?? '–'} von {o.targetValue} {o.unit}
                            {o.direction === 'lower_is_better' && (
                              <span className="ml-1 text-slate-400">oder weniger</span>
                            )}
                          </p>
                          {p != null && <Progress value={p} tone="level" />}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">nicht messbar</span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        'td text-xs tabular-nums',
                        o.overdue ? 'font-medium text-level-critical' : 'text-slate-600',
                      )}
                    >
                      {date(o.dueDate)}
                    </td>
                    <td className="td text-xs text-slate-600">
                      {o.requirements.length === 0 ? (
                        <span className="text-slate-400">nicht zugeordnet</span>
                      ) : (
                        o.requirements.map((r) => (
                          <span key={r.id} className="mr-1 font-mono text-slate-500">
                            {r.refCode}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="td">
                      {writable ? (
                        <select
                          className="input w-auto py-1 text-xs"
                          value={o.status}
                          onChange={(e) => update.mutate({ id: o.id, body: { status: e.target.value } })}
                        >
                          {Object.entries(OBJECTIVE_STATUS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge status={o.status} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
