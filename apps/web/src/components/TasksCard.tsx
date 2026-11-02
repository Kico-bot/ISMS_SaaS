import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorNote, NormHint } from './ui';

export interface DerivedTask {
  key: string;
  title: string;
  count: number;
  to: string;
}

export function useTasks(enabled = true) {
  return useQuery({
    queryKey: ['programme-tasks'],
    queryFn: () => api<DerivedTask[]>('/programmes/tasks'),
    enabled,
  });
}

/**
 * Offene Aufgaben, wie die Daten sie ergeben: ein Control ohne Entscheidung, ein Asset ohne
 * Verantwortliche, ein hohes Risiko ohne Behandlung. Zugeklappt steht nur die Anzahl da, damit
 * das Lagebild aus Zahlen besteht; aufgeklappt führt jede Zeile dorthin, wo man sie erledigt.
 * Ist sie erledigt, verschwindet sie von selbst. Abhaken muss niemand etwas.
 */
export function TasksCard() {
  const q = useTasks();
  if (q.isError) return <ErrorNote error={q.error} />;
  if (!q.data) return null;
  const total = q.data.length;
  return (
    <details className="card group mb-8 overflow-hidden" data-hint-scope>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50">
        <span
          className={
            total > 0
              ? 'rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-amber-900'
              : 'rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-semibold tabular-nums text-emerald-800'
          }
        >
          {total}
        </span>
        <span className="flex flex-1 items-center gap-1.5 text-sm font-medium text-slate-800">
          Offene Aufgaben
          <NormHint refs={['iso:6.1.3', 'iso:9.1']} />
        </span>
        <span aria-hidden className="text-xs text-slate-500 group-open:hidden">
          anzeigen ▾
        </span>
        <span aria-hidden className="hidden text-xs text-slate-500 group-open:inline">
          ausblenden ▴
        </span>
      </summary>
      {total === 0 ? (
        <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">Keine offenen Aufgaben.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {q.data.map((t) => (
            <li key={t.key}>
              <Link to={t.to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className="w-10 shrink-0 text-right text-base font-semibold tabular-nums text-slate-900">
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
    </details>
  );
}
