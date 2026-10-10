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
    avgScore?: number;
    /** Name in eingefrorenen Bewertungen aus der Zeit vor der einheitlichen Risikobewertung. */
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
/** „1 Audit“, „2 Audits“ — eine Tagesordnung, die „1 Audits“ sagt, liest niemand ernsthaft. */
const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/**
 * Managementbewertung nach ISO 27001 Kap. 9.3 — auf das reduziert, was die Norm verlangt:
 * die Leitung sieht die Lage (9.3.2 a–g, aus dem ISMS berechnet), entscheidet (9.3.3) und das
 * Ergebnis wird festgehalten. Eine Sitzung ist damit drei Schritte: ansetzen, besprechen, abschließen.
 */
export function ReviewsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['reviews'], queryFn: () => api<ReviewRow[]>('/management-reviews') });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['reviews'] });
    void qc.invalidateQueries({ queryKey: ['review-preview'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api<ReviewDetail>('/management-reviews', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (r) => {
      invalidate();
      setOpenId(r.id);
    },
  });

  const rows = list.data ?? [];
  const current = rows.find((r) => r.status !== 'closed');
  const past = rows.filter((r) => r.status === 'closed');
  const last = past[0];

  return (
    <>
      <PageHeader
        eyebrow="Prüfung & Verbesserung"
        title="Managementbewertung"
        norm="iso:9.3"
        description="Mindestens einmal im Jahr bewertet die Leitung, ob das ISMS seinen Zweck erfüllt. Die Lage stellt die Suite aus den laufenden Daten zusammen — festzuhalten ist nur, was entschieden wurde."
      />
      <ErrorNote error={list.error ?? create.error} />

      {list.isLoading ? (
        <Spinner />
      ) : current ? (
        <section className="card mb-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-brand-500 p-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Laufende Bewertung vom {date(current.heldAt)}
            </p>
            <p className="text-xs text-slate-600">
              Lage besprechen, Beschlüsse festhalten, abschließen — danach ist das Protokoll unveränderlich.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setOpenId(current.id)}>
            Bewertung öffnen
          </button>
        </section>
      ) : (
        can('audit.write') && (
          <form
            className="card mb-6 flex flex-wrap items-end gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              create.mutate({ heldAt: String(f.get('heldAt')) });
            }}
          >
            <div>
              <p className="text-sm font-medium text-slate-900">Nächste Bewertung ansetzen</p>
              <p className="mb-2 text-xs text-slate-600">
                {last
                  ? `Die letzte fand am ${date(last.heldAt)} statt.`
                  : 'Noch keine Bewertung — die erste ist spätestens vor dem Zertifizierungsaudit fällig.'}
              </p>
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
              />
            </div>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Ansetzen
            </button>
          </form>
        )
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-500">
          Abgeschlossene Bewertungen <NormHint refs="iso:9.3" />
        </h2>
        {past.length === 0 ? (
          <EmptyState
            title="Noch keine abgeschlossene Bewertung"
            hint="Abgeschlossene Protokolle erscheinen hier."
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {past.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpenId(r.id)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="w-24 shrink-0 text-sm tabular-nums text-slate-700">{date(r.heldAt)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{r.decisions}</span>
                <span className="shrink-0 text-xs text-slate-500">{r.actionCount} Folgemaßnahmen</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {openId && <ReviewPanel id={openId} onClose={() => setOpenId(null)} onChanged={invalidate} />}
    </>
  );
}

// --- Die Lage nach 9.3.2: eine Zeile je Punkt, Details auf Klick -------------------------

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const DOT: Record<Tone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-slate-300',
};

function AgendaItem({
  letter,
  title,
  summary,
  tone,
  children,
}: {
  letter: string;
  title: string;
  summary: string;
  tone: Tone;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
        onClick={() => setOpen(!open)}
        disabled={!children}
        aria-expanded={open}
      >
        <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', DOT[tone])} aria-hidden />
        <span className="w-8 shrink-0 font-mono text-xs text-brand-600">{letter}</span>
        <span className="w-64 shrink-0 text-sm font-medium text-slate-800">{title}</span>
        <span className="min-w-0 flex-1 text-sm text-slate-600">{summary}</span>
        {children && <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>}
      </button>
      {open && children && <div className="px-3 pb-3 pl-[4.25rem] text-sm text-slate-700">{children}</div>}
    </li>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return <ul className="list-disc space-y-0.5 pl-4">{items}</ul>;
}

function Agenda({ inputs: p }: { inputs: ReviewInputs }) {
  const doneActions = p.priorActions.filter((a) => ['done', 'verified'].includes(a.status)).length;
  const issues = p.contextChanges.filter((c) => c.kind === 'pestle');
  const parties = p.contextChanges.filter((c) => c.kind !== 'pestle');
  const kpisMissed = p.kpis.filter((k) => k.targetMet === false).length;
  const objectivesMet = p.objectives.filter((o) => o.status === 'achieved').length;
  const objectivesBad = p.objectives.filter((o) => ['at_risk', 'missed'].includes(o.status)).length;
  const auditFindings = p.audits.reduce((s, a) => s + a.findings, 0);
  const avgRisk = p.risks.avgScore ?? p.risks.avgResidual;

  return (
    <ul className="card">
      <AgendaItem
        letter="a)"
        title="Beschlüsse der letzten Bewertung"
        tone={
          p.priorActions.length === 0 ? 'neutral' : doneActions === p.priorActions.length ? 'good' : 'warn'
        }
        summary={
          p.previousReviewId
            ? `${doneActions} von ${p.priorActions.length} Folgemaßnahmen erledigt`
            : 'Erste Bewertung — keine Vorgänger'
        }
      >
        {p.priorActions.length > 0 && (
          <List
            items={p.priorActions.map((a) => (
              <li key={a.refNo}>
                {a.refNo} {a.title} — <StatusBadge status={a.status} />
              </li>
            ))}
          />
        )}
      </AgendaItem>

      <AgendaItem
        letter="b)"
        title="Veränderte Rahmenbedingungen"
        tone={issues.length ? 'warn' : 'neutral'}
        summary={
          issues.length
            ? `${count(issues.length, 'internes oder externes Thema', 'interne oder externe Themen')} geändert`
            : 'Keine Änderungen erfasst'
        }
      >
        {issues.length > 0 && (
          <List
            items={issues.map((c, i) => (
              <li key={`${c.title}-${i}`}>
                {c.title}{' '}
                <span className="text-xs text-slate-500">
                  ({PESTLE_DIMENSION_LABEL[c.category] ?? c.category})
                </span>
              </li>
            ))}
          />
        )}
      </AgendaItem>

      <AgendaItem
        letter="c)"
        title="Veränderte Erwartungen Dritter"
        tone={parties.length ? 'warn' : 'neutral'}
        summary={
          parties.length
            ? `${count(parties.length, 'interessierte Partei', 'interessierte Parteien')} mit neuen Anforderungen`
            : 'Keine Änderungen erfasst'
        }
      >
        {parties.length > 0 && (
          <List
            items={parties.map((c, i) => (
              <li key={`${c.title}-${i}`}>
                {c.title}{' '}
                <span className="text-xs text-slate-500">
                  ({PARTY_CATEGORY_LABEL[c.category] ?? c.category})
                </span>
              </li>
            ))}
          />
        )}
      </AgendaItem>

      <AgendaItem
        letter="d)"
        title="Wie gut funktioniert das ISMS?"
        tone={
          n(p.nonconformities.major) > 0 || n(p.incidents.missedDeadlines) > 0
            ? 'bad'
            : n(p.nonconformities.open) > 0 || kpisMissed > 0 || objectivesBad > 0
              ? 'warn'
              : 'good'
        }
        summary={[
          count(n(p.nonconformities.open), 'offene Abweichung', 'offene Abweichungen'),
          `${kpisMissed} von ${p.kpis.length} Kennzahlen unter Ziel`,
          count(p.audits.length, 'Audit', 'Audits'),
          p.objectives.length ? `${objectivesMet} von ${p.objectives.length} Zielen erreicht` : 'keine Ziele',
        ].join(' · ')}
      >
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-slate-500">Abweichungen und Korrekturen</dt>
          <dd>
            {n(p.nonconformities.total)} im Zeitraum, davon {n(p.nonconformities.major)} Hauptabweichungen;{' '}
            {n(p.nonconformities.open)} offen, {n(p.nonconformities.overdue)} überfällig
          </dd>
          <dt className="text-slate-500">Messergebnisse</dt>
          <dd>
            {p.kpis.length === 0
              ? 'keine Kennzahlen hinterlegt'
              : kpisMissed === 0
                ? `alle ${p.kpis.length} Kennzahlen im Ziel`
                : `unter Ziel: ${p.kpis
                    .filter((k) => k.targetMet === false)
                    .map((k) => `${k.name} (${formatNumber(k.value, k.unit)})`)
                    .join(', ')}`}
            <br />
            {count(n(p.incidents.total), 'Sicherheitsvorfall', 'Sicherheitsvorfälle')}, davon{' '}
            {n(p.incidents.severe)} schwer; {n(p.incidents.missedDeadlines)} Meldefristen verpasst
          </dd>
          <dt className="text-slate-500">Auditergebnisse</dt>
          <dd>
            {p.audits.length === 0
              ? 'kein berichtetes Audit im Zeitraum'
              : `${p.audits.map((a) => a.refNo).join(', ')} mit ${auditFindings} Feststellungen`}
          </dd>
          <dt className="text-slate-500">Sicherheitsziele</dt>
          <dd>
            {p.objectives.length === 0
              ? 'keine verabschiedeten Ziele'
              : p.objectives
                  .map((o) =>
                    `${o.title}: ${o.currentValue ?? '–'} / ${o.targetValue ?? '–'} ${o.unit ?? ''}`.trim(),
                  )
                  .join(' · ')}
          </dd>
        </dl>
      </AgendaItem>

      <AgendaItem
        letter="e)"
        title="Rückmeldungen interessierter Parteien"
        tone="neutral"
        summary={
          p.interestedParties.length
            ? `${count(p.interestedParties.length, 'Partei', 'Parteien')} mit bindenden Erwartungen`
            : 'Keine bindenden Erwartungen erfasst'
        }
      >
        {p.interestedParties.length > 0 && (
          <List
            items={p.interestedParties.map((ip) => (
              <li key={ip.name}>
                <span className="font-medium">{ip.name}</span>
                {ip.expectations && <span className="text-slate-600"> — {ip.expectations}</span>}
              </li>
            ))}
          />
        )}
      </AgendaItem>

      <AgendaItem
        letter="f)"
        title="Risiken und ihre Behandlung"
        tone={n(p.risks.aboveAppetite) > 0 ? 'bad' : n(p.riskTreatment.overdue) > 0 ? 'warn' : 'good'}
        summary={`${count(n(p.risks.open), 'offenes Risiko', 'offene Risiken')}, ${n(p.risks.aboveAppetite)} über dem Risikoappetit · ${n(p.riskTreatment.implemented)} von ${n(p.riskTreatment.total)} Maßnahmen umgesetzt`}
      >
        <p>
          {n(p.risks.accepted)} Risiken werden bewusst getragen, bei {n(p.risks.reviewOverdue)} ist die
          Überprüfung überfällig. {n(p.riskTreatment.overdue)} Maßnahmen sind überfällig.
          {avgRisk != null && ` Durchschnittliche Risikohöhe ${formatNumber(avgRisk)} von 25.`}
        </p>
      </AgendaItem>

      <AgendaItem
        letter="g)"
        title="Verbesserungsmöglichkeiten"
        tone="neutral"
        summary={
          p.improvements.length
            ? count(p.improvements.length, 'offener Vorschlag', 'offene Vorschläge')
            : 'Keine offenen Vorschläge'
        }
      >
        {p.improvements.length > 0 && (
          <List
            items={p.improvements.map((a) => (
              <li key={a.refNo}>
                {a.refNo} {a.title}
                <span className="text-xs text-slate-500"> — {a.ownerName ?? 'ohne Verantwortliche'}</span>
              </li>
            ))}
          />
        )}
      </AgendaItem>
    </ul>
  );
}

// --- Eine Sitzung ----------------------------------------------------------------------

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
  const writable = !isClosed && can('audit.write');

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-4xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
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
                    ? `Abgeschlossen — die Lage ist eingefroren auf den Stand vom ${date(d.inputs.frozenAt)}.`
                    : `${
                        d.inputs.previousReviewId
                          ? `Zeitraum seit der letzten Bewertung am ${date(d.inputs.periodFrom)}`
                          : 'Erste Bewertung — betrachtet wird alles bisher Erfasste'
                      }; die Lage wird bis zum Abschluss laufend aktualisiert.`}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Schließen
              </button>
            </div>

            <ErrorNote error={close.error ?? addAction.error} />

            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
                1
              </span>
              Lage besprechen <NormHint refs="iso:9.3" note="Kap. 9.3.2 a) bis g) — aus dem ISMS berechnet" />
            </h3>
            <div className="mb-6">
              <Agenda inputs={d.inputs} />
            </div>

            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
                2
              </span>
              Ergebnis festhalten <NormHint refs={['iso:9.3', 'iso:10.1']} />
            </h3>

            {d.decisions && (
              <div className="mb-3">
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
              </div>
            )}

            <div className="mb-3">
              <p className="mb-1 text-xs font-medium text-slate-600">Folgemaßnahmen</p>
              {d.actions.length === 0 ? (
                <p className="text-sm text-slate-500">Keine.</p>
              ) : (
                <ul className="space-y-1">
                  {d.actions.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm"
                    >
                      <span className="text-slate-800">
                        <span className="font-mono text-xs text-slate-500">{a.refNo}</span> {a.title}
                        {a.dueAt && <span className="ml-2 text-xs text-slate-500">bis {date(a.dueAt)}</span>}
                      </span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
              {can('action.write') && !isClosed && (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
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
                  <input
                    name="title"
                    required
                    minLength={3}
                    className="input min-w-48 flex-1"
                    placeholder="z. B. Budget für Notstromversorgung der Leitstelle freigeben"
                    aria-label="Folgemaßnahme"
                  />
                  <input name="dueAt" type="date" className="input w-auto" aria-label="Fällig bis" />
                  <button type="submit" className="btn-ghost" disabled={addAction.isPending}>
                    Hinzufügen
                  </button>
                </form>
              )}
            </div>

            {writable && (
              <form
                className="rounded-md border border-slate-200 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  close.mutate(String(f.get('decisions')));
                }}
              >
                <label className="label" htmlFor="decisions">
                  Was hat die Leitung entschieden?
                  <NormHint refs="iso:9.3" />
                </label>
                <textarea
                  id="decisions"
                  name="decisions"
                  required
                  minLength={10}
                  rows={4}
                  className="input"
                  placeholder="Ist das ISMS geeignet, angemessen und wirksam? Was wird verbessert, was ändert sich, welche Mittel werden bereitgestellt?"
                />
                <div className="mt-2">
                  <FileField
                    label="Unterzeichnetes Protokoll"
                    hint="optional — der Text oben ist bereits das Protokoll"
                    value={minutes?.id ?? null}
                    filename={minutes?.filename}
                    onChange={setMinutes}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="submit" className="btn-primary" disabled={close.isPending}>
                    Bewertung abschließen
                  </button>
                  <p className="text-xs text-slate-500">Danach sind Lage und Beschlüsse unveränderlich.</p>
                </div>
              </form>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
