import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AuditPackageButton } from '../components/AuditPackageButton';
import { OnboardingCard } from '../components/OnboardingCard';
import { ProgrammeCards } from '../components/Programmes';
import { TasksCard, useTasks } from '../components/TasksCard';
import { ErrorNote, PageHeader, StatTile } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface Summary {
  assets: number;
  assetsOwned: number;
  openRisks: number;
  criticalRisks: number;
  measures: number;
  measuresImplemented: number;
  measuresOverdue: number;
  documentsOverdue: number;
  openAcknowledgements: number;
  openIncidents: number;
  openReportingObligations: number;
  openReportingNis2: number;
  openReportingGdpr: number;
  openReportingAi: number;
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
  const tasks = useTasks(can('soa.read'));
  const undecided = tasks.data?.find((t) => t.key === 'isoUndecided')?.count ?? 0;
  const s = summary.data;
  const d = deadlines.data;

  return (
    <>
      <PageHeader
        eyebrow="Start"
        title="Lagebild"
        norm={['iso:9.1', 'iso:9.3']}
        description="Wo ISO 27001 und NIS2 stehen. Jede Zahl führt zu den Einträgen dahinter."
        actions={<AuditPackageButton />}
      />
      <ErrorNote error={summary.error ?? deadlines.error} />

      {can('soa.read') && <OnboardingCard />}
      {can('soa.read') && <ProgrammeCards />}

      {/* Nur Zahlen, jede ein Link: die Einträge selbst stehen auf der Seite dahinter. */}
      {s && (
        <section aria-label="Lage in Zahlen" className="mb-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Lage in Zahlen</h2>
            <ul className="flex gap-3 text-[11px] text-slate-500" aria-label="Bedeutung der Farben">
              <li className="flex items-center gap-1">
                <span aria-hidden className="h-3 w-1 rounded-sm bg-level-low" /> in Ordnung
              </li>
              <li className="flex items-center gap-1">
                <span aria-hidden className="h-3 w-1 rounded-sm bg-level-medium" /> ansehen
              </li>
              <li className="flex items-center gap-1">
                <span aria-hidden className="h-3 w-1 rounded-sm bg-level-critical" /> dringend
              </li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {can('measure.read') && (
              <Tile to="/measures">
                <StatTile
                  label="Offene Maßnahmen"
                  norm={['iso:6.1.3', 'iso:8.3']}
                  value={s.measures - s.measuresImplemented}
                  hint={
                    s.measuresOverdue > 0
                      ? `${s.measuresOverdue} überfällig`
                      : `${s.measuresImplemented} von ${s.measures} umgesetzt`
                  }
                  tone={s.measuresOverdue > 0 ? 'warn' : 'neutral'}
                />
              </Tile>
            )}
            {can('soa.read') && (
              <Tile to="/programme/iso27001/gap">
                <StatTile
                  label="Controls ohne Entscheidung"
                  norm="iso:6.1.3"
                  value={undecided}
                  hint="aus Anhang A"
                  tone={undecided > 0 ? 'warn' : 'good'}
                />
              </Tile>
            )}
            {can('risk.read') && (
              <Tile to="/risks">
                <StatTile
                  label="Offene Risiken"
                  norm={['iso:6.1.2', 'iso:8.2']}
                  value={s.openRisks}
                  hint={`${s.criticalRisks} kritisch`}
                  tone={s.criticalRisks > 0 ? 'bad' : 'neutral'}
                />
              </Tile>
            )}
            {can('audit.read') && (
              <Tile to="/findings">
                <StatTile
                  label="Offene Hauptabweichungen"
                  norm="iso:10.2"
                  value={s.openMajorFindings}
                  hint={`${s.openActions} Verbesserungen offen`}
                  tone={s.openMajorFindings > 0 ? 'bad' : 'good'}
                />
              </Tile>
            )}
            {d && (
              <Tile to="/deadlines">
                <StatTile
                  label="Fristen überfällig"
                  norm={['iso:9.1', 'iso:10.2']}
                  value={d.overdue}
                  hint={`${d.dueThisWeek} in den nächsten 7 Tagen`}
                  tone={d.overdue > 0 ? 'bad' : 'good'}
                />
              </Tile>
            )}
            {can('incident.read') && (
              <Tile to="/incidents">
                <StatTile
                  label="Offene Meldefristen"
                  norm="nis2:Art. 23"
                  value={s.openReportingObligations}
                  hint={reportingHint(s)}
                  tone={s.openReportingObligations > 0 ? 'bad' : 'good'}
                />
              </Tile>
            )}
            {can('incident.read') && (
              <Tile to="/incidents">
                <StatTile
                  label="Offene Vorfälle"
                  norm={['iso:A.5.25', 'iso:A.5.26']}
                  value={s.openIncidents}
                  tone={s.openIncidents > 0 ? 'warn' : 'good'}
                />
              </Tile>
            )}
            {can('asset.read') && (
              <Tile to="/assets">
                <StatTile
                  label="Assets ohne Verantwortliche"
                  norm={['iso:A.5.9', 'iso:5.3']}
                  value={s.assets - s.assetsOwned}
                  hint={`${s.assets} Assets erfasst`}
                  tone={s.assets > s.assetsOwned ? 'warn' : 'good'}
                />
              </Tile>
            )}
          </div>
        </section>
      )}

      {can('soa.read') && <TasksCard />}
    </>
  );
}

function Tile({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block h-full rounded-lg transition-shadow hover:shadow-sm [&>div]:h-full">
      {children}
    </Link>
  );
}

/** Woher die Meldefristen kommen: NIS2, DSGVO und KI-Verordnung zählen getrennt. */
function reportingHint(s: Summary): string | undefined {
  const parts = [
    s.openReportingNis2 && `${s.openReportingNis2} NIS2`,
    s.openReportingGdpr && `${s.openReportingGdpr} DSGVO`,
    s.openReportingAi && `${s.openReportingAi} KI-Verordnung`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}
