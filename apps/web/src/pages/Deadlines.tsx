import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorNote, PageHeader, relativeDays, Spinner, StatTile } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

type Kind =
  | 'measure'
  | 'action'
  | 'finding'
  | 'document_review'
  | 'acknowledgement'
  | 'evidence'
  | 'skill'
  | 'training'
  | 'risk_review'
  | 'risk_acceptance'
  | 'continuity_exercise'
  | 'reporting_obligation'
  | 'objective'
  | 'audit';

interface Deadline {
  kind: Kind;
  id: string;
  refNo: string | null;
  title: string;
  context: string | null;
  dueAt: string;
  ownerPersonId: string | null;
  ownerName: string | null;
  daysLeft: number;
  severity: 'critical' | 'high' | 'normal';
}

/** Wohin der Eintrag führt und wie er heißt. */
const KIND: Record<Kind, { label: string; to: string }> = {
  reporting_obligation: { label: 'Meldefrist', to: '/incidents' },
  finding: { label: 'Feststellung', to: '/findings' },
  action: { label: 'KVP-Maßnahme', to: '/actions' },
  measure: { label: 'Maßnahme', to: '/measures' },
  risk_review: { label: 'Risiko erneut prüfen', to: '/risks' },
  risk_acceptance: { label: 'Risikoakzeptanz', to: '/risks' },
  document_review: { label: 'Dokumentenprüfung', to: '/documents' },
  acknowledgement: { label: 'Lesebestätigung', to: '/documents' },
  evidence: { label: 'Nachweis', to: '/measures' },
  skill: { label: 'Kompetenznachweis', to: '/competence' },
  training: { label: 'Schulung', to: '/competence' },
  continuity_exercise: { label: 'Notfallübung', to: '/continuity' },
  objective: { label: 'Sicherheitsziel', to: '/context' },
  audit: { label: 'Audit', to: '/audits' },
};

const HORIZONS = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
  { days: 365, label: '1 Jahr' },
];

const date = (v: string) => new Date(v).toLocaleDateString('de-DE');

/**
 * Wiedervorlage. Ein ISMS scheitert selten an fehlenden Registern, sondern daran, dass niemand
 * merkt, wann etwas fällig wird. Hier steht alles Datierte an einer Stelle — vom überfälligen
 * Nachweis bis zur laufenden Meldefrist nach NIS2.
 */
