import { useQuery } from '@tanstack/react-query';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import {
  ErrorNote,
  FrameworkChip,
  NormHint,
  PageHeader,
  Progress,
  relativeDays,
  Spinner,
  StatTile,
} from '../components/ui';
import { AuditPackageButton } from '../components/AuditPackageButton';
import { api } from '../lib/api';
import { CHART } from '../lib/chart-colors';

interface Coverage {
  key: string;
  name: string;
  version: string;
  isPrimary: boolean;
  /** IT-Grundschutz: gezählt wird nur, was in modellierten Bausteinen steht. */
  modular: boolean;
  applicable: number;
  notApplicable: number;
  covered: number;
  pct: number;
  avgMaturity: string | null;
}

interface Summary {
  assets: number;
  openRisks: number;
  criticalRisks: number;
  measures: number;
  measuresImplemented: number;
  measuresOverdue: number;
  documentsOverdue: number;
  openAcknowledgements: number;
  openIncidents: number;
  openReportingObligations: number;
  openMajorFindings: number;
  openActions: number;
}

interface Chapter {
  refCode: string;
  title: string;
  applicable: number;
  covered: number;
  avgMaturity: string | null;
  avgTargetMaturity: string | null;
}

interface DeadlineSummary {
  overdue: number;
  dueThisWeek: number;
  dueThisMonth: number;
  critical: number;
  next: {
    kind: string;
    id: string;
    title: string;
    context: string | null;
    ownerName: string | null;
    dueAt: string;
    daysLeft: number;
  }[];
}

