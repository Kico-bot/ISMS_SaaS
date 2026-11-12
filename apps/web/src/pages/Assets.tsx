import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ErrorNote,
  MoreMenu,
  MoreMenuItem,
  NormHint,
  OwnerSelect,
  PageHeader,
  Spinner,
} from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { FileField } from '../components/FileField';
import { useAuth } from '../lib/auth-context';
import { LEAN } from '../lib/lean';

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
  supplierEvidence: string | null;
  supplierEvidenceFileId: string | null;
  supplierEvidenceFilename: string | null;
  supplierAssessedAt: string | null;
  supplierNextReviewAt: string | null;
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // `?category=supplier` kommt aus der Gap-Analyse (A.5.19 bis A.5.22) und aus den Fristen.
  const [params] = useSearchParams();
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [assessing, setAssessing] = useState<string | null>(null);
  const suppliers = category === 'supplier';
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
        title={LEAN ? 'Assets' : 'Asset-Inventar'}
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
              // Schlank fragt das Formular keine Einstufung; der Standard des Schemas (intern) gilt.
              ...(LEAN ? {} : { classification: String(f.get('classification')) }),
              confidentiality: Number(f.get('confidentiality')),
              integrity: Number(f.get('integrity')),
              availability: Number(f.get('availability')),
              ...(LEAN ? {} : { hasPii: f.get('hasPii') === 'on' }),
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
          {!LEAN && (
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
          )}
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
          {!LEAN && (
            <label className="flex items-end gap-2 pb-1.5 text-sm text-slate-700">
              <input type="checkbox" name="hasPii" className="rounded border-slate-300" />
              Personenbezogene Daten
            </label>
          )}
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
        <button
          type="button"
          aria-pressed={suppliers}
          className={suppliers ? 'btn-primary py-1 text-sm' : 'btn-ghost py-1 text-sm'}
          onClick={() => setCategory(suppliers ? '' : 'supplier')}
        >
          Lieferanten
        </button>
      </div>
      <ErrorNote error={assign.error} />

      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200">
              <tr>
                {!LEAN && <th className="th w-24">Nr.</th>}
                <th className="th">Asset</th>
                <th className="th w-32">Kategorie</th>
                {!LEAN && <th className="th w-36">Einstufung</th>}
                <th className="th w-36">{LEAN ? 'Schutzbedarf V/I/V' : 'C/I/V'}</th>
                <th className="th w-48">Verantwortlich</th>
                {suppliers && (
                  <>
                    <th className="th">Nachweis</th>
                    <th className="th w-32">Bewertet</th>
                    <th className="th w-32">Nächste Prüfung</th>
                  </>
                )}
                {LEAN ? <th className="th w-12" /> : <th className="th w-28">Risiken</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (
                <Fragment key={a.id}>
                  <tr className="hover:bg-slate-50">
                    {!LEAN && <td className="td font-mono text-xs text-slate-600">{a.refNo}</td>}
                    <td className="td">
                      <span className="font-medium text-slate-800">{a.name}</span>
                      {!LEAN && a.hasPii && (
                        <span className="ml-2 badge bg-violet-100 text-violet-800">pbD</span>
                      )}
                      {!LEAN && a.tags.length > 0 && (
                        <span className="ml-2 text-xs text-slate-400">{a.tags.join(' · ')}</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{CATEGORY_LABEL[a.category] ?? a.category}</td>
                    {!LEAN && (
                      <td className="td">
                        <span className={`badge ${CLASSIFICATION_STYLE[a.classification] ?? ''}`}>
                          {CLASSIFICATION_LABEL[a.classification] ?? a.classification}
                        </span>
                      </td>
                    )}
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
                    {suppliers && (
                      <>
                        <td className="td text-sm text-slate-700">
                          {a.supplierEvidence ?? <span className="text-level-medium">noch offen</span>}
                          {a.supplierEvidenceFilename && (
                            <button
                              type="button"
                              className="ml-2 text-xs text-brand-700 underline"
                              onClick={() =>
                                void downloadFile(a.supplierEvidenceFileId!, a.supplierEvidenceFilename!)
                              }
                            >
                              {a.supplierEvidenceFilename}
                            </button>
                          )}
                          {can('asset.write') && (
                            <button
                              type="button"
                              className="ml-2 text-xs text-brand-700 underline"
                              onClick={() => setAssessing(assessing === a.id ? null : a.id)}
                            >
                              Bewertung erfassen
                            </button>
                          )}
                        </td>
                        <td className="td text-sm tabular-nums text-slate-600">
                          {date(a.supplierAssessedAt)}
                        </td>
                        <td
                          className={clsx(
                            'td text-sm tabular-nums',
                            a.supplierNextReviewAt && a.supplierNextReviewAt < today
                              ? 'font-medium text-level-critical'
                              : 'text-slate-600',
                          )}
                        >
                          {date(a.supplierNextReviewAt)}
                        </td>
                      </>
                    )}
                    {LEAN ? (
                      <td className="td">
                        {can('risk.write') && (
                          // Risiko vom Asset aus erfassen bleibt, nur nicht als Spalte.
                          <MoreMenu compact label={`Aktionen für ${a.name}`}>
                            <MoreMenuItem onClick={() => navigate(`/risks?asset=${a.id}`)}>
                              Risiko zu diesem Asset erfassen
                            </MoreMenuItem>
                          </MoreMenu>
                        )}
                      </td>
                    ) : (
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
                    )}
                  </tr>
                  {assessing === a.id && (
                    <tr>
                      <td colSpan={12} className="bg-slate-50 px-4 py-3">
                        <SupplierForm
                          asset={a}
                          onDone={() => {
                            setAssessing(null);
                            void qc.invalidateQueries({ queryKey: ['assets'] });
                          }}
                          onCancel={() => setAssessing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {rows.length === 0 && all.length > 0 && (
                <tr>
                  <td className="td py-8 text-center text-emerald-700" colSpan={LEAN ? 5 : 7}>
                    Alle Assets haben eine verantwortliche Person.
                  </td>
                </tr>
              )}
              {all.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-slate-500" colSpan={LEAN ? 5 : 7}>
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

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');
const today = new Date().toISOString().slice(0, 10);

/**
 * Lieferantenbewertung (A.5.19 bis A.5.22, NIS2 Art. 21 Abs. 2 d): womit die Sicherheit belegt
 * ist, wann zuletzt bewertet und wann wieder fällig. Der Prüftermin erscheint in den Fristen.
 */
function SupplierForm({
  asset,
  onDone,
  onCancel,
}: {
  asset: AssetRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<{ id: string; filename: string } | null>(
    asset.supplierEvidenceFileId
      ? { id: asset.supplierEvidenceFileId, filename: asset.supplierEvidenceFilename ?? 'Nachweis' }
      : null,
  );
  const save = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/assets/${asset.id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
    onSuccess: onDone,
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_10rem_10rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const t = (k: string) => String(f.get(k) ?? '').trim() || null;
        save.mutate({
          supplierEvidence: t('supplierEvidence'),
          supplierEvidenceFileId: file?.id ?? null,
          supplierAssessedAt: t('supplierAssessedAt'),
          supplierNextReviewAt: t('supplierNextReviewAt'),
        });
      }}
    >
      <ErrorNote error={save.error} />
      <div>
        <label className="label" htmlFor={`ev-${asset.id}`}>
          Nachweis
        </label>
        <input
          id={`ev-${asset.id}`}
          name="supplierEvidence"
          className="input"
          defaultValue={asset.supplierEvidence ?? ''}
          placeholder="z. B. ISO-27001-Zertifikat bis 2027, Vertrag mit Sicherheitsanhang"
        />
      </div>
      <FileField
        label="Datei"
        hint="freiwillig"
        value={file?.id ?? null}
        filename={file?.filename}
        onChange={setFile}
      />
      <div>
        <label className="label" htmlFor={`as-${asset.id}`}>
          Bewertet am
        </label>
        <input
          id={`as-${asset.id}`}
          name="supplierAssessedAt"
          type="date"
          className="input"
          defaultValue={asset.supplierAssessedAt ?? ''}
        />
      </div>
      <div>
        <label className="label" htmlFor={`nx-${asset.id}`}>
          Nächste Prüfung
        </label>
        <input
          id={`nx-${asset.id}`}
          name="supplierNextReviewAt"
          type="date"
          className="input"
          defaultValue={asset.supplierNextReviewAt ?? ''}
        />
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          Speichern
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
