import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { PROGRAMME_SLUG, type Programme, scoreText, useProgrammes } from '../lib/programmes';
import { ErrorNote, Spinner } from './ui';

/**
 * Die drei Programme nebeneinander, jede Karte gleich gebaut: Stand, aktueller Schritt, nächster
 * Schritt. Wer nur diese Reihe liest, weiß, wo die Organisation steht und was heute zu tun ist.
 */
export function ProgrammeCards() {
  const q = useProgrammes();
  if (q.isError) return <ErrorNote error={q.error} />;
  if (!q.data) return <Spinner />;
  return (
    <section className="mb-8 grid gap-4 lg:grid-cols-3" aria-label="Programme">
      {q.data.map((p) => (
        <ProgrammeCard key={p.key} p={p} />
      ))}
    </section>
  );
}

function ProgrammeCard({ p }: { p: Programme }) {
  const { can } = useAuth();
  if (!p.active) {
    return (
      <div className="card flex flex-col justify-between p-5 text-slate-500">
        <div>
          <h2 className="text-base font-semibold text-slate-700">{p.name}</h2>
          <p className="mt-1 text-sm">Nicht aktiviert.</p>
        </div>
        {can('framework.activate') && (
          <Link to="/settings" className="mt-4 text-sm text-brand-700 underline">
            In den Einstellungen aktivieren
          </Link>
        )}
      </div>
    );
  }
  const index = p.steps.findIndex((s) => s.key === p.current);
  const current = index >= 0 ? p.steps[index] : null;
  const pct = p.score.unit === 'pct' ? p.score.value : p.score.of ? (100 * p.score.value) / p.score.of : 0;

  return (
    <div className="card flex flex-col p-5">
      <Link
        to={`/programme/${PROGRAMME_SLUG[p.key]}`}
        className="group flex items-baseline justify-between gap-2"
      >
        <h2 className="text-base font-semibold text-slate-900 group-hover:underline">{p.name}</h2>
        <span className="text-xs text-brand-700">Programm öffnen</span>
      </Link>

      <p className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">
        {p.score.of === 0 && p.score.unit === 'count' ? '–' : scoreText(p)}
      </p>
      <p className="text-sm text-slate-600">
        {p.score.of === 0 && p.score.unit === 'count' ? 'noch keine Pflichten ausgelöst' : p.score.label}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>

      <StepDots p={p} />

      <div className="mt-4 flex-1 border-t border-slate-100 pt-3 text-sm">
        {current ? (
          <>
            <p className="text-xs text-slate-500">
              Schritt {index + 1} von {p.steps.length}: {current.title}
            </p>
            {p.next && (
              <Link
                to={p.next.to}
                className={clsx(
                  'mt-1 block font-medium hover:underline',
                  p.next.urgent ? 'text-level-critical' : 'text-brand-700',
                )}
              >
                {p.next.urgent && <span className="mr-1 text-xs uppercase tracking-wide">Vorrang:</span>}
                {p.next.title} →
              </Link>
            )}
          </>
        ) : (
          <p className="font-medium text-emerald-700">Alle Schritte erledigt</p>
        )}
      </div>
    </div>
  );
}

/** Kurzform der Schritte: ein Punkt je Schritt, erledigt gefüllt. Die Langform steht auf der Programmseite. */
function StepDots({ p }: { p: Programme }) {
  return (
    <ol className="mt-3 flex gap-1" aria-label="Schritte">
      {p.steps.map((s) => (
        <li
          key={s.key}
          title={`${s.title}: ${s.done ? 'erledigt' : s.key === p.current ? 'jetzt dran' : 'offen'}`}
          className={clsx(
            'h-1.5 flex-1 rounded-full',
            s.done ? 'bg-emerald-600' : s.key === p.current ? 'bg-amber-500' : 'bg-slate-200',
          )}
        >
          <span className="sr-only">
            {s.title}: {s.done ? 'erledigt' : s.key === p.current ? 'jetzt dran' : 'offen'}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Der Weg eines Programms, Schritt für Schritt untereinander. Jeder Schritt sagt in einem Satz,
 * wie es steht, und führt in die Ansicht, aus der dieser Satz stammt; der aktuelle sagt dazu,
 * was als Nächstes zu tun ist.
 */
export function ProgrammeSteps({ p }: { p: Programme }) {
  return (
    <ol className="space-y-0">
      {p.steps.map((s, i) => {
        const current = s.key === p.current;
        const last = i === p.steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-4 pb-5">
            {!last && <span aria-hidden className="absolute left-[15px] top-8 h-full w-px bg-slate-200" />}
            <span
              aria-hidden
              className={clsx(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                s.done
                  ? 'bg-emerald-600 text-white'
                  : current
                    ? 'bg-white text-amber-700 ring-2 ring-amber-500'
                    : 'bg-white text-slate-400 ring-1 ring-slate-300',
              )}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <div
              className={clsx(
                'min-w-0 flex-1 rounded-md',
                current && '-mt-1 border border-amber-200 bg-amber-50 px-3 py-2',
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link to={s.to} className="font-medium text-slate-900 hover:underline">
                  {s.title}
                </Link>
                <span
                  className={clsx(
                    'text-xs',
                    s.done ? 'text-emerald-700' : current ? 'font-medium text-amber-800' : 'text-slate-500',
                  )}
                >
                  {s.done ? 'erledigt' : current ? 'jetzt dran' : 'offen'}
                </span>
              </div>
              <p className="text-sm text-slate-600">{s.detail}</p>
              {current && (
                <Link to={s.to} className="btn-primary mt-2 inline-flex text-sm">
                  {s.action}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
