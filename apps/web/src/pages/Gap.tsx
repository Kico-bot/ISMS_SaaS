import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorNote, NormHint, PageHeader, Progress, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { ISO_PLACES } from '../lib/iso-places';
import type { NormRefKey } from '../lib/norm-refs';

interface Row {
  requirementId: string;
  refCode: string;
  title: string;
  kind: string;
  groupRefCode: string;
  groupTitle: string;
  applicability: string;
  justification: string | null;
  checkStatus: 'yes' | 'partial' | 'no' | 'dispensable';
  measures: { id: string; refNo: string; title: string; status: string }[];
}

interface MeasureOption {
  id: string;
  refNo: string;
  title: string;
  status: string;
}

/** Entschieden heißt: eine Maßnahme ist zugeordnet, oder der Punkt ist begründet ausgeschlossen. */
const decided = (r: Row) => r.applicability === 'not_applicable' || r.measures.length > 0;

const STATE: Record<Row['checkStatus'], { label: string; tone: string; explain: string }> = {
  yes: {
    label: 'erfüllt',
    tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    explain: 'Eine umgesetzte Maßnahme deckt diesen Punkt ab.',
  },
  partial: {
    label: 'teilweise',
    tone: 'bg-sky-50 text-sky-800 ring-sky-200',
    explain: 'Eine umgesetzte Maßnahme deckt diesen Punkt teilweise ab.',
  },
  dispensable: {
    label: 'ausgeschlossen',
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
    explain: 'Begründet als nicht anwendbar erklärt. Das zählt in der Anwendbarkeitserklärung voll.',
  },
  no: {
    label: 'offen',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
    explain: 'Noch keine umgesetzte Maßnahme. Zugeordnete Maßnahmen zählen, sobald sie umgesetzt sind.',
  },
};

/**
 * Gap-Analyse ISO 27001: statt 123 Tabellenzeilen ein Kapitel nach dem anderen, und je Normpunkt
 * drei Fragen. Gilt das für uns? Womit erfüllen wir es? Wie weit sind wir? Die Antworten landen in
 * denselben Daten wie die Anwendbarkeitserklärung; diese Seite ist nur der geführte Weg dorthin.
 */
