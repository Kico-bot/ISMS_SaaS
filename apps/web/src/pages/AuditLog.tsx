import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useState } from 'react';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';

interface Entry {
  id: number;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  ip: string | null;
  diff: { request?: Record<string, unknown>; query?: Record<string, unknown> } | null;
}

interface Page {
  total: number;
  limit: number;
  offset: number;
  rows: Entry[];
}

interface Facets {
  entityTypes: { entityType: string; count: number }[];
  actors: { actorUserId: string; actorName: string; count: number }[];
}

const ACTION_LABEL: Record<string, string> = {
  create: 'angelegt',
  update: 'geändert',
  delete: 'gelöscht',
  approve: 'freigegeben',
  login: 'angemeldet',
  logout: 'abgemeldet',
  export: 'ausgeleitet',
};

/** Die Gegenstandsart kommt aus dem Pfad des Requests — hier bekommt sie ihren Fachnamen. */
const ENTITY_LABEL: Record<string, string> = {
  actions: 'KVP-Maßnahmen',
  assets: 'Assets',
  audits: 'Audits',
  auth: 'Anmeldung',
  competence: 'Kompetenz',
  context: 'Kontext & Ziele',
  continuity: 'Notfallplanung',
  'continuity-plans': 'Notfallpläne',
  documents: 'Dokumente',
  evidence: 'Nachweise',
  exports: 'Ausleitungen',
  files: 'Dateien',
  findings: 'Feststellungen',
  frameworks: 'Frameworks',
  incidents: 'Sicherheitsvorfälle',
  kpis: 'Kennzahlen',
  measures: 'Maßnahmen',
  members: 'Mitglieder',
  'management-reviews': 'Managementbewertungen',
  notifications: 'Erinnerungen',
  persons: 'Beschäftigte',
  playbooks: 'Playbooks',
  processes: 'Geschäftsprozesse',
  'processing-activities': 'Verarbeitungen',
  risks: 'Risiken',
  soa: 'Anwendbarkeitserklärung',
  tenant: 'Mandanteneinstellungen',
  trainings: 'Schulungen',
};

const PAGE_SIZE = 50;
const entity = (t: string) => ENTITY_LABEL[t] ?? t;
const when = (v: string) => new Date(v).toLocaleString('de-DE');

/**
 * Änderungsprotokoll. Die Tabelle dahinter ist append-only — auch die ISMS-Leitung kann ihre
 * eigenen Spuren nicht nachträglich glätten, weil der Anwendungsrolle UPDATE und DELETE darauf
 * entzogen sind.
 */
export function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);

  const facets = useQuery({
    queryKey: ['auditlog-facets'],
    queryFn: () => api<Facets>('/audit-log/facets'),
  });

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (entityType) params.set('entityType', entityType);
  if (action) params.set('action', action);
  if (actorUserId) params.set('actorUserId', actorUserId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const page = useQuery({
    queryKey: ['auditlog', params.toString()],
    queryFn: () => api<Page>(`/audit-log?${params.toString()}`),
  });

  /** Beim Ändern eines Filters wieder auf die erste Seite. */
  const filter = (set: (v: string) => void) => (v: string) => {
    set(v);
    setOffset(0);
  };

  const rows = page.data?.rows ?? [];
  const total = page.data?.total ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Änderungsprotokoll"
        norm={['iso:A.8.15', 'bsi:OPS.1.1.5']}
        description="Wer hat wann was geändert, einschließlich Anmeldungen und Exporte. Jeder Eintrag entsteht automatisch und lässt sich nachträglich weder ändern noch löschen."
      />
      <ErrorNote error={page.error ?? facets.error} />

      <section className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-44">
          <label className="label" htmlFor="entityType">
            Gegenstand
          </label>
          <select
            id="entityType"
            className="input"
            value={entityType}
            onChange={(e) => filter(setEntityType)(e.target.value)}
          >
            <option value="">alle</option>
            {facets.data?.entityTypes.map((t) => (
              <option key={t.entityType} value={t.entityType}>
                {entity(t.entityType)} ({t.count})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-36">
          <label className="label" htmlFor="action">
            Vorgang
          </label>
          <select
            id="action"
            className="input"
            value={action}
            onChange={(e) => filter(setAction)(e.target.value)}
          >
            <option value="">alle</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-44">
          <label className="label" htmlFor="actor">
            Handelnde Person
          </label>
          <select
            id="actor"
            className="input"
            value={actorUserId}
            onChange={(e) => filter(setActorUserId)(e.target.value)}
          >
            <option value="">alle</option>
            {facets.data?.actors.map((a) => (
              <option key={a.actorUserId} value={a.actorUserId}>
                {a.actorName} ({a.count})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">
            Von
          </label>
          <input
            id="from"
            type="date"
            className="input w-auto"
            value={from}
            onChange={(e) => filter(setFrom)(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="to">
            Bis
          </label>
          <input
            id="to"
            type="date"
            className="input w-auto"
            value={to}
            onChange={(e) => filter(setTo)(e.target.value)}
          />
        </div>
        {(entityType || action || actorUserId || from || to) && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setEntityType('');
              setAction('');
              setActorUserId('');
              setFrom('');
              setTo('');
              setOffset(0);
            }}
          >
            Filter zurücksetzen
          </button>
        )}
      </section>

      {page.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Keine Einträge" hint="Für die gewählten Filter liegt nichts vor." />
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Zeitpunkt</th>
                  <th className="px-4 py-2 font-medium">Person</th>
                  <th className="px-4 py-2 font-medium">Vorgang</th>
                  <th className="px-4 py-2 font-medium">Gegenstand</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((e) => (
                  <Fragment key={e.id}>
                    <tr>
                      <td className="whitespace-nowrap px-4 py-2 align-top text-xs tabular-nums text-slate-600">
                        {when(e.at)}
                      </td>
                      <td className="px-4 py-2 align-top text-slate-800">
                        {e.actorName ?? <span className="text-slate-400">System</span>}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <span
                          className={clsx(
                            'rounded px-1.5 py-0.5 text-xs',
                            e.action === 'delete'
                              ? 'bg-red-50 text-level-critical'
                              : e.action === 'export'
                                ? 'bg-amber-50 text-level-medium'
                                : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {ACTION_LABEL[e.action] ?? e.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-top text-slate-700">
                        {entity(e.entityType)}
                        {e.entityId && (
                          <span className="ml-2 font-mono text-xs text-slate-400">{e.entityId}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top text-right">
                        {e.diff && (
                          <button
                            type="button"
                            className="text-xs text-brand-700 underline"
                            onClick={() => setOpenId(openId === e.id ? null : e.id)}
                          >
                            {openId === e.id ? 'schließen' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {openId === e.id && e.diff && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-4 py-2">
                          <pre className="overflow-x-auto text-xs text-slate-600">
                            {JSON.stringify(e.diff, null, 2)}
                          </pre>
                          {e.ip && <p className="mt-1 text-xs text-slate-400">Herkunft: {e.ip}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              {offset + 1} bis {Math.min(offset + PAGE_SIZE, total)} von {total}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Zurück
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Weiter
              </button>
            </span>
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Festgehalten wird, was abgeschickt wurde, nicht der Zustand davor und danach. Welchen Wert ein Feld
        vorher hatte, steht im Verlauf des jeweiligen Bereichs, etwa in den Dokumentfassungen, den
        Risikobewertungen oder der abgeschlossenen Managementbewertung.
      </p>
    </>
  );
}
