import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface Onboarding {
  steps: { key: string; title: string; hint: string; done: boolean; to: string }[];
  complete: boolean;
}

const HIDE_KEY = 'isms.onboarding.hidden';

function hidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Erste Schritte für einen neuen Mandanten. Die Schritte ergeben sich aus den Daten; sind alle
 * erledigt, verschwindet die Karte von selbst. „Später“ blendet sie nur in diesem Browser aus.
 */
export function OnboardingCard() {
  const [hide, setHide] = useState(hidden);
  const q = useQuery({
    queryKey: ['onboarding'],
    queryFn: () => api<Onboarding>('/programmes/onboarding'),
    enabled: !hide,
  });
  if (hide || !q.data || q.data.complete) return null;
  const done = q.data.steps.filter((s) => s.done).length;
  const next = q.data.steps.find((s) => !s.done);

  return (
    <section className="card mb-8 border-brand-200 bg-brand-50/40 p-5" aria-labelledby="onboarding-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="onboarding-title" className="text-base font-semibold text-slate-900">
            Erste Schritte
          </h2>
          <p className="text-sm text-slate-600">
            {done} von {q.data.steps.length} erledigt. Weitere Regelwerke wie NIS2 schalten Sie unter
            Einstellungen zu.
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-slate-500 underline hover:text-slate-700"
          onClick={() => {
            setHide(true);
            try {
              localStorage.setItem(HIDE_KEY, '1');
            } catch {
              /* nur Bequemlichkeit */
            }
          }}
        >
          Später
        </button>
      </div>
      <ol className="grid gap-2 md:grid-cols-5">
        {q.data.steps.map((s, i) => (
          <li key={s.key}>
            <Link
              to={s.to}
              className={clsx(
                'block h-full rounded-md border bg-white px-3 py-2 transition-colors hover:border-brand-400',
                s.key === next?.key ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200',
              )}
            >
              <span
                className={clsx(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  s.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                )}
                aria-hidden
              >
                {s.done ? '✓' : i + 1}
              </span>
              <span
                className={clsx(
                  'block text-sm font-medium',
                  s.done ? 'text-slate-500 line-through' : 'text-slate-900',
                )}
              >
                {s.title}
                <span className="sr-only">{s.done ? ': erledigt' : ': offen'}</span>
              </span>
              {!s.done && <span className="mt-0.5 block text-xs text-slate-500">{s.hint}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
