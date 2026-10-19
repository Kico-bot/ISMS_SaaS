import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { CHART } from '../lib/chart-colors';
import type { NormRefKey } from '../lib/norm-refs';
import { ErrorNote, NormHint, Spinner } from './ui';

export interface Readiness {
  framework: string;
  total: number;
  fulfilled: number;
  partial: number;
  open: number;
  notApplicable: number;
  pct: number;
  evidence: { key: string; label: string; norm: NormRefKey; ok: boolean }[];
  evidenceMet: number;
}

/**
 * Zertifizierungsreife nach ISO 27001: ein Ring über die 123 prüfbaren Punkte der Norm, daneben
 * die Kernnachweise, nach denen ein Auditor zuerst fragt. Der Ring zeigt einen Anteil am Ganzen
 * mit drei Teilen; die Zahl in der Mitte ist das, was man sich merken soll.
 */
export function ReadinessCard() {
  const q = useQuery({
    queryKey: ['certification-readiness'],
    queryFn: () => api<Readiness>('/dashboard/certification-readiness'),
  });

  if (q.isError) return <ErrorNote error={q.error} />;
  if (!q.data) return <Spinner />;
  const r = q.data;
  const done = r.fulfilled + r.notApplicable;
  const segments = [
    { name: 'Erfüllt', value: done, color: CHART.brand },
    { name: 'Teilweise', value: r.partial, color: CHART.brandLight },
    { name: 'Offen', value: r.open, color: CHART.track },
  ];

  return (
    <section className="card mb-8 p-5" aria-labelledby="readiness-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id="readiness-title"
            className="flex items-center gap-1.5 text-base font-semibold text-slate-900"
          >
            Zertifizierungsreife ISO 27001
            <NormHint refs={['iso:6.1.3', 'iso:9.2', 'iso:9.3']} />
          </h2>
          <p className="text-sm text-slate-600">
            Wie viele der {r.total} prüfbaren Punkte aus Kapitel 4 bis 10 und Anhang A erfüllt sind.
          </p>
        </div>
        <Link to="/soa?framework=ISO27001" className="text-sm text-brand-700 underline">
          Zur Anforderungsliste
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segments}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="72%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="#ffffff"
                  strokeWidth={2}
                  cornerRadius={4}
                  isAnimationActive={false}
                >
                  {segments.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} von ${r.total} Punkten`, name]}
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-semibold tabular-nums text-slate-900">{r.pct}%</span>
              <span className="text-xs text-slate-500">bereit</span>
            </div>
          </div>

          <ul className="w-full min-w-[12rem] space-y-2 text-sm" aria-label="Aufteilung der Punkte">
            <LegendRow color={CHART.brand} label="Erfüllt" value={done}>
              {r.notApplicable > 0 && (
                <span className="block text-xs text-slate-500">
                  davon {r.notApplicable} begründet nicht anwendbar
                </span>
              )}
            </LegendRow>
            <LegendRow color={CHART.brandLight} label="Teilweise" value={r.partial}>
              <span className="block text-xs text-slate-500">zählt halb</span>
            </LegendRow>
            <LegendRow color={CHART.track} label="Offen" value={r.open} outlined />
          </ul>
        </div>

        <div>
          <h3 className="mb-2 flex items-baseline justify-between gap-2 text-sm font-medium text-slate-800">
            Kernnachweise für das Zertifizierungsaudit
            <span className="text-xs font-normal tabular-nums text-slate-500">
              {r.evidenceMet} von {r.evidence.length} vorhanden
            </span>
          </h3>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {r.evidence.map((e) => (
              <li key={e.key} className="flex items-start gap-2 text-sm">
                <EvidenceIcon ok={e.ok} />
                <span className={e.ok ? 'text-slate-700' : 'text-slate-900'}>
                  {e.label}
                  <span className="sr-only">{e.ok ? ': vorhanden' : ': fehlt noch'}</span>
                </span>
                <NormHint refs={[e.norm]} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Die Prozentzahl misst die Anforderungen. Die Kernnachweise stehen daneben, weil ein fehlendes
            internes Audit oder eine fehlende Managementbewertung die Zertifizierung allein verhindert.
          </p>
        </div>
      </div>
    </section>
  );
}

function LegendRow(props: {
  color: string;
  label: string;
  value: number;
  outlined?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-1 h-3 w-3 shrink-0 rounded-sm"
        style={{ background: props.color, border: props.outlined ? `1px solid ${CHART.muted}` : undefined }}
      />
      <span className="min-w-0 flex-1 text-slate-700">
        {props.label}
        {props.children}
      </span>
      <span className="tabular-nums text-slate-900">{props.value}</span>
    </li>
  );
}

function EvidenceIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
        clipRule="evenodd"
      />
    </svg>
  ) : (
    <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
