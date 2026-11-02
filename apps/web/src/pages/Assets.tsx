import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNote, NormHint, OwnerSelect, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface AssetRow {
  id: string;
  refNo: string;
  name: string;
  type: string;
  category: string;
  classification: string;
  confidentiality: number;
  integrity: number;
  availability: number;
  hasPii: boolean;
  ownerName: string | null;
  ownerPersonId: string | null;
  locationName: string | null;
  riskCount: number;
  tags: string[];
}

const CATEGORY_LABEL: Record<string, string> = {
  information: 'Information',
  process: 'Prozess',
  application: 'Anwendung',
  system: 'IT-System',
  network: 'Netz',
  hardware: 'Hardware',
  site: 'Standort',
  person: 'Person',
  supplier: 'Lieferant',
  other: 'Sonstiges',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  public: 'Öffentlich',
  internal: 'Intern',
  confidential: 'Vertraulich',
  strictly_confidential: 'Streng vertraulich',
};

const CLASSIFICATION_STYLE: Record<string, string> = {
  public: 'bg-slate-100 text-slate-600',
  internal: 'bg-slate-100 text-slate-700',
  confidential: 'bg-amber-100 text-amber-900',
  strictly_confidential: 'bg-red-100 text-red-800',
};

export function AssetsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState('');
  const [unownedOnly, setUnownedOnly] = useState(false);
  const persons = useQuery({
    queryKey: ['persons', false],
    queryFn: () => api<{ id: string; name: string; department: string | null }[]>('/persons'),
    enabled: can('asset.write'),
  });
  const assign = useMutation({
    mutationFn: (v: { id: string; ownerPersonId: string | null }) =>
      api(`/assets/${v.id}`, { method: 'PATCH', body: JSON.stringify({ ownerPersonId: v.ownerPersonId }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      void qc.invalidateQueries({ queryKey: ['programme-tasks'] });
      void qc.invalidateQueries({ queryKey: ['my-area'] });
    },
  });

  const list = useQuery({
    queryKey: ['assets', category],
    queryFn: () =>
      api<{ items: AssetRow[]; total: number }>(`/assets?size=200${category ? `&category=${category}` : ''}`),
  });

  const all = list.data?.items ?? [];
  const owned = all.filter((a) => a.ownerPersonId).length;
  const rows = unownedOnly ? all.filter((a) => !a.ownerPersonId) : all;

  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/assets', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      setCreating(false);
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Betreiben"
        title="Asset-Inventar"
        norm={['iso:A.5.9', 'iso:A.5.12']}
        description="Alle Informationswerte im Geltungsbereich. Die Schutzbedarfe (Vertraulichkeit, Integrität, Verfügbarkeit) steuern, welche Maßnahmen angemessen sind."
        actions={
          can('asset.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Asset anlegen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? create.error} />

      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              name: String(f.get('name')),
              category: String(f.get('category')),
              classification: String(f.get('classification')),
              confidentiality: Number(f.get('confidentiality')),
              integrity: Number(f.get('integrity')),
              availability: Number(f.get('availability')),
              hasPii: f.get('hasPii') === 'on',
              ownerPersonId: String(f.get('ownerPersonId') || '') || null,
            });
          }}
        >
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">
              Bezeichnung
              <NormHint refs="iso:A.5.9" />
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              className="input"
              placeholder="z. B. PLM-Server-Cluster"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="category">
              Kategorie
              <NormHint refs="iso:A.5.9" />
            </label>
            <select id="category" name="category" className="input" defaultValue="system">
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <OwnerSelect />
          <div>
            <label className="label" htmlFor="classification">
              Einstufung
              <NormHint refs="iso:A.5.12" />
            </label>
            <select id="classification" name="classification" className="input" defaultValue="internal">
              {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ['confidentiality', 'Vertraulichkeit'],
              ['integrity', 'Integrität'],
              ['availability', 'Verfügbarkeit'],
            ] as const
          ).map(([name, label]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>
                {label}
                <NormHint refs={['iso:A.5.12', 'bsi:200-2']} />
              </label>
              <select id={name} name={name} className="input" defaultValue="2">
                <option value="1">1: niedrig</option>
                <option value="2">2: mittel</option>
                <option value="3">3: hoch</option>
              </select>
            </div>
          ))}
          <label className="flex items-end gap-2 pb-1.5 text-sm text-slate-700">
            <input type="checkbox" name="hasPii" className="rounded border-slate-300" />
            Personenbezogene Daten
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Anlegen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {all.length > 0 && (
        <p className="mb-3 text-sm text-slate-700">
          <strong className="tabular-nums">{owned}</strong> von {all.length} Assets haben eine verantwortliche
          Person.{' '}
          {owned < all.length && (
            <span className="text-slate-500">
              Ohne Verantwortliche kümmert sich im Zweifel niemand (A.5.9).
            </span>
          )}
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          className="input w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Kategorie filtern"
        >
          <option value="">Alle Kategorien</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={unownedOnly}
            onChange={(e) => setUnownedOnly(e.target.checked)}
            className="rounded border-slate-300"
          />
          Nur ohne Verantwortliche ({all.length - owned})
        </label>
      </div>
      <ErrorNote error={assign.error} />

      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-24">Nr.</th>
                <th className="th">Asset</th>
                <th className="th w-32">Kategorie</th>
                <th className="th w-36">Einstufung</th>
                <th className="th w-24">C/I/V</th>
                <th className="th w-48">Verantwortlich</th>
                <th className="th w-28">Risiken</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs text-slate-600">{a.refNo}</td>
                  <td className="td">
                    <span className="font-medium text-slate-800">{a.name}</span>
                    {a.hasPii && <span className="ml-2 badge bg-violet-100 text-violet-800">pbD</span>}
                    {a.tags.length > 0 && (
                      <span className="ml-2 text-xs text-slate-400">{a.tags.join(' · ')}</span>
                    )}
                  </td>
                  <td className="td text-slate-600">{CATEGORY_LABEL[a.category] ?? a.category}</td>
                  <td className="td">
                    <span className={`badge ${CLASSIFICATION_STYLE[a.classification] ?? ''}`}>
                      {CLASSIFICATION_LABEL[a.classification] ?? a.classification}
                    </span>
                  </td>
                  <td className="td font-mono text-xs tabular-nums text-slate-700">
                    {a.confidentiality}/{a.integrity}/{a.availability}
                  </td>
                  <td className="td text-slate-600">
                    {can('asset.write') ? (
                      <select
                        className={clsx(
                          'input py-1 text-sm',
                          !a.ownerPersonId && 'border-amber-300 bg-amber-50',
                        )}
                        value={a.ownerPersonId ?? ''}
                        disabled={assign.isPending}
                        onChange={(e) => assign.mutate({ id: a.id, ownerPersonId: e.target.value || null })}
                        aria-label={`Verantwortlich für ${a.name}`}
                      >
                        <option value="">nicht zugewiesen</option>
                        {(persons.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (a.ownerName ?? <span className="text-slate-400">nicht zugewiesen</span>)
                    )}
                  </td>
                  <td className="td text-slate-600">
                    <span className="tabular-nums">{a.riskCount}</span>
                    {can('risk.write') && (
                      <Link
                        to={`/risks?asset=${a.id}`}
                        className="ml-2 text-xs text-brand-700 hover:underline"
                      >
                        + Risiko
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && all.length > 0 && (
                <tr>
                  <td className="td py-8 text-center text-emerald-700" colSpan={7}>
                    Alle Assets haben eine verantwortliche Person.
                  </td>
                </tr>
              )}
              {all.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-slate-500" colSpan={7}>
                    <p className="font-medium text-slate-700">Noch keine Assets erfasst.</p>
                    <p className="mx-auto mt-1 max-w-md text-sm">
                      Was ist schützenswert? Anwendungen, Systeme, Dienstleister, Standorte. Jedes Asset
                      bekommt eine verantwortliche Person.
                    </p>
                    {can('asset.write') && (
                      <button type="button" className="btn-primary mt-3" onClick={() => setCreating(true)}>
                        Erstes Asset erfassen
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
