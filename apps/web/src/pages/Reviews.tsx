import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import {
  EmptyState,
  ErrorNote,
  formatNumber,
  NormHint,
  PageHeader,
  Spinner,
  StatTile,
  StatusBadge,
} from '../components/ui';
import { FileField } from '../components/FileField';
import { api, downloadFile } from '../lib/api';
import { PARTY_CATEGORY_LABEL, PESTLE_DIMENSION_LABEL } from '../lib/labels';
import { useAuth } from '../lib/auth-context';

interface ReviewRow {
  id: string;
  heldAt: string;
  status: string;
  decisions: string | null;
  chairName: string | null;
  actionCount: number;
}

interface ReviewInputs {
  periodFrom: string;
  periodTo: string;
  previousReviewId: string | null;
  frozenAt?: string;
  priorActions: { refNo: string; title: string; status: string; dueAt: string | null }[];
  contextChanges: { kind: string; category: string; title: string; changedAt: string }[];
  nonconformities: { total?: number; major?: number; open?: number; verified?: number; overdue?: number };
  kpis: {
    name: string;
    unit: string | null;
    target: string | null;
    value: string | null;
    measuredAt: string | null;
    targetMet: boolean | null;
  }[];
  audits: {
    refNo: string;
    title: string;
    kind: string;
    plannedTo: string | null;
    findings: number;
    majorFindings: number;
  }[];
  objectives: {
    title: string;
    status: string;
    targetValue: string | null;
    currentValue: string | null;
    unit: string | null;
    dueDate: string | null;
  }[];
  interestedParties: { name: string; category: string; expectations: string | null }[];
  risks: {
    total?: number;
    open?: number;
    aboveAppetite?: number;
    accepted?: number;
    reviewOverdue?: number;
    avgResidual?: number;
  };
  riskTreatment: { total?: number; implemented?: number; overdue?: number };
  incidents: {
    total?: number;
    severe?: number;
    dataBreaches?: number;
    nis2Relevant?: number;
    missedDeadlines?: number;
  };
  improvements: {
    refNo: string;
    title: string;
    status: string;
    dueAt: string | null;
    ownerName: string | null;
  }[];
}

interface ReviewDetail extends ReviewRow {
  inputs: ReviewInputs;
  minutesFile: { id: string; filename: string } | null;
  actions: {
    id: string;
    refNo: string;
    title: string;
    status: string;
    dueAt: string | null;
    ownerName: string | null;
  }[];
}

const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');
const n = (v: number | undefined) => v ?? 0;

