import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorNote, NormHint, Spinner } from './ui';

interface DerivedTask {
  key: string;
  title: string;
  count: number;
  to: string;
}

/**
 * Offene Aufgaben, wie die Daten sie ergeben: ein Control ohne Entscheidung, ein Asset ohne
 * Verantwortliche, ein hohes Risiko ohne Behandlung. Jede Zeile führt dorthin, wo man sie
 * erledigt; ist sie erledigt, verschwindet sie von selbst. Abhaken muss niemand etwas.
 */
export function TasksCard() {
  const q = useQuery({
    queryKey: ['programme-tasks'],
    queryFn: () => api<DerivedTask[]>('/programmes/tasks'),
  });
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-500">
        Offene Aufgaben
        <NormHint refs={['iso:6.1.3', 'iso:9.1']} />
      </h2>
      {q.isError ? (
        <ErrorNote error={q.error} />
      ) : !q.data ? (
        <Spinner />
      ) : q.data.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-slate-500">Keine offenen Aufgaben. Gut so.</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {q.data.map((t) => (
            <li key={t.key}>
              <Link to={t.to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className="w-10 shrink-0 text-right text-lg font-semibold tabular-nums text-slate-900">
                  {t.count}
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-800">{t.title}</span>
                <span aria-hidden className="text-slate-400">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