export function DeadlinesPage() {
  const { can } = useAuth();
  const [horizon, setHorizon] = useState(30);
  const [mine, setMine] = useState(false);
  const [kind, setKind] = useState<Kind | 'all'>('all');

  const list = useQuery({
    queryKey: ['deadlines', horizon, mine],
    queryFn: () => api<Deadline[]>(`/deadlines?horizonDays=${horizon}&mine=${mine}`),
  });

  const rows = (list.data ?? []).filter((r) => kind === 'all' || r.kind === kind);
  const overdue = rows.filter((r) => r.daysLeft < 0);
  const thisWeek = rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 7);
  const critical = rows.filter((r) => r.severity === 'critical');
  const kinds = [...new Set((list.data ?? []).map((r) => r.kind))];

  return (
    <>
      <PageHeader
        eyebrow="Überblick"
        title="Fristen"
        norm={['iso:9.1', 'iso:10.2']}
        description="Jede datierte Verpflichtung des ISMS an einer Stelle: Maßnahmen, Prüffristen, Nachweise, Schulungen, Notfallübungen und die Meldefristen nach NIS2 und DSGVO."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={mine}
                onChange={(e) => setMine(e.target.checked)}
                className="rounded border-slate-300"
              />
              Nur meine
            </label>
            <select
              className="input w-auto"
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              aria-label="Zeitraum"
            >
              {HORIZONS.map((h) => (
                <option key={h.days} value={h.days}>
                  {h.label}
                </option>
              ))}
            </select>
          </>
        }
      />
      <ErrorNote error={list.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Überfällig"
          value={overdue.length}
          hint="Frist bereits verstrichen"
          tone={overdue.length > 0 ? 'bad' : 'good'}
        />
        <StatTile label="Diese Woche" value={thisWeek.length} hint="in den nächsten 7 Tagen" />
        <StatTile
          label="Meldefristen"
          value={critical.length}
          hint="NIS2 / DSGVO, laufend"
          tone={critical.length > 0 ? 'bad' : 'good'}
        />
        <StatTile
          label="Im Zeitraum"
          value={rows.length}
          hint={`bis ${HORIZONS.find((h) => h.days === horizon)?.label}`}
        />
      </section>

      {kinds.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          <FilterChip active={kind === 'all'} onClick={() => setKind('all')}>
            Alle
          </FilterChip>
          {kinds.map((k) => (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
              {KIND[k].label}
            </FilterChip>
          ))}
        </div>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nichts fällig"
          hint={
            mine
              ? 'Auf Sie ist im gewählten Zeitraum nichts terminiert.'
              : 'Im gewählten Zeitraum steht nichts an. Ein längerer Zeitraum zeigt mehr.'
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Fällig</th>
                <th className="px-4 py-2 font-medium">Art</th>
                <th className="px-4 py-2 font-medium">Vorgang</th>
                <th className="px-4 py-2 font-medium">Verantwortlich</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}-${r.dueAt}`} className={clsx(r.daysLeft < 0 && 'bg-red-50/60')}>
                  <td className="whitespace-nowrap px-4 py-2 align-top">
                    <span
                      className={clsx(
                        'text-xs font-medium',
                        r.daysLeft < 0
                          ? 'text-level-critical'
                          : r.daysLeft <= 7
                            ? 'text-level-high'
                            : 'text-slate-600',
                      )}
                    >
                      {relativeDays(r.daysLeft)}
                    </span>
                    <span className="block text-xs text-slate-400">{date(r.dueAt)}</span>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <Link to={KIND[r.kind].to} className="text-xs text-brand-700 underline">
                      {KIND[r.kind].label}
                    </Link>
                    {r.severity === 'critical' && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-level-critical">
                        Frist
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <span className="text-slate-800">{r.title}</span>
                    {r.refNo && <span className="ml-2 font-mono text-xs text-slate-400">{r.refNo}</span>}
                    {r.context && <span className="block text-xs text-slate-500">{r.context}</span>}
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-slate-600">{r.ownerName ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {can('tenant.settings') && <ReminderPanel />}
    </>
  );
}

interface OutboxMessage {
  to: string;
  subject: string;
  text: string;
  at: string;
}

/**
 * Stand des Erinnerungsversands. Ohne eingerichteten Mailserver erzeugt die Anwendung die
 * Nachrichten trotzdem — hier ist zu sehen, wer welche bekäme, bevor tatsächlich zugestellt wird.
 */
function ReminderPanel() {
  const [open, setOpen] = useState(false);
  const outbox = useQuery({
    queryKey: ['notifications-outbox'],
    queryFn: () => api<{ delivering: boolean; messages: OutboxMessage[] }>('/notifications/outbox'),
    enabled: open,
  });
  const preview = useQuery({
    queryKey: ['notifications-preview'],
    queryFn: () => api<{ to: string; subject: string; text: string }[]>('/notifications/digest/preview'),
    enabled: open,
  });
  const send = useMutation({
    mutationFn: () =>
      api<{ sent: number; failed: number; delivering: boolean }>('/notifications/digest/send', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => void outbox.refetch(),
  });

  return (
    <section className="mt-8">
      <button type="button" className="text-sm text-brand-700 underline" onClick={() => setOpen(!open)}>
        {open ? 'Erinnerungen ausblenden' : 'Erinnerungen per E-Mail'}
      </button>

      {open && (
        <div className="card mt-2 p-4">
          <ErrorNote error={outbox.error ?? preview.error ?? send.error} />
          <p className="mb-3 text-sm text-slate-600">
            Jeden Werktag bekommt jede verantwortliche Person eine Übersicht ihrer eigenen Fristen. Sie
            entsteht aus genau dieser Liste, nicht aus einer zweiten Aufgabenverwaltung. Dafür muss der
            Hintergrundprozess laufen (<code className="text-xs">JOBS_ENABLED=true</code>).
          </p>
          <p className="mb-3 text-sm">
            Zustellung:{' '}
            {outbox.data?.delivering ? (
              <span className="font-medium text-level-low">über SMTP eingerichtet</span>
            ) : (
              <span className="font-medium text-level-medium">
                nicht eingerichtet. Nachrichten werden erstellt, aber nicht verschickt (
                <code className="text-xs">MAIL_DRIVER=log</code>)
              </span>
            )}
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? 'Erzeuge …' : 'Jetzt erzeugen'}
            </button>
            {send.data && (
              <span className="text-xs text-slate-600">
                {send.data.sent} Nachricht(en)
                {send.data.failed > 0 && `, ${send.data.failed} fehlgeschlagen`}
                {send.data.delivering ? ' verschickt' : ' erzeugt (nicht verschickt)'}
              </span>
            )}
          </div>

          {preview.data && preview.data.length > 0 ? (
            <ul className="space-y-2">
              {preview.data.map((m) => (
                <li key={m.to} className="rounded border border-slate-200 px-3 py-2">
                  <p className="text-sm text-slate-800">
                    {m.subject} <span className="text-xs text-slate-500">an {m.to}</span>
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{m.text}</pre>
                </li>
              ))}
            </ul>
          ) : (
            preview.isFetched && (
              <p className="text-sm text-slate-500">
                Zurzeit ginge nichts raus. Erinnerungen gehen nur an Personen mit hinterlegter E-Mail-Adresse,
                denen eine Frist zugeordnet ist.
              </p>
            )
          )}

          {outbox.data?.messages[0] && (
            <p className="mt-3 text-xs text-slate-400">
              Zuletzt erzeugt: {new Date(outbox.data.messages[0].at).toLocaleString('de-DE')} an{' '}
              {outbox.data.messages[0].to}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-full border px-3 py-1 text-xs',
        active
          ? 'border-brand-300 bg-brand-50 text-brand-800'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}