export function ReviewsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['reviews'], queryFn: () => api<ReviewRow[]>('/management-reviews') });
  const preview = useQuery({
    queryKey: ['review-preview'],
    queryFn: () => api<ReviewInputs>('/management-reviews/preview'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['reviews'] });
    void qc.invalidateQueries({ queryKey: ['review-preview'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<ReviewDetail>('/management-reviews', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (r) => {
      invalidate();
      setCreating(false);
      setOpenId(r.id);
    },
  });

  const rows = list.data ?? [];
  const p = preview.data;

  return (
    <>
      <PageHeader
        eyebrow="Prüfung & Verbesserung"
        title="Managementbewertung"
        norm="iso:9.3"
        description="Die Bewertung durch die Leitung nach ISO 27001 Kap. 9.3. Die Tagesordnung nach 9.3.2 a)–g) berechnet sich aus dem laufenden ISMS — wer sauber pflegt, muss sie nicht schreiben."
        actions={
          can('audit.write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Sitzung ansetzen
            </button>
          ) : undefined
        }
      />
      <ErrorNote error={list.error ?? preview.error ?? create.error} />

      {p && (
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Offene Nichtkonformitäten"
            value={n(p.nonconformities.open)}
            hint={`${n(p.nonconformities.major)} Hauptabweichungen`}
            tone={n(p.nonconformities.major) > 0 ? 'bad' : n(p.nonconformities.open) > 0 ? 'warn' : 'good'}
          />
          <StatTile
            label="Risiken über Appetit"
            value={n(p.risks.aboveAppetite)}
            hint={`Ø Restrisiko ${formatNumber(p.risks.avgResidual)}`}
            tone={n(p.risks.aboveAppetite) > 0 ? 'bad' : 'good'}
          />
          <StatTile
            label="Maßnahmen umgesetzt"
            value={`${n(p.riskTreatment.implemented)} / ${n(p.riskTreatment.total)}`}
            hint={
              n(p.riskTreatment.overdue) > 0 ? `${n(p.riskTreatment.overdue)} überfällig` : 'keine überfällig'
            }
            tone={n(p.riskTreatment.overdue) > 0 ? 'warn' : 'good'}
          />
          <StatTile
            label="Verpasste Meldefristen"
            value={n(p.incidents.missedDeadlines)}
            hint={`${n(p.incidents.total)} Vorfälle im Zeitraum`}
            tone={n(p.incidents.missedDeadlines) > 0 ? 'bad' : 'good'}
          />
        </section>
      )}

      {creating && (
        <form
          className="card mb-6 flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({ heldAt: String(f.get('heldAt')) });
          }}
        >
          <div>
            <label className="label" htmlFor="heldAt">
              Sitzungsdatum
              <NormHint refs="iso:9.3" />
            </label>
            <input
              id="heldAt"
              name="heldAt"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="input w-auto"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            Ansetzen
          </button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
            Abbrechen
          </button>
          <p className="w-full text-xs text-slate-500">
            Die Eingaben werden beim Abschluss der Sitzung eingefroren — das Protokoll bleibt danach
            unverändert.
          </p>
        </form>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          Sitzungen <NormHint refs="iso:9.3" />
        </h2>
        {list.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Noch keine Managementbewertung"
            hint="Einmal jährlich ist üblich. Die Tagesordnung unten steht bereits — Sie brauchen nur ein Datum."
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="th w-32">Datum</th>
                  <th className="th">Beschlüsse</th>
                  <th className="th w-40">Vorsitz</th>
                  <th className="th w-32">Maßnahmen</th>
                  <th className="th w-32">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                    <td className="td text-sm tabular-nums text-slate-700">{date(r.heldAt)}</td>
                    <td className="td max-w-0 truncate text-sm text-slate-700">
                      {r.decisions ?? <span className="text-slate-400">noch offen</span>}
                    </td>
                    <td className="td text-xs text-slate-600">{r.chairName ?? '–'}</td>
                    <td className="td text-xs tabular-nums text-slate-600">{r.actionCount}</td>
                    <td className="td">
                      <StatusBadge status={r.status === 'closed' ? 'closed' : 'planned'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {p && (
        <section>
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-slate-500">
            Tagesordnung nach Kap. 9.3.2
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Aktueller Stand für den Zeitraum {date(p.periodFrom)} bis {date(p.periodTo)}
            {p.previousReviewId ? ' (seit der letzten Sitzung)' : ' (seit Beginn)'}.
          </p>
          <InputSections inputs={p} />
        </section>
      )}

      {openId && <ReviewPanel id={openId} onClose={() => setOpenId(null)} onChanged={invalidate} />}
    </>
  );
}

function Section({ letter, title, children }: { letter: string; title: string; children: ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-medium text-slate-700">
        <span className="mr-2 font-mono text-xs text-brand-600">{letter}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function InputSections({ inputs: p }: { inputs: ReviewInputs }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Section letter="a)" title="Status der Maßnahmen aus der vorherigen Bewertung">
        {p.priorActions.length === 0 ? (
          <Empty>
            {p.previousReviewId
              ? 'Keine offenen Maßnahmen aus der Vorsitzung.'
              : 'Erste Bewertung — keine Vorsitzung vorhanden.'}
          </Empty>
        ) : (
          <ul className="space-y-1">
            {p.priorActions.map((a) => (
              <li key={a.refNo} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                <span>
                  <span className="font-mono text-xs text-slate-500">{a.refNo}</span> {a.title}
                </span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section letter="b/c)" title="Veränderungen bei Themen und interessierten Parteien">
        {p.contextChanges.length === 0 ? (
          <Empty>Keine Änderungen im Kontext erfasst.</Empty>
        ) : (
          <ul className="space-y-1">
            {p.contextChanges.slice(0, 8).map((c, i) => (
              <li key={`${c.title}-${i}`} className="text-sm text-slate-700">
                <span className="text-xs text-slate-500">
                  {c.kind === 'pestle'
                    ? `Kontext · ${PESTLE_DIMENSION_LABEL[c.category] ?? c.category}`
                    : `Partei · ${PARTY_CATEGORY_LABEL[c.category] ?? c.category}`}
                </span>{' '}
                {c.title}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section letter="d.1)" title="Nichtkonformitäten und Korrekturmaßnahmen">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Stat label="Gesamt im Zeitraum" value={n(p.nonconformities.total)} />
          <Stat
            label="Hauptabweichungen"
            value={n(p.nonconformities.major)}
            bad={n(p.nonconformities.major) > 0}
          />
          <Stat label="Noch offen" value={n(p.nonconformities.open)} bad={n(p.nonconformities.open) > 0} />
          <Stat
            label="Überfällig"
            value={n(p.nonconformities.overdue)}
            bad={n(p.nonconformities.overdue) > 0}
          />
          <Stat label="Bestätigt geschlossen" value={n(p.nonconformities.verified)} />
        </dl>
      </Section>

      <Section letter="d.2)" title="Überwachungs- und Messergebnisse">
        {p.kpis.length === 0 ? (
          <Empty>Keine Kennzahlen hinterlegt — ohne Messung lässt sich Wirksamkeit nicht beurteilen.</Empty>
        ) : (
          <ul className="space-y-1">
            {p.kpis.map((k) => (
              <li key={k.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-700">{k.name}</span>
                <span
                  className={clsx(
                    'tabular-nums',
                    k.targetMet === false ? 'font-medium text-level-critical' : 'text-slate-700',
                  )}
                >
                  {formatNumber(k.value, k.unit)}
                  {k.target && (
                    <span className="ml-1 text-xs text-slate-400">Ziel {formatNumber(k.target)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section letter="d.3)" title="Auditergebnisse">
        {p.audits.length === 0 ? (
          <Empty>Kein berichtetes Audit im Zeitraum.</Empty>
        ) : (
          <ul className="space-y-1">
            {p.audits.map((a) => (
              <li key={a.refNo} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                <span>
                  <span className="font-mono text-xs text-slate-500">{a.refNo}</span> {a.title}
                </span>
                <span className="text-xs tabular-nums text-slate-600">
                  {a.findings} Feststellungen
                  {a.majorFindings > 0 && (
                    <span className="ml-1 font-medium text-level-critical">{a.majorFindings} Haupt</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section letter="d.4)" title="Erfüllung der Informationssicherheitsziele">
        {p.objectives.length === 0 ? (
          <Empty>Keine verabschiedeten Ziele hinterlegt.</Empty>
        ) : (
          <ul className="space-y-1">
            {p.objectives.map((o) => (
              <li key={o.title} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                <span>{o.title}</span>
                <span className="text-xs tabular-nums text-slate-600">
                  {o.currentValue ?? '–'} / {o.targetValue ?? '–'} {o.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section letter="d.5)" title="Sicherheitsvorfälle im Zeitraum">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Stat label="Vorfälle" value={n(p.incidents.total)} />
          <Stat label="Hoch / kritisch" value={n(p.incidents.severe)} bad={n(p.incidents.severe) > 0} />
          <Stat
            label="Datenpannen (DSGVO)"
            value={n(p.incidents.dataBreaches)}
            bad={n(p.incidents.dataBreaches) > 0}
          />
          <Stat label="NIS2-relevant" value={n(p.incidents.nis2Relevant)} />
          <Stat
            label="Verpasste Meldefristen"
            value={n(p.incidents.missedDeadlines)}
            bad={n(p.incidents.missedDeadlines) > 0}
          />
        </dl>
      </Section>

      <Section letter="e)" title="Rückmeldungen interessierter Parteien">
        {p.interestedParties.length === 0 ? (
          <Empty>Keine bindenden Erwartungen erfasst.</Empty>
        ) : (
          <ul className="space-y-1">
            {p.interestedParties.map((ip) => (
              <li key={ip.name} className="text-sm text-slate-700">
                <span className="font-medium">{ip.name}</span>
                {ip.expectations && <span className="ml-2 text-slate-600">{ip.expectations}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section letter="f)" title="Risikobeurteilung und Stand der Risikobehandlung">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Stat label="Offene Risiken" value={n(p.risks.open)} />
          <Stat
            label="Über Risikoappetit"
            value={n(p.risks.aboveAppetite)}
            bad={n(p.risks.aboveAppetite) > 0}
          />
          <Stat label="Bewusst akzeptiert" value={n(p.risks.accepted)} />
          <Stat
            label="Überprüfung überfällig"
            value={n(p.risks.reviewOverdue)}
            bad={n(p.risks.reviewOverdue) > 0}
          />
          <Stat
            label="Maßnahmen umgesetzt"
            value={`${n(p.riskTreatment.implemented)} / ${n(p.riskTreatment.total)}`}
          />
          <Stat
            label="Maßnahmen überfällig"
            value={n(p.riskTreatment.overdue)}
            bad={n(p.riskTreatment.overdue) > 0}
          />
        </dl>
      </Section>

      <Section letter="g)" title="Möglichkeiten zur fortlaufenden Verbesserung">
        {p.improvements.length === 0 ? (
          <Empty>Keine offenen Verbesserungsvorschläge im KVP-Register.</Empty>
        ) : (
          <ul className="space-y-1">
            {p.improvements.map((a) => (
              <li key={a.refNo} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                <span>
                  <span className="font-mono text-xs text-slate-500">{a.refNo}</span> {a.title}
                </span>
                <span className="text-xs text-slate-500">{a.ownerName ?? 'ohne Verantwortliche'}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: ReactNode; bad?: boolean }) {
  return (
    <>
      <dt className="text-slate-600">{label}</dt>
      <dd
        className={clsx(
          'text-right tabular-nums',
          bad ? 'font-medium text-level-critical' : 'text-slate-800',
        )}
      >
        {value}
      </dd>
    </>
  );
}

function ReviewPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['review', id],
    queryFn: () => api<ReviewDetail>(`/management-reviews/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['review', id] });
    onChanged();
  };

  const [minutes, setMinutes] = useState<{ id: string; filename: string } | null>(null);
  const close = useMutation({
    mutationFn: (decisions: string) =>
      api(`/management-reviews/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ decisions, minutesFileId: minutes?.id ?? null }),
      }),
    onSuccess: refresh,
  });
  const addAction = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/actions', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });

  const d = detail.data;
  const isClosed = d?.status === 'closed';

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
        aria-label="Managementbewertung"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Managementbewertung {date(d.heldAt)}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {isClosed
                    ? `Protokoll abgeschlossen, Eingaben eingefroren am ${date(d.inputs.frozenAt)}`
                    : 'Sitzung offen — die Eingaben zeigen den aktuellen Stand'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={isClosed ? 'closed' : 'planned'} />
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Schließen
                </button>
              </div>
            </div>

            <ErrorNote error={close.error ?? addAction.error} />

            {d.decisions && (
              <section className="mb-6">
                <h3 className="mb-1 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  Beschlüsse <NormHint refs="iso:9.3" />
                </h3>
                <p className="whitespace-pre-line rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {d.decisions}
                </p>
                {d.minutesFile && (
                  <p className="mt-1 text-xs text-slate-600">
                    Protokoll:{' '}
                    <button
                      type="button"
                      className="text-brand-700 underline"
                      onClick={() => void downloadFile(d.minutesFile!.id, d.minutesFile!.filename)}
                    >
                      {d.minutesFile.filename}
                    </button>
                  </p>
                )}
              </section>
            )}

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Beschlossene Maßnahmen <NormHint refs={['iso:9.3', 'iso:10.1']} />
              </h3>
              {d.actions.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">Noch keine Maßnahme aus dieser Sitzung.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.actions.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-800">
                        <span className="font-mono text-xs text-slate-500">{a.refNo}</span> {a.title}
                      </span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
              {can('action.write') && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    addAction.mutate({
                      title: String(f.get('title')).trim(),
                      kind: 'improvement',
                      reviewId: id,
                      dueAt: String(f.get('dueAt') || '') || null,
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <div className="min-w-48 flex-1">
                    <label className="label" htmlFor="reviewActionTitle">
                      Beschluss als Maßnahme
                      <NormHint refs={['iso:9.3', 'iso:10.1']} />
                    </label>
                    <input
                      id="reviewActionTitle"
                      name="title"
                      required
                      minLength={3}
                      className="input"
                      placeholder="z. B. SIEM-Beschaffung starten"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="reviewActionDue">
                      Fällig
                      <NormHint refs="iso:10.1" />
                    </label>
                    <input id="reviewActionDue" name="dueAt" type="date" className="input w-auto" />
                  </div>
                  <button type="submit" className="btn-ghost" disabled={addAction.isPending}>
                    Aufnehmen
                  </button>
                </form>
              )}
            </section>

            {!isClosed && can('audit.write') && (
              <form
                className="mb-6 rounded-md border border-dashed border-slate-300 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  close.mutate(String(f.get('decisions')));
                }}
              >
                <label className="label" htmlFor="decisions">
                  Beschlüsse der Leitung
                  <NormHint refs="iso:9.3" />
                </label>
                <textarea
                  id="decisions"
                  name="decisions"
                  required
                  minLength={10}
                  rows={4}
                  className="input"
                  placeholder="Entscheidungen zu Verbesserungsmöglichkeiten und zum Änderungsbedarf am ISMS, einschließlich Ressourcen."
                />
                <div className="mt-2">
                  <FileField
                    label="Unterzeichnetes Protokoll"
                    hint="optional — die Beschlüsse oben sind das Protokoll"
                    value={minutes?.id ?? null}
                    filename={minutes?.filename}
                    onChange={setMinutes}
                  />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button type="submit" className="btn-primary" disabled={close.isPending}>
                    Sitzung abschließen
                  </button>
                  <p className="text-xs text-slate-500">Danach ist das Protokoll unveränderlich.</p>
                </div>
              </form>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-1.5">
                Eingaben nach Kap. 9.3.2 <NormHint refs="iso:9.3" />
              </h3>
              <InputSections inputs={d.inputs} />
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
