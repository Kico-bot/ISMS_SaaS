import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import {
  EmptyState,
  ErrorNote,
  MoreMenu,
  MoreMenuItem,
  NormHint,
  PageHeader,
  Spinner,
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import type { NormRefKey } from '../lib/norm-refs';
import { ScopeTab, type Factor, type Objective, type Party, type PersonOption } from './Context';

type Adding = 'factor' | 'party' | 'objective' | null;

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');
const withUnit = (v: string | null, unit: string | null) =>
  v == null || v === '' ? '–' : unit ? `${v} ${unit}` : v;

/**
 * Organisation in der schlanken Oberfläche: eine Seite, vier Blöcke, ein Hauptbutton. Was ein
 * Auditor zu Kap. 4 und 6.2 zuerst fragt, ohne Unterreiter und ohne Felder, die nur Fachleute
 * füllen. Die vollständige Seite (`ContextPage`) bleibt mit VITE_FULL_UI=true unverändert.
 */
export function ContextLeanPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const writable = can('context.write');
  const [adding, setAdding] = useState<Adding>(null);

  const factors = useQuery({ queryKey: ['factors'], queryFn: () => api<Factor[]>('/context/factors') });
  const parties = useQuery({ queryKey: ['parties'], queryFn: () => api<Party[]>('/context/parties') });
  const objectives = useQuery({
    queryKey: ['objectives'],
    queryFn: () => api<Objective[]>('/context/objectives'),
  });
  const invalidate = (key: string) => {
    void qc.invalidateQueries({ queryKey: [key] });
    void qc.invalidateQueries({ queryKey: ['review-preview'] });
  };
  const done = (key: string) => {
    invalidate(key);
    setAdding(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="Planen"
        title="Organisation"
        norm={['iso:4.1', 'iso:4.2', 'iso:4.3', 'iso:6.2']}
        description="Wofür das ISMS gilt, was von außen und innen wirkt, wer etwas erwartet und welche Ziele Sie verfolgen. Daraus entsteht die Tagesordnung der Managementbewertung."
        actions={
          writable ? (
            <MoreMenu primary label="Eintrag erfassen">
              <MoreMenuItem onClick={() => setAdding('factor')}>Thema</MoreMenuItem>
              <MoreMenuItem onClick={() => setAdding('party')}>Interessierte Partei</MoreMenuItem>
              <MoreMenuItem onClick={() => setAdding('objective')}>Ziel</MoreMenuItem>
            </MoreMenu>
          ) : undefined
        }
      />
      <ErrorNote error={factors.error ?? parties.error ?? objectives.error} />

      <Block title="Geltungsbereich" norm="iso:4.3">
        <ScopeTab writable={writable} />
      </Block>

      <Block title="Themen von außen und innen" norm="iso:4.1">
        {adding === 'factor' && (
          <FactorForm onDone={() => done('factors')} onCancel={() => setAdding(null)} />
        )}
        <FactorList
          data={factors.data}
          loading={factors.isLoading}
          writable={writable}
          onChanged={() => invalidate('factors')}
        />
      </Block>

      <Block title="Interessierte Parteien" norm="iso:4.2">
        {adding === 'party' && <PartyForm onDone={() => done('parties')} onCancel={() => setAdding(null)} />}
        <PartyTable
          data={parties.data}
          loading={parties.isLoading}
          writable={writable}
          onChanged={() => invalidate('parties')}
        />
      </Block>

      <Block title="Ziele" norm="iso:6.2">
        {adding === 'objective' && (
          <ObjectiveForm onDone={() => done('objectives')} onCancel={() => setAdding(null)} />
        )}
        <ObjectiveTable
          data={objectives.data}
          loading={objectives.isLoading}
          writable={writable}
          onChanged={() => invalidate('objectives')}
        />
      </Block>
    </>
  );
}

function Block({ title, norm, children }: { title: string; norm: NormRefKey; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-1.5 text-base font-semibold text-slate-900">
        {title} <NormHint refs={norm} />
      </h2>
      {children}
    </section>
  );
}

function FormActions({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <button type="submit" className="btn-primary" disabled={pending}>
        Speichern
      </button>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  );
}

function useCreate(path: string, onDone: () => void) {
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) => api(path, { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: onDone,
  });
}

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim() || null;

function FactorForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useCreate('/context/factors', onDone);
  return (
    <form
      className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        // Kap. 4.1 fragt nach internen und externen Themen; eine PESTLE-Dimension braucht es nicht.
        create.mutate({ title: text(f, 'title'), origin: String(f.get('origin')) });
      }}
    >
      <ErrorNote error={create.error} />
      <div>
        <label className="label" htmlFor="factor-title">
          Thema
        </label>
        <input id="factor-title" name="title" required minLength={3} className="input" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="factor-origin">
          Von
        </label>
        <select id="factor-origin" name="origin" className="input" defaultValue="external">
          <option value="external">außen</option>
          <option value="internal">innen</option>
        </select>
      </div>
      <FormActions pending={create.isPending} onCancel={onCancel} />
    </form>
  );
}

function FactorList({
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
  const remove = useMutation({
    mutationFn: (id: string) => api(`/context/factors/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });
  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState title="Noch kein Thema erfasst." />;
  return (
    <ul className="card divide-y divide-slate-100">
      <ErrorNote error={remove.error} />
      {data.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-slate-800">
          <span>
            {f.title}
            {f.origin && (
              <span className="ml-2 text-xs text-slate-500">
                {f.origin === 'internal' ? 'innen' : 'außen'}
              </span>
            )}
          </span>
          {writable && (
            <MoreMenu compact label={`Aktionen für ${f.title}`}>
              <MoreMenuItem onClick={() => remove.mutate(f.id)}>Entfernen</MoreMenuItem>
            </MoreMenu>
          )}
        </li>
      ))}
    </ul>
  );
}

function PartyForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useCreate('/context/parties', onDone);
  return (
    <form
      className="card mb-4 grid gap-3 p-4 lg:grid-cols-[14rem_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        // Kategorie und Einfluss fragt die schlanke Oberfläche nicht; die Felder bleiben im Schema.
        create.mutate({
          name: text(f, 'name'),
          category: 'other',
          expectations: text(f, 'expectations'),
          addressedVia: text(f, 'addressedVia'),
        });
      }}
    >
      <ErrorNote error={create.error} />
      <div>
        <label className="label" htmlFor="party-name">
          Partei
        </label>
        <input id="party-name" name="name" required minLength={2} className="input" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="party-expectations">
          Erwartung
        </label>
        <input id="party-expectations" name="expectations" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="party-addressed">
          Wie erfüllt
        </label>
        <input id="party-addressed" name="addressedVia" className="input" />
      </div>
      <FormActions pending={create.isPending} onCancel={onCancel} />
    </form>
  );
}

function PartyTable({
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
  const remove = useMutation({
    mutationFn: (id: string) => api(`/context/parties/${id}`, { method: 'DELETE' }),
    onSuccess: onChanged,
  });
  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState title="Noch keine interessierte Partei erfasst." />;
  return (
    <div className="card overflow-x-auto">
      <ErrorNote error={remove.error} />
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr>
            <th className="th w-56">Partei</th>
            <th className="th">Erwartung</th>
            <th className="th">Wie erfüllt</th>
            {writable && <th className="th w-12" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((p) => (
            <tr key={p.id}>
              <td className="td font-medium text-slate-800">{p.name}</td>
              <td className="td text-sm text-slate-700">{p.expectations ?? '–'}</td>
              <td className="td text-sm text-slate-600">
                {p.addressedVia ?? <span className="text-level-medium">noch offen</span>}
              </td>
              {writable && (
                <td className="td">
                  <MoreMenu compact label={`Aktionen für ${p.name}`}>
                    <MoreMenuItem onClick={() => remove.mutate(p.id)}>Entfernen</MoreMenuItem>
                  </MoreMenu>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectiveForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useCreate('/context/objectives', onDone);
  const persons = useQuery({ queryKey: ['persons'], queryFn: () => api<PersonOption[]>('/persons') });
  return (
    <form
      className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        create.mutate({
          title: text(f, 'title'),
          targetValue: text(f, 'targetValue'),
          currentValue: text(f, 'currentValue'),
          unit: text(f, 'unit'),
          direction: String(f.get('direction')),
          ownerPersonId: text(f, 'ownerPersonId'),
          dueDate: text(f, 'dueDate'),
        });
      }}
    >
      <ErrorNote error={create.error} />
      <div className="sm:col-span-2 lg:col-span-6">
        <label className="label" htmlFor="obj-title">
          Ziel
        </label>
        <input id="obj-title" name="title" required minLength={3} className="input" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="obj-target">
          Zielwert
        </label>
        <input id="obj-target" name="targetValue" className="input" placeholder="100" />
      </div>
      <div>
        <label className="label" htmlFor="obj-current">
          Ist
        </label>
        <input id="obj-current" name="currentValue" className="input" placeholder="62" />
      </div>
      <div>
        <label className="label" htmlFor="obj-unit">
          Einheit
        </label>
        <input id="obj-unit" name="unit" className="input" placeholder="%" />
      </div>
      <div>
        <label className="label" htmlFor="obj-direction">
          Besser ist
        </label>
        <select id="obj-direction" name="direction" className="input" defaultValue="higher_is_better">
          <option value="higher_is_better">mehr</option>
          <option value="lower_is_better">weniger</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="obj-owner">
          Verantwortlich
        </label>
        <select id="obj-owner" name="ownerPersonId" className="input" defaultValue="">
          <option value="">–</option>
          {(persons.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="obj-due">
          Termin
        </label>
        <input id="obj-due" name="dueDate" type="date" className="input" />
      </div>
      <div className="sm:col-span-2 lg:col-span-6">
        <FormActions pending={create.isPending} onCancel={onCancel} />
      </div>
    </form>
  );
}

function ObjectiveTable({
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
  const update = useMutation({
    mutationFn: (v: { id: string; currentValue: string | null }) =>
      api(`/context/objectives/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ currentValue: v.currentValue }),
      }),
    onSuccess: onChanged,
  });
  if (loading) return <Spinner />;
  if (!data?.length) return <EmptyState title="Noch kein Ziel festgelegt." />;
  return (
    <div className="card overflow-x-auto">
      <ErrorNote error={update.error} />
      <table className="w-full">
        <thead className="border-b border-slate-200">
          <tr>
            <th className="th">Ziel</th>
            <th className="th w-32">Zielwert</th>
            <th className="th w-36">Ist</th>
            <th className="th w-44">Verantwortlich</th>
            <th className="th w-32">Termin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((o) => (
            <tr key={o.id}>
              <td className="td font-medium text-slate-800">{o.title}</td>
              <td className="td text-sm tabular-nums text-slate-700">{withUnit(o.targetValue, o.unit)}</td>
              <td className="td text-sm tabular-nums text-slate-700">
                {writable ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      aria-label={`Ist-Wert für ${o.title}`}
                      defaultValue={o.currentValue ?? ''}
                      className="input w-20 py-0.5 text-sm"
                      onBlur={(e) => {
                        const v = e.currentTarget.value.trim() || null;
                        if (v !== o.currentValue) update.mutate({ id: o.id, currentValue: v });
                      }}
                    />
                    {o.unit && <span className="text-xs text-slate-500">{o.unit}</span>}
                  </span>
                ) : (
                  withUnit(o.currentValue, o.unit)
                )}
              </td>
              <td className="td text-sm text-slate-600">{o.ownerName ?? '–'}</td>
              <td
                className={clsx(
                  'td text-sm tabular-nums',
                  o.overdue ? 'font-medium text-level-critical' : 'text-slate-600',
                )}
              >
                {date(o.dueDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
