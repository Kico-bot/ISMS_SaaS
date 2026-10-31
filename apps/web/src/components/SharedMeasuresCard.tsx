import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ErrorNote, FrameworkChip, NormHint, Spinner, StatusBadge } from './ui';

interface SharedMeasures {
  total: number;
  shared: number;
  items: {
    id: string;
    refNo: string;
    title: string;
    status: string;
    frameworks: { key: string; name: string; refs: { refCode: string; altRef: string | null }[] }[];
  }[];
}

/**
 * Eine Maßnahme, mehrere Regelwerke: der Kern der Suite auf der Startseite. Jede Zeile zeigt eine
 * Maßnahme und daneben, welche Anforderungen sie in ISO 27001, NIS2 und dem AI Act zugleich
 * erfüllt. Wer den Status einmal pflegt, ändert ihn in allen Regelwerken.
 */
export function SharedMeasuresCard() {
  const q = useQuery({
    queryKey: ['shared-measures'],
    queryFn: () => api<SharedMeasures>('/dashboard/shared-measures'),
  });

  if (q.isError) return <ErrorNote error={q.error} />;
  if (!q.data) return <Spinner />;
  const d = q.data;
  if (d.shared === 0) return null;

  return (
    <section className="card mb-8 p-5" aria-labelledby="shared-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="shared-title" className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
            Eine Maßnahme, mehrere Regelwerke
            <NormHint refs={['iso:6.1.3', 'nis2:Art. 21']} />
          </h2>
          <p className="text-sm text-slate-600">
            <strong className="tabular-nums text-slate-900">{d.shared}</strong> von {d.total} Maßnahmen
            erfüllen Anforderungen aus mehreren Regelwerken zugleich. Gepflegt werden sie einmal, ihr Stand
            zählt überall.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link to="/cockpit?framework=NIS2" className="text-brand-700 underline">
            NIS2 auf ISO 27001 abgebildet
          </Link>
          <Link to="/measures?shared=1" className="text-brand-700 underline">
            Alle gemeinsamen Maßnahmen
          </Link>
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {d.items.map((m) => (
          <li key={m.id} className="grid gap-2 py-3 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <div>
              <Link to={`/measures?open=${m.id}`} className="font-medium text-slate-800 hover:underline">
                {m.title}
              </Link>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{m.refNo}</span>
                <StatusBadge status={m.status} />
              </div>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {m.frameworks.map((f) => (
                <div key={f.key} className="rounded-md border border-slate-200 px-2.5 py-1.5">
                  <FrameworkChip k={f.key} />
                  <p className="mt-1 text-xs text-slate-700">
                    {f.refs.map((r, i) => (
                      <span key={r.refCode}>
                        {i > 0 && ', '}
                        <span className="font-medium">{r.refCode}</span>
                        {r.altRef && <span className="text-slate-500"> ({r.altRef})</span>}
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
