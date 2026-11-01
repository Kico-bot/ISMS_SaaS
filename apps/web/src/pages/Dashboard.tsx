import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AuditPackageButton } from '../components/AuditPackageButton';
import { ProgrammeCards } from '../components/Programmes';
import { SharedMeasuresCard } from '../components/SharedMeasuresCard';
import { ErrorNote, NormHint, PageHeader, relativeDays, Spinner, StatTile } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

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
    overdue: boolean;
    immediate: boolean;
  }[];
}

export function DashboardPage() {
  const { can } = useAuth();
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/dashboard/summary') });
  const deadlines = useQuery({
    queryKey: ['deadlines-summary'],
    queryFn: () => api<DeadlineSummary>('/deadlines/summary'),
  });

  return (
    <>
      <PageHeader
        eyebrow="Überblick"
        title="Lagebild"
        norm={['iso:9.1', 'iso:9.3']}
        description="Wo ISO 27001, NIS2 und der EU AI Act stehen und was als Nächstes zu tun ist. Alles wird aus Ihren Daten berechnet, jede Zahl führt zu den Einträgen dahinter."
        actions={<AuditPackageButton />}
      />
      <ErrorNote error={summary.error ?? deadlines.error} />

      {can('soa.read') && <ProgrammeCards />}

      <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-500">
              Als Nächstes fällig
              <NormHint refs={['iso:9.1', 'iso:10.2']} />
            </h2>
            {deadlines.data && (
              <Link to="/deadlines" className="text-xs text-brand-700 underline">
                {deadlines.data.overdue > 0
                  ? `${deadlines.data.overdue} überfällig · alle ${deadlines.data.dueThisMonth} anzeigen`
                  : `alle ${deadlines.data.dueThisMonth} anzeigen`}
              </Link>
            )}
          </div>
          {!deadlines.data ? (
            <Spinner />
          ) : deadlines.data.next.length === 0 ? (
            <p className="card px-4 py-6 text-sm text-slate-500">Nichts fällig. Gut so.</p>
          ) : (
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
                      d.overdue
                        ? 'text-level-critical'
                        : d.daysLeft <= 7
                          ? 'text-level-high'
                          : 'text-slate-500',
                    )}
                  >
                    {d.immediate ? 'unverzüglich' : relativeDays(d.daysLeft, d.overdue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {summary.data && (
          <section aria-label="Lage in Zahlen">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
              Lage in Zahlen
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/incidents" className="block">
                <StatTile
                  label="Offene Meldefristen"
                  norm="nis2:Art. 23"
                  value={summary.data.openReportingObligations}
                  tone={summary.data.openReportingObligations > 0 ? 'bad' : 'good'}
                />
              </Link>
              <Link to="/risks" className="block">
                <StatTile
                  label="Offene Risiken"
                  norm={['iso:6.1.2', 'iso:8.2']}
                  value={summary.data.openRisks}
                  hint={`${summary.data.criticalRisks} kritisch`}
                  tone={summary.data.criticalRisks > 0 ? 'bad' : 'neutral'}
                />
              </Link>
              <Link to="/measures" className="block">
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
              </Link>
              <Link to="/incidents" className="block">
                <StatTile
                  label="Offene Vorfälle"
                  norm={['iso:A.5.25', 'iso:A.5.26']}
                  value={summary.data.openIncidents}
                  tone={summary.data.openIncidents > 0 ? 'warn' : 'good'}
                />
              </Link>
            </div>
          </section>
        )}
      </div>

      {can('measure.read') && <SharedMeasuresCard />}
    </>
  );
}