export function DashboardPage() {
  const coverage = useQuery({
    queryKey: ['coverage'],
    queryFn: () => api<Coverage[]>('/dashboard/coverage'),
  });
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/dashboard/summary') });
  const deadlines = useQuery({
    queryKey: ['deadlines-summary'],
    queryFn: () => api<DeadlineSummary>('/deadlines/summary'),
  });
  const primary = coverage.data?.find((c) => c.isPrimary) ?? coverage.data?.[0];
  const chapters = useQuery({
    queryKey: ['chapters', primary?.key],
    queryFn: () => api<Chapter[]>(`/soa/by-chapter?framework=${primary!.key}`),
    enabled: !!primary,
  });

  // Radar zeigt den Reifegrad der Selbstbewertung (0–5) — die Abdeckung steht in den Kacheln darüber.
  const radar = (chapters.data ?? [])
    .filter((c) => c.applicable > 0)
    .map((c) => ({
      chapter: c.refCode,
      reifegrad: c.avgMaturity != null ? Number(c.avgMaturity) : 0,
      ziel: c.avgTargetMaturity != null ? Number(c.avgTargetMaturity) : 0,
    }));
  const assessed = radar.filter((r) => r.reifegrad > 0).length;
  // Ohne gepflegte Zielwerte keine Ziel-Fläche — eine leere Legende führt nur in die Irre.
  const hasTarget = radar.some((r) => r.ziel > 0);

  return (
    <>
      <PageHeader
        eyebrow="Überblick"
        title="ISMS auf einen Blick"
        norm={['iso:9.1', 'iso:9.3']}
        description="Abdeckung der aktivierten Normen, offene Risiken und fällige Aufgaben — aus den gepflegten Daten berechnet, nicht separat gepflegt."
        actions={<AuditPackageButton />}
      />
      <ErrorNote error={coverage.error ?? summary.error ?? deadlines.error} />

      {summary.data && (
        <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Offene Risiken"
            norm={['iso:6.1.2', 'iso:8.2']}
            value={summary.data.openRisks}
            hint={`${summary.data.criticalRisks} kritisch`}
            tone={summary.data.criticalRisks > 0 ? 'bad' : 'neutral'}
          />
          <StatTile
            label="Maßnahmen umgesetzt"
            norm={['iso:6.1.3', 'iso:8.3']}
            value={`${summary.data.measuresImplemented} / ${summary.data.measures}`}
            hint={
              summary.data.measuresOverdue > 0
                ? `${summary.data.measuresOverdue} überfällig`
                : 'keine überfällig'
            }
            tone={summary.data.measuresOverdue > 0 ? 'warn' : 'good'}
          />
          <StatTile
            label="Assets im Geltungsbereich"
            norm={['iso:A.5.9', 'iso:4.3']}
            value={summary.data.assets}
          />
          <StatTile
            label="Offene Meldefristen"
            norm={['nis2:Art. 23', 'dsgvo:Art. 33']}
            value={summary.data.openReportingObligations}
            hint="DSGVO Art. 33 · NIS2 §32"
            tone={summary.data.openReportingObligations > 0 ? 'bad' : 'good'}
          />
          <StatTile
            label="Offene Vorfälle"
            norm={['iso:A.5.25', 'iso:A.5.26']}
            value={summary.data.openIncidents}
            tone={summary.data.openIncidents > 0 ? 'warn' : 'good'}
          />
          <StatTile
            label="Offene KVP-Maßnahmen"
            norm={['iso:10.1', 'iso:10.2']}
            value={summary.data.openActions}
            hint={
              summary.data.openMajorFindings > 0
                ? `${summary.data.openMajorFindings} aus Hauptabweichungen`
                : undefined
            }
            tone={summary.data.openMajorFindings > 0 ? 'bad' : 'neutral'}
          />
          <StatTile
            label="Dokumentenprüfung fällig"
            norm="iso:7.5"
            value={summary.data.documentsOverdue}
            hint="Turnusmäßige Überprüfung nach Kap. 7.5.2"
            tone={summary.data.documentsOverdue > 0 ? 'warn' : 'good'}
          />
          <StatTile
            label="Offene Lesebestätigungen"
            norm={['iso:7.3', 'iso:A.6.3']}
            value={summary.data.openAcknowledgements}
            hint="über alle angeforderten Kenntnisnahmen"
            tone={summary.data.openAcknowledgements > 0 ? 'warn' : 'good'}
          />
        </section>
      )}

      {deadlines.data && deadlines.data.next.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-500">
              Als Nächstes fällig
              <NormHint refs={['iso:9.1', 'iso:10.2']} />
            </h2>
            <Link to="/deadlines" className="text-xs text-brand-700 underline">
              {deadlines.data.overdue > 0
                ? `${deadlines.data.overdue} überfällig · alle ${deadlines.data.dueThisMonth} anzeigen`
                : `alle ${deadlines.data.dueThisMonth} anzeigen`}
            </Link>
          </div>
          <ul className="card divide-y divide-slate-100">
            {deadlines.data.next.map((d) => (
              <li
                key={`${d.kind}-${d.id}-${d.dueAt}`}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="min-w-0 text-sm text-slate-800">
                  {d.title}
                  {d.context && <span className="ml-2 text-xs text-slate-500">{d.context}</span>}
                  {/* Ohne die verantwortliche Person lesen sich zwei Zuweisungen derselben
                      Schulung wie ein doppelter Eintrag. */}
                  {d.ownerName && <span className="ml-2 text-xs text-slate-400">{d.ownerName}</span>}
                </span>
                <span
                  className={clsx(
                    'shrink-0 text-xs font-medium',
                    d.daysLeft < 0
                      ? 'text-level-critical'
                      : d.daysLeft <= 7
                        ? 'text-level-high'
                        : 'text-slate-500',
                  )}
                >
                  {relativeDays(d.daysLeft)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-500">
          Framework-Compliance
          <NormHint refs={['iso:6.1.3', 'iso:9.1']} />
        </h2>
        {coverage.isLoading ? (
          <Spinner />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {coverage.data?.map((c) => (
              <Link
                key={c.key}
                to={`/soa?framework=${c.key}`}
                className="card block p-4 transition-shadow hover:shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <FrameworkChip k={c.key} />
                  {c.isPrimary && <span className="text-xs text-slate-400">Hauptfokus</span>}
                </div>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{c.pct}%</p>
                <p className="mb-2 text-xs text-slate-500">
                  {c.modular && c.applicable + c.notApplicable === 0
                    ? 'Noch keine Bausteine modelliert'
                    : c.modular
                      ? `${c.covered} von ${c.applicable} Anforderungen der modellierten Bausteine abgedeckt`
                      : `${c.covered} von ${c.applicable} anwendbaren Anforderungen abgedeckt`}
                  {c.notApplicable > 0 &&
                    ` · ${c.notApplicable} ${c.modular ? 'entbehrlich' : 'nicht anwendbar'}`}
                </p>
                <Progress value={c.pct} tone="level" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {radar.length >= 3 && primary && (
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                Reifegrad je Kapitel — {primary.name}
                <NormHint refs={['iso:9.1', 'bsi:200-2']} />
              </h2>
              <p className="text-xs text-slate-500">
                Selbstbewertung auf einer Skala von 0 bis 5.{' '}
                {assessed === 0 &&
                  'Noch nichts bewertet — Reifegrade pflegen Sie im Register „Anforderungen & SoA“.'}
              </p>
            </div>
            <span className="text-xs tabular-nums text-slate-500">Ø {primary.avgMaturity ?? '–'} / 5</span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke={CHART.grid} />
                <PolarAngleAxis dataKey="chapter" tick={{ fontSize: 11, fill: CHART.axis }} />
                <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 10, fill: CHART.muted }} />
                {hasTarget && (
                  <Radar
                    name="Ziel"
                    dataKey="ziel"
                    stroke={CHART.target}
                    fill={CHART.target}
                    fillOpacity={0.25}
                  />
                )}
                <Radar
                  name="Reifegrad"
                  dataKey="reifegrad"
                  stroke={CHART.brand}
                  fill={CHART.brandSoft}
                  fillOpacity={0.35}
                  dot
                />
                {hasTarget && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </>
  );
}
