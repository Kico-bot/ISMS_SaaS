import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Progress,
  Spinner,
  StatTile,
  StatusBadge,
} from '../components/ui';
import { FileField } from '../components/FileField';
import { api, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface DocumentRow {
  id: string;
  key: string;
  title: string;
  kind: string;
  status: string;
  classification: string;
  nextReviewAt: string | null;
  reviewOverdue: boolean | null;
  ownerName: string | null;
  currentVersion: string | null;
  publishedAt: string | null;
  ackTotal: number | null;
  ackDone: number | null;
}

interface DocumentVersion {
  id: string;
  versionLabel: string;
  changeNote: string | null;
  authorUserId: string;
  fileId: string | null;
  filename: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface Campaign {
  id: string;
  subject: string;
  dueAt: string | null;
  versionLabel: string;
  total: number;
  done: number;
}

interface DocumentDetail extends DocumentRow {
  reviewIntervalMonths: number;
  currentVersionId: string | null;
  versions: DocumentVersion[];
  campaigns: Campaign[];
  requirements: { id: string; framework: string; refCode: string; title: string }[];
}

interface MyAcknowledgement {
  campaignId: string;
  subject: string;
  dueAt: string | null;
  documentId: string;
  title: string;
  versionLabel: string;
  overdue: boolean | null;
}

const KIND_LABEL: Record<string, string> = {
  policy: 'Leitlinie',
  procedure: 'Verfahren',
  work_instruction: 'Arbeitsanweisung',
  record: 'Aufzeichnung',
  evidence: 'Nachweis',
  other: 'Sonstiges',
};
const CLASSIFICATION_LABEL: Record<string, string> = {
  public: 'Öffentlich',
  internal: 'Intern',
  confidential: 'Vertraulich',
  strictly_confidential: 'Streng vertraulich',
};

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

export function DocumentsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['documents'],
    queryFn: () => api<{ items: DocumentRow[] }>('/documents?size=200'),
  });
  const mine = useQuery({
    queryKey: ['my-acks'],
    queryFn: () => api<MyAcknowledgement[]>('/documents/my-acknowledgements'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['my-acks'] });
  };

  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<DocumentRow>('/documents', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (doc) => {
      invalidate();
      setCreating(false);
      setOpenId(doc.id);
    },
  });
  const confirmRead = useMutation({
    mutationFn: (campaignId: string) =>
      api(`/documents/acknowledgements/${campaignId}/confirm`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: invalidate,
  });

  const rows = list.data?.items ?? [];
  const published = rows.filter((d) => d.status === 'published').length;
  const inProgress = rows.filter((d) => d.status === 'draft' || d.status === 'in_review').length;
  const overdue = rows.filter((d) => d.reviewOverdue).length;

  return (
    <>
      <PageHeader
        eyebrow="Normen & Register"
        title="Dokumentenlenkung"
        description="Gelenkte Dokumente nach ISO 27001 Kap. 7.5: jede Fassung bleibt erhalten, freigegeben wird im Vier-Augen-Prinzip, und wer eine Leitlinie gelesen hat, ist belegbar."
        actions={
          can('document.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Dokument anlegen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? create.error ?? confirmRead.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Freigegeben" value={published} tone="good" />
        <StatTile label="In Arbeit" value={inProgress} />
        <StatTile
          label="Prüfung überfällig"
          value={overdue}
          tone={overdue > 0 ? 'bad' : 'good'}
          hint="Turnusmäßige Überprüfung nach Kap. 7.5.2"
        />
        <StatTile
          label="Von mir zu lesen"
          value={mine.data?.length ?? 0}
          tone={(mine.data?.length ?? 0) > 0 ? 'warn' : 'good'}
        />
      </section>

      {(mine.data?.length ?? 0) > 0 && (
        <section className="card mb-6 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-medium text-slate-700">Ihre offenen Lesebestätigungen</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {mine.data!.map((a) => (
              <li
                key={a.campaignId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-500">
                    Fassung {a.versionLabel}
                    {a.dueAt && (
                      <span className={clsx('ml-2', a.overdue && 'font-medium text-level-critical')}>
                        {a.overdue ? 'überfällig seit' : 'bis'} {date(a.dueAt)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-ghost py-1 text-xs"
                    onClick={() => setOpenId(a.documentId)}
                  >
                    Öffnen
                  </button>
                  <button
                    type="button"
                    className="btn-primary py-1 text-xs"
                    disabled={confirmRead.isPending}
                    onClick={() => confirmRead.mutate(a.campaignId)}
                  >
                    Kenntnis bestätigen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              key: String(f.get('key')).trim(),
              title: String(f.get('title')).trim(),
              kind: String(f.get('kind')),
              classification: String(f.get('classification')),
              reviewIntervalMonths: Number(f.get('reviewIntervalMonths')),
            });
          }}
        >
          <div>
            <label className="label" htmlFor="key">
              Kürzel
            </label>
            <input id="key" name="key" required className="input" placeholder="RL-01" autoFocus />
          </div>
          <div className="lg:col-span-2">
            <label className="label" htmlFor="title">
              Titel
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              className="input"
              placeholder="Informationssicherheitsleitlinie"
            />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Art
            </label>
            <select id="kind" name="kind" className="input" defaultValue="policy">
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="classification">
              Einstufung
            </label>
            <select id="classification" name="classification" className="input" defaultValue="internal">
              {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="reviewIntervalMonths">
              Prüfintervall (Monate)
            </label>
            <input
              id="reviewIntervalMonths"
              name="reviewIntervalMonths"
              type="number"
              min={0}
              max={120}
              defaultValue={12}
              className="input"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Anlegen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch keine gelenkten Dokumente"
          hint="Beginnen Sie mit der Informationssicherheitsleitlinie — sie ist die einzige Aufzeichnung, die ISO 27001 ausdrücklich von der Leitung verlangt."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-24">Kürzel</th>
                <th className="th">Dokument</th>
                <th className="th w-36">Art</th>
                <th className="th w-28">Fassung</th>
                <th className="th w-32">Status</th>
                <th className="th w-32">Nächste Prüfung</th>
                <th className="th w-40">Kenntnisnahme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(d.id)}>
                  <td className="td font-mono text-xs text-slate-600">{d.key}</td>
                  <td className="td">
                    <span className="font-medium text-slate-800">{d.title}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {CLASSIFICATION_LABEL[d.classification] ?? d.classification}
                    </span>
                  </td>
                  <td className="td text-xs text-slate-600">{KIND_LABEL[d.kind] ?? d.kind}</td>
                  <td className="td text-xs tabular-nums text-slate-600">{d.currentVersion ?? '–'}</td>
                  <td className="td">
                    <StatusBadge status={d.status} />
                  </td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      d.reviewOverdue ? 'font-medium text-level-critical' : 'text-slate-600',
                    )}
                  >
                    {date(d.nextReviewAt)}
                  </td>
                  <td className="td">
                    {d.ackTotal ? (
                      <>
                        <p className="mb-1 text-xs tabular-nums text-slate-600">
                          {d.ackDone} von {d.ackTotal}
                        </p>
                        <Progress value={d.ackDone ?? 0} max={d.ackTotal} tone="level" />
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">nicht angefordert</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <DocumentPanel id={openId} onClose={() => setOpenId(null)} onChanged={invalidate} />}
    </>
  );
}

function DocumentPanel({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can, session } = useAuth();
  const qc = useQueryClient();
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [versionFile, setVersionFile] = useState<{ id: string; filename: string } | null>(null);

  const detail = useQuery({
    queryKey: ['document', id],
    queryFn: () => api<DocumentDetail>(`/documents/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['document', id] });
    onChanged();
  };

  const addVersion = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/documents/${id}/versions`, { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });
  const submit = useMutation({
    mutationFn: (versionId: string) =>
      api(`/documents/${id}/versions/${versionId}/submit`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (versionId: string) =>
      api(`/documents/${id}/versions/${versionId}/approve`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const requestAck = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/documents/${id}/acknowledgements`, { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });

  const d = detail.data;
  const writable = can('document.write');
  const myUserId = session?.user.id;

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Dokument bearbeiten"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-slate-500">{d.key}</p>
                <h2 className="text-lg font-semibold text-slate-900">{d.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {KIND_LABEL[d.kind] ?? d.kind} ·{' '}
                  {CLASSIFICATION_LABEL[d.classification] ?? d.classification} · Prüfung alle{' '}
                  {d.reviewIntervalMonths} Monate
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Schließen
                </button>
              </div>
            </div>

            <ErrorNote error={addVersion.error ?? submit.error ?? approve.error ?? requestAck.error} />

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Fassungen</h3>
              {d.versions.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">Noch keine Fassung hinterlegt.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.versions.map((v) => {
                    const isCurrent = v.id === d.currentVersionId;
                    const ownVersion = v.authorUserId === myUserId;
                    return (
                      <li
                        key={v.id}
                        className={clsx(
                          'rounded border px-3 py-2',
                          isCurrent ? 'border-brand-200 bg-brand-50' : 'border-slate-200',
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                              Fassung {v.versionLabel}
                              {isCurrent && (
                                <span className="ml-2 text-xs font-normal text-brand-700">gültig</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-500">
                              {v.publishedAt
                                ? `freigegeben am ${date(v.publishedAt)}`
                                : v.submittedAt
                                  ? `zur Prüfung vorgelegt am ${date(v.submittedAt)}`
                                  : `Entwurf vom ${date(v.createdAt)}`}
                              {v.changeNote && ` · ${v.changeNote}`}
                            </p>
                            {v.fileId && v.filename && (
                              <button
                                type="button"
                                className="mt-0.5 text-xs text-brand-700 underline"
                                onClick={() => void downloadFile(v.fileId!, v.filename!)}
                              >
                                {v.filename}
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {writable && !v.submittedAt && !v.publishedAt && (
                              <button
                                type="button"
                                className="btn-ghost py-0.5 text-xs"
                                onClick={() => submit.mutate(v.id)}
                              >
                                Zur Prüfung vorlegen
                              </button>
                            )}
                            {can('document.approve') && !v.publishedAt && (
                              <button
                                type="button"
                                className="btn-ghost py-0.5 text-xs"
                                disabled={ownVersion}
                                title={
                                  ownVersion
                                    ? 'Vier-Augen-Prinzip: die eigene Fassung darf nicht selbst freigegeben werden.'
                                    : undefined
                                }
                                onClick={() => approve.mutate(v.id)}
                              >
                                Freigeben
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {writable && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    addVersion.mutate({
                      versionLabel: String(f.get('versionLabel')).trim(),
                      changeNote: String(f.get('changeNote') || '') || undefined,
                      fileId: versionFile?.id ?? null,
                    });
                    e.currentTarget.reset();
                    setVersionFile(null);
                  }}
                >
                  <div className="w-24">
                    <label className="label" htmlFor="versionLabel">
                      Fassung
                    </label>
                    <input
                      id="versionLabel"
                      name="versionLabel"
                      required
                      className="input"
                      placeholder="1.0"
                    />
                  </div>
                  <div className="min-w-48 flex-1">
                    <label className="label" htmlFor="changeNote">
                      Änderung
                    </label>
                    <input
                      id="changeNote"
                      name="changeNote"
                      className="input"
                      placeholder="z. B. Geltungsbereich erweitert"
                    />
                  </div>
                  <FileField
                    label="Fassung als Datei"
                    hint="optional — sonst gilt der Text im ISMS"
                    value={versionFile?.id ?? null}
                    filename={versionFile?.filename}
                    onChange={setVersionFile}
                  />
                  <button type="submit" className="btn-ghost" disabled={addVersion.isPending}>
                    Neue Fassung
                  </button>
                </form>
              )}
            </section>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Lesebestätigungen</h3>
              {d.campaigns.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">
                  Noch keine Kenntnisnahme angefordert. Sie lässt sich nur zu einer freigegebenen Fassung
                  anfordern.
                </p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.campaigns.map((c) => (
                    <li key={c.id} className="rounded border border-slate-200 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-800">{c.subject}</p>
                          <p className="text-xs text-slate-500">
                            Fassung {c.versionLabel} · {c.done} von {c.total} bestätigt
                            {c.dueAt && ` · bis ${date(c.dueAt)}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-ghost py-0.5 text-xs"
                          onClick={() => setCampaignId(campaignId === c.id ? null : c.id)}
                        >
                          {campaignId === c.id ? 'Ausblenden' : 'Wer fehlt?'}
                        </button>
                      </div>
                      <div className="mt-2">
                        <Progress value={c.done} max={Math.max(c.total, 1)} tone="level" />
                      </div>
                      {campaignId === c.id && <PendingList campaignId={c.id} />}
                    </li>
                  ))}
                </ul>
              )}
              {can('document.publish') && d.currentVersionId && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    requestAck.mutate({
                      subject: String(f.get('subject') || '') || undefined,
                      dueAt: String(f.get('dueAt') || '') || undefined,
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <div className="min-w-48 flex-1">
                    <label className="label" htmlFor="subject">
                      Betreff
                    </label>
                    <input
                      id="subject"
                      name="subject"
                      className="input"
                      placeholder={`Bitte lesen: ${d.title}`}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="dueAt">
                      Bis
                    </label>
                    <input id="dueAt" name="dueAt" type="date" className="input w-auto" />
                  </div>
                  <button type="submit" className="btn-ghost" disabled={requestAck.isPending}>
                    Kenntnisnahme anfordern
                  </button>
                </form>
              )}
            </section>

            {d.requirements.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-700">Nachweis für</h3>
                <ul className="space-y-1">
                  {d.requirements.map((r) => (
                    <li key={r.id} className="text-sm text-slate-700">
                      <span className="font-mono text-xs text-slate-500">{r.refCode}</span> {r.title}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function PendingList({ campaignId }: { campaignId: string }) {
  const q = useQuery({
    queryKey: ['ack-pending', campaignId],
    queryFn: () =>
      api<{ id: string; name: string; department: string | null; acknowledgedAt: string | null }[]>(
        `/documents/acknowledgements/${campaignId}`,
      ),
  });
  if (q.isLoading) return <Spinner label="Lädt …" />;
  const rows = q.data ?? [];
  return (
    <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100 pt-1">
      {rows.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-2 py-1 text-xs">
          <span className={clsx(p.acknowledgedAt ? 'text-slate-500' : 'font-medium text-slate-800')}>
            {p.name}
            {p.department && <span className="ml-1 text-slate-400">{p.department}</span>}
          </span>
          <span className={clsx('tabular-nums', p.acknowledgedAt ? 'text-slate-500' : 'text-level-medium')}>
            {p.acknowledgedAt ? `bestätigt ${date(p.acknowledgedAt)}` : 'offen'}
          </span>
        </li>
      ))}
    </ul>
  );
}