export function GapPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const rows = useQuery({
    queryKey: ['soa', 'ISO27001'],
    queryFn: () => api<Row[]>('/soa?framework=ISO27001'),
  });
  const data = rows.data ?? [];
  const chapters = groupChapters(data);
  const chapter = params.get('chapter') ?? chapters.find((c) => c.open > 0)?.refCode ?? chapters[0]?.refCode;
  const showAll = params.get('all') === '1';
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };
  const inChapter = data.filter((r) => r.groupRefCode === chapter);
  const visible = showAll ? inChapter : inChapter.filter((r) => !decided(r));
  const total = data.length;
  const done = data.filter(decided).length;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['soa', 'ISO27001'] });
    void qc.invalidateQueries({ queryKey: ['programmes'] });
    void qc.invalidateQueries({ queryKey: ['programme-tasks'] });
    void qc.invalidateQueries({ queryKey: ['certification-readiness'] });
    void qc.invalidateQueries({ queryKey: ['chapters', 'ISO27001'] });
  };

  return (
    <>
      <PageHeader
        eyebrow="Normen · ISO 27001"
        title="Gap-Analyse"
        norm={['iso:6.1.3', 'iso:4.3']}
        description="Kapitel für Kapitel: Für jeden Normpunkt entscheiden Sie, ob er gilt und womit Sie ihn erfüllen. Daraus entsteht die Anwendbarkeitserklärung von selbst."
        actions={
          <Link to="/programme/iso27001" className="btn-ghost">
            Zurück zum Programm
          </Link>
        }
      />
      <ErrorNote error={rows.error} />
      {rows.isLoading ? (
        <Spinner />
      ) : (
        <>
          <section className="card mb-6 p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-slate-700">
                <strong className="text-2xl font-semibold tabular-nums text-slate-900">{done}</strong> von{' '}
                {total} Normpunkten entschieden
              </p>
              <Link to="/soa?framework=ISO27001" className="text-sm text-brand-700 underline">
                Anwendbarkeitserklärung als Liste
              </Link>
            </div>
            <Progress value={done} max={Math.max(total, 1)} />
            <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" aria-label="Kapitel">
              {chapters.map((c) => (
                <li key={c.refCode}>
                  <button
                    type="button"
                    onClick={() => set('chapter', c.refCode)}
                    aria-pressed={c.refCode === chapter}
                    className={clsx(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      c.refCode === chapter
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{c.refCode}</span>
                    <span className="block truncate text-xs text-slate-500" title={c.title}>
                      {c.title}
                    </span>
                    <span
                      className={clsx(
                        'mt-1 block text-xs tabular-nums',
                        c.open === 0 ? 'text-emerald-700' : 'text-amber-700',
                      )}
                    >
                      {c.open === 0 ? 'alles entschieden' : `${c.open} offen`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {chapter} {chapters.find((c) => c.refCode === chapter)?.title}
              </h2>
              <div className="tabs" role="tablist" aria-label="Normpunkte filtern">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showAll}
                  className={clsx('tab', !showAll && 'tab-active')}
                  onClick={() => set('all', null)}
                >
                  Noch offen{' '}
                  <span className="tabular-nums text-slate-400">
                    {inChapter.filter((r) => !decided(r)).length}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showAll}
                  className={clsx('tab', showAll && 'tab-active')}
                  onClick={() => set('all', '1')}
                >
                  Alle <span className="tabular-nums text-slate-400">{inChapter.length}</span>
                </button>
              </div>
            </div>
            {visible.length === 0 ? (
              <p className="card px-5 py-8 text-center text-sm text-slate-600">
                In diesem Kapitel ist alles entschieden.{' '}
                {chapters.some((c) => c.open > 0) && (
                  <button
                    type="button"
                    className="text-brand-700 underline"
                    onClick={() => set('chapter', chapters.find((c) => c.open > 0)!.refCode)}
                  >
                    Zum nächsten offenen Kapitel
                  </button>
                )}
              </p>
            ) : (
              <ol className="space-y-2">
                {visible.map((r, i) => (
                  <RequirementCard key={r.requirementId} row={r} initiallyOpen={i === 0} onChange={refresh} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  );
}

function groupChapters(rows: Row[]) {
  const map = new Map<string, { refCode: string; title: string; total: number; open: number }>();
  for (const r of rows) {
    const c = map.get(r.groupRefCode) ?? { refCode: r.groupRefCode, title: r.groupTitle, total: 0, open: 0 };
    c.total += 1;
    if (!decided(r)) c.open += 1;
    map.set(r.groupRefCode, c);
  }
  return [...map.values()];
}

function RequirementCard({
  row,
  initiallyOpen,
  onChange,
}: {
  row: Row;
  initiallyOpen: boolean;
  onChange: () => void;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(initiallyOpen);
  const [excluding, setExcluding] = useState(false);
  const [justification, setJustification] = useState(row.justification ?? '');
  const [existing, setExisting] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const canSoa = can('soa.write');
  const canMeasure = can('measure.write');
  const isControl = row.kind === 'control';
  const excluded = row.applicability === 'not_applicable';
  const state = STATE[row.checkStatus];

  const measures = useQuery({
    queryKey: ['measure-options'],
    queryFn: () => api<{ items: MeasureOption[] }>('/measures?size=200'),
    enabled: open && canMeasure,
  });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/soa/${row.requirementId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setExcluding(false);
      onChange();
    },
  });
  const map = useMutation({
    mutationFn: (measureId: string) =>
      api(`/measures/${measureId}/requirements`, {
        method: 'POST',
        body: JSON.stringify({ requirementId: row.requirementId, coverage: 'full' }),
      }),
    onSuccess: () => {
      setExisting('');
      onChange();
    },
  });
  const create = useMutation({
    mutationFn: async (title: string) => {
      const m = await api<{ id: string }>('/measures', {
        method: 'POST',
        body: JSON.stringify({ title, status: 'planned' }),
      });
      await api(`/measures/${m.id}/requirements`, {
        method: 'POST',
        body: JSON.stringify({ requirementId: row.requirementId, coverage: 'full' }),
      });
    },
    onSuccess: () => {
      setNewTitle('');
      void measures.refetch();
      onChange();
    },
  });
  const mappedIds = new Set(row.measures.map((m) => m.id));
  const places = ISO_PLACES[row.refCode];

  return (
    <li className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <span className="w-14 shrink-0 font-semibold tabular-nums text-slate-900">{row.refCode}</span>
        <span className="min-w-0 flex-1 text-slate-800">{row.title}</span>
        <span className={clsx('badge shrink-0 ring-1 ring-inset', state.tone)}>{state.label}</span>
        <span aria-hidden className="shrink-0 text-slate-400">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-4 md:grid-cols-3" data-hint-scope>
          <ErrorNote error={patch.error ?? map.error ?? create.error} />

          <Question n={1} title="Gilt das für uns?">
            {!isControl ? (
              <p className="text-sm text-slate-600">
                Ja. Kapitel 4 bis 10 gelten immer, ausschließen lassen sich nur Controls aus Anhang A.
              </p>
            ) : excluded && !excluding ? (
              <>
                <p className="text-sm text-slate-700">Nein, begründet ausgeschlossen:</p>
                <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-sm italic text-slate-700">
                  {row.justification}
                </p>
                {canSoa && (
                  <button
                    type="button"
                    className="mt-2 text-sm text-brand-700 underline"
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ applicability: 'applicable', justification: null })}
                  >
                    Doch anwendbar
                  </button>
                )}
              </>
            ) : excluding ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (justification.trim().length >= 10)
                    patch.mutate({ applicability: 'not_applicable', justification: justification.trim() });
                }}
              >
                <label className="label" htmlFor={`just-${row.requirementId}`}>
                  Warum gilt das nicht für Sie?
                </label>
                <textarea
                  id={`just-${row.requirementId}`}
                  className="input"
                  rows={3}
                  minLength={10}
                  required
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="z. B. Keine eigene Softwareentwicklung, alle Anwendungen werden eingekauft."
                />
                <div className="mt-2 flex gap-2">
                  <button type="submit" className="btn-primary text-sm" disabled={patch.isPending}>
                    Ausschließen
                  </button>
                  <button type="button" className="btn-ghost text-sm" onClick={() => setExcluding(false)}>
                    Abbrechen
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-sm text-slate-700">Ja, solange Sie nichts anderes entscheiden.</p>
                {canSoa && (
                  <button
                    type="button"
                    className="mt-2 text-sm text-brand-700 underline"
                    onClick={() => setExcluding(true)}
                  >
                    Nein, begründet ausschließen
                  </button>
                )}
              </>
            )}
          </Question>

          <Question n={2} title="Womit erfüllen wir es?">
            {excluded ? (
              <p className="text-sm text-slate-500">Entfällt, der Punkt ist ausgeschlossen.</p>
            ) : (
              <>
                {places && (
                  <p className="mb-3 rounded bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                    Aufgezeichnet wird das in:{' '}
                    {places.map((place, i) => (
                      <span key={place.to}>
                        {i > 0 && ', '}
                        <Link to={place.to} className="text-brand-700 underline">
                          {place.label}
                        </Link>
                      </span>
                    ))}
                    . Hier ordnen Sie die Maßnahme zu, die beschreibt, wie Sie das regeln.
                  </p>
                )}
                {row.measures.length === 0 ? (
                  <p className="text-sm text-slate-600">Noch keine Maßnahme zugeordnet.</p>
                ) : (
                  <ul className="space-y-1">
                    {row.measures.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm">
                        <Link
                          to={`/measures?open=${m.id}`}
                          className="min-w-0 flex-1 truncate text-slate-800 hover:underline"
                        >
                          {m.title}
                        </Link>
                        <StatusBadge status={m.status} />
                      </li>
                    ))}
                  </ul>
                )}
                {canMeasure && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        className="input min-w-0 flex-1"
                        value={existing}
                        onChange={(e) => setExisting(e.target.value)}
                        aria-label="Vorhandene Maßnahme wählen"
                      >
                        <option value="">Vorhandene Maßnahme wählen …</option>
                        {(measures.data?.items ?? [])
                          .filter((m) => !mappedIds.has(m.id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.refNo} · {m.title}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="btn-ghost text-sm"
                        disabled={!existing || map.isPending}
                        onClick={() => map.mutate(existing)}
                      >
                        Zuordnen
                      </button>
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newTitle.trim().length >= 3) create.mutate(newTitle.trim());
                      }}
                    >
                      <input
                        className="input min-w-0 flex-1"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="oder neue Maßnahme anlegen"
                        aria-label="Neue Maßnahme"
                        minLength={3}
                      />
                      <button type="submit" className="btn-ghost text-sm" disabled={create.isPending}>
                        Anlegen
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </Question>

          <Question n={3} title="Wie weit sind wir?">
            <p className="text-sm text-slate-700">
              <span className={clsx('badge mr-1 ring-1 ring-inset', state.tone)}>{state.label}</span>
              {state.explain}
            </p>
            {row.checkStatus === 'no' && row.measures.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Den Umsetzungsstand pflegen Sie an der Maßnahme. Ist sie umgesetzt, gilt der Punkt hier und in
                jedem anderen Regelwerk als erfüllt.
              </p>
            )}
          </Question>
        </div>
      )}
    </li>
  );
}

function Question({
  n,
  title,
  norm,
  children,
}: {
  n: number;
  title: string;
  norm?: NormRefKey;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-600">
          {n}
        </span>
        {title}
        {norm && <NormHint refs={norm} />}
      </h3>
      {children}
    </div>
  );
}
