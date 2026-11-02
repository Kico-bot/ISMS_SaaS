import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorNote, PageHeader, relativeDays, Spinner, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface MyArea {
  assets: { id: string; refNo: string; name: string; category: string; riskCount: number }[];
  risks: {
    id: string;
    refNo: string;
    title: string;
    status: string;
    score: number | null;
    nextReviewAt: string | null;
  }[];
  measures: { id: string; refNo: string; title: string; status: string; dueDate: string | null }[];
}

/** Schwellen der festen 5×5-Matrix: bis 4 niedrig, bis 9 mittel, bis 14 hoch, darüber kritisch. */
function level(score: number | null) {
  if (score == null) return { label: 'nicht bewertet', tone: 'bg-slate-100 text-slate-600' };
  if (score > 14) return { label: `kritisch (${score})`, tone: 'bg-red-100 text-red-800' };
  if (score > 9) return { label: `hoch (${score})`, tone: 'bg-orange-100 text-orange-900' };
  if (score > 4) return { label: `mittel (${score})`, tone: 'bg-amber-100 text-amber-900' };
  return { label: `niedrig (${score})`, tone: 'bg-green-100 text-green-800' };
}

function daysUntil(date: string): number {
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.round((new Date(date).getTime() - today.getTime()) / 86_400_000);
}

/**
 * Mein Bereich: was der angemeldeten Person gehört, an einer Stelle. Für Verantwortliche, die
 * nicht das ganze ISMS durchsuchen sollen, um ihre drei Maßnahmen und ihr Risiko zu finden.
 */
export function MyAreaPage() {
  const { session } = useAuth();
  const q = useQuery({ queryKey: ['my-area'], queryFn: () => api<MyArea>('/programmes/my-area') });
  const d = q.data;
  const empty = d && d.assets.length + d.risks.length + d.measures.length === 0;

  return (
    <>
      <PageHeader
        eyebrow="Start"
        title="Mein Bereich"
        norm={['iso:5.3', 'iso:A.5.9']}
        description={`Was ${session?.user.displayName ?? 'Ihnen'} verantwortet: offene Maßnahmen, Risiken und Assets. Erledigte Maßnahmen verschwinden von hier.`}
      />
      <ErrorNote error={q.error} />
      {!d ? (
        <Spinner />
      ) : empty ? (
        <EmptyState
          title="Ihnen ist noch nichts zugeordnet"
          hint="Sobald Sie als verantwortliche Person für eine Maßnahme, ein Risiko oder ein Asset eingetragen sind, erscheint es hier."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <Column title="Offene Maßnahmen" count={d.measures.length} empty="Keine offenen Maßnahmen.">
            {d.measures.map((m) => {
              const days = m.dueDate ? daysUntil(m.dueDate) : null;
              return (
                <Row key={m.id} to={`/measures?open=${m.id}`} refNo={m.refNo} title={m.title}>
                  <StatusBadge status={m.status} />
                  {days !== null && (
                    <span
                      className={clsx(
                        'text-xs',
                        days < 0 ? 'text-level-critical' : days <= 7 ? 'text-level-high' : 'text-slate-500',
                      )}
                    >
                      {relativeDays(days)}
                    </span>
                  )}
                </Row>
              );
            })}
          </Column>
          <Column title="Meine Risiken" count={d.risks.length} empty="Keine offenen Risiken.">
            {d.risks.map((r) => {
              const l = level(r.score);
              return (
                <Row key={r.id} to={`/risks?open=${r.id}`} refNo={r.refNo} title={r.title}>
                  <span className={clsx('badge', l.tone)}>{l.label}</span>
                  {r.nextReviewAt && (
                    <span className="text-xs text-slate-500">
                      wieder ansehen {new Date(r.nextReviewAt).toLocaleDateString('de-DE')}
                    </span>
                  )}
                </Row>
              );
            })}
          </Column>
          <Column title="Meine Assets" count={d.assets.length} empty="Keine Assets.">
            {d.assets.map((a) => (
              <Row key={a.id} to="/assets" refNo={a.refNo} title={a.name}>
                <span className="text-xs text-slate-500">
                  {a.riskCount === 1 ? '1 offenes Risiko' : `${a.riskCount} offene Risiken`}
                </span>
                <Link to={`/risks?asset=${a.id}`} className="text-xs text-brand-700 hover:underline">
                  + Risiko erfassen
                </Link>
              </Row>
            ))}
          </Column>
        </div>
      )}
    </>
  );
}

function Column({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
        {title} <span className="tabular-nums text-slate-400">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="card px-4 py-6 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="card divide-y divide-slate-100">{children}</ul>
      )}
    </section>
  );
}

function Row({
  to,
  refNo,
  title,
  children,
}: {
  to: string;
  refNo: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="px-4 py-3">
      <Link to={to} className="font-medium text-slate-800 hover:underline">
        {title}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{refNo}</span>
        {children}
      </div>
    </li>
  );
}
