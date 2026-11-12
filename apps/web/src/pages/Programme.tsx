import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ProgrammeSteps } from '../components/Programmes';
import { CoreRecords, ReadinessCard } from '../components/ReadinessCard';
import { LEAN } from '../lib/lean';
import { SharedMeasuresCard } from '../components/SharedMeasuresCard';
import { EmptyState, ErrorNote, NormHint, PageHeader, Progress, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import type { NormRefKey } from '../lib/norm-refs';
import { type ProgrammeKey, scoreText, useProgrammes } from '../lib/programmes';

const BY_SLUG: Record<string, ProgrammeKey> = { iso27001: 'ISO27001', nis2: 'NIS2', 'ai-act': 'EU_AI_ACT' };

const INTRO: Record<ProgrammeKey, { description: string; norm: NormRefKey[] }> = {
  ISO27001: {
    description:
      'Der Weg zur Zertifizierung: Jeder Schritt zeigt, wie es steht, und führt dorthin, wo Sie ihn erledigen. Die Schritte ergeben sich aus Ihren Daten, niemand muss sie abhaken.',
    norm: ['iso:4.3', 'iso:6.1.3', 'iso:9.2', 'iso:9.3'],
  },
  NIS2: {
    description:
      'Die Pflichten nach NIS2 und BSI-Gesetz, gebündelt in vier Schritten. Was Sie für ISO 27001 umgesetzt haben, zählt hier mit; offen bleibt nur, was das Gesetz darüber hinaus verlangt.',
    norm: ['nis2:Art. 20', 'nis2:Art. 21', 'nis2:Art. 23'],
  },
  EU_AI_ACT: {
    description:
      'Ihre Pflichten als Betreiber von KI-Systemen. Welche gelten, entscheidet das KI-Register: Erst ein erfasstes System löst Pflichten aus.',
    norm: ['aiact:Art. 4', 'aiact:Art. 26'],
  },
};

export function ProgrammePage() {
  const { slug = '' } = useParams();
  const key = BY_SLUG[slug];
  const q = useProgrammes(!!key);
  if (!key) return <Navigate to="/" replace />;
  if (q.isError) return <ErrorNote error={q.error} />;
  const p = q.data?.find((x) => x.key === key);
  if (!p) return <Spinner />;

  return (
    <>
      <PageHeader
        eyebrow="Normen"
        title={p.name}
        norm={INTRO[key].norm}
        description={INTRO[key].description}
      />
      {!p.active ? (
        <EmptyState
          title="Dieses Regelwerk ist nicht aktiviert"
          hint="Unter Einstellungen, Regelwerke lässt es sich mit einem Klick zuschalten. Vorhandene Daten bleiben dabei erhalten."
        />
      ) : (
        <>
          {p.next?.urgent && (
            <Link
              to={p.next.to}
              className="mb-4 block rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 hover:underline"
            >
              <strong>Vorrang: {p.next.title}.</strong> Meldefristen nach § 32 BSIG gehen jedem anderen
              Schritt vor. Zu den Vorfällen →
            </Link>
          )}
          {/* Bei ISO 27001 steht der Stand gleich darunter im Ring der Zertifizierungsreife, mit
              Aufteilung; eine zweite Prozentzahl daneben wäre dieselbe Zahl noch einmal. */}
          <section
            className={clsx('card mb-8 grid gap-6 p-5', key !== 'ISO27001' && 'lg:grid-cols-[16rem_1fr]')}
          >
            {key !== 'ISO27001' && (
              <div>
                <p className="text-4xl font-semibold tabular-nums text-slate-900">{scoreText(p)}</p>
                <p className="text-sm text-slate-600">{p.score.label}</p>
                <div className="mt-3">
                  <Progress
                    value={p.score.value}
                    max={p.score.unit === 'pct' ? 100 : Math.max(p.score.of, 1)}
                  />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {p.current
                    ? `${p.steps.filter((s) => s.done).length} von ${p.steps.length} Schritten erledigt`
                    : 'Alle Schritte erledigt'}
                </p>
              </div>
            )}
            <ProgrammeSteps p={p} lastExtra={LEAN && key === 'ISO27001' ? <CoreRecords /> : undefined} />
          </section>
          {key === 'ISO27001' && <IsoDetails />}
          {key === 'NIS2' && <Nis2Details />}
          {key === 'EU_AI_ACT' && <AiDetails />}
        </>
      )}
    </>
  );
}

interface Chapter {
  refCode: string;
  title: string;
  applicable: number;
  covered: number;
}

/** Zertifizierungsreife mit Kernnachweisen und die Gap-Analyse je Kapitel. */
function IsoDetails() {
  const chapters = useQuery({
    queryKey: ['chapters', 'ISO27001'],
    queryFn: () => api<Chapter[]>('/soa/by-chapter?framework=ISO27001'),
  });
  return (
    <>
      {/* Schlank steht die Zertifizierungsreife schon im Lagebild; die Kernnachweise am Schritt 7. */}
      {!LEAN && <ReadinessCard />}
      <section className="card mb-8 p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
            Umsetzung je Kapitel
            <NormHint refs={['iso:6.1.3', 'iso:9.1']} />
          </h2>
          <Link to="/programme/iso27001/gap" className="text-sm text-brand-700 underline">
            Zur Gap-Analyse
          </Link>
        </div>
        <p className="lean-hide mb-4 text-sm text-slate-600">
          Anteil der anwendbaren Normpunkte, an denen eine umgesetzte Maßnahme hängt.
        </p>
        {!chapters.data ? (
          <Spinner />
        ) : (
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {chapters.data.map((c) => (
              <li key={c.refCode}>
                <Link
                  to={`/programme/iso27001/gap?chapter=${encodeURIComponent(c.refCode)}`}
                  className="block rounded px-1 py-0.5 hover:bg-slate-50"
                >
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-800">
                      <span className="font-medium">{c.refCode}</span> {c.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {c.covered} von {c.applicable}
                    </span>
                  </div>
                  <Progress value={c.covered} max={Math.max(c.applicable, 1)} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Nis2Details() {
  const { can } = useAuth();
  return (
    <>
      <section className="mb-8 grid gap-4 md:grid-cols-2">
        <LinkCard
          to="/cockpit?framework=NIS2"
          title="Pflicht für Pflicht"
          text="Alle 13 Pflichten mit BSIG-Paragraf, den passenden ISO-27001-Controls und den Maßnahmen, die sie erfüllen. Indirekt abgedeckte Pflichten ordnen Sie dort mit einem Klick zu."
        />
        <LinkCard
          to="/incidents"
          title="Meldungen nach § 32 BSIG"
          text="Erhebliche Vorfälle mit Frühwarnung nach 24 Stunden, Meldung nach 72 Stunden und Abschlussbericht nach einem Monat. Die Fristen starten mit der Einstufung."
        />
      </section>
      {can('measure.read') && <SharedMeasuresCard />}
    </>
  );
}

function AiDetails() {
  return (
    <section className="mb-8 grid gap-4 md:grid-cols-2">
      <LinkCard
        to="/ai"
        title="KI-Register"
        text="Jedes eingesetzte KI-System, eingestuft über wenige Fragen, mit Begründung und Fundstelle. Daraus folgen die Betreiberpflichten."
      />
      <LinkCard
        to="/cockpit?framework=EU_AI_ACT"
        title="Betreiberpflichten"
        text="Die Pflichten, die Ihre Systeme auslösen, mit den Maßnahmen, die sie erfüllen, und ab wann sie gelten."
      />
    </section>
  );
}

function LinkCard({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to} className="card block p-5 transition-shadow hover:shadow-sm">
      <h2 className="font-semibold text-slate-900">{title} →</h2>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </Link>
  );
}
