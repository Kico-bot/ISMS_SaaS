import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ErrorNote, FrameworkChip, NormHint, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { LEAN, LEAN_HIDDEN_FRAMEWORKS } from '../lib/lean';
import { useAuth } from '../lib/auth-context';

interface Framework {
  id: string;
  key: string;
  name: string;
  version: string | null;
  publisher: string | null;
  jurisdiction: string | null;
  licenseNote: string | null;
  isActive: boolean;
  isPrimary: boolean;
  activatedAt: string | null;
  requirementCount: number;
  inScopeCount: number;
  modular: boolean;
}

/** Wozu ein Framework dient — damit die Auswahl nicht zum Ratespiel wird. */
const PURPOSE: Record<string, string> = {
  ISO27001:
    'Die Managementsystem-Norm. Zertifizierbar, und in dieser Anwendung der Bezugspunkt für Kapitelstruktur, Auditprogramm und Managementbewertung.',
  BSI_GS:
    'Der IT-Grundschutz des BSI: Bausteine mit konkreten Anforderungen. Statt einer Anwendbarkeitserklärung wählen Sie unter „Anforderungen“ die zutreffenden Bausteine (Modellierung); nur deren Anforderungen zählen.',
  BSI_STD200: 'Die BSI-Standards 200-1 bis 200-4 als Vorgehensmodell.',
  NIS2: 'Die NIS2-Richtlinie, in Deutschland umgesetzt im BSI-Gesetz (§§ 30, 32, 33, 38 BSIG). Gezählt werden nur die Pflichten des Unternehmens: Leitung, die zehn Risikomaßnahmen, Meldungen und Registrierung. Artikel, die sich an die Mitgliedstaaten richten, zählen nicht.',
  EU_AI_ACT:
    'Die KI-Verordnung, und zwar nur mit den Pflichten als Betreiber, also für KI-Systeme, die Sie einsetzen. Anbieterpflichten (Konformitätsbewertung, CE-Kennzeichnung, technische Dokumentation) sind nicht enthalten. Welche Pflichten gelten, bestimmt das KI-Register.',
  DSGVO:
    'Die Datenschutz-Grundverordnung. Aktiviert die Anforderungen, auf die Verarbeitungsverzeichnis und DSFA zahlen.',
};

/**
 * Mandanteneinstellungen.
 *
 * Kern ist die Auswahl der Normen: eine Maßnahme zahlt auf die Anforderungen aller aktiven
 * Frameworks gleichzeitig ein, deshalb entscheidet diese Seite darüber, wie viel Arbeit eine
 * einzelne Pflege spart.
 */
export function SettingsPage() {
  const { can, session } = useAuth();
  const qc = useQueryClient();
  const writable = can('framework.activate');

  const frameworks = useQuery({
    queryKey: ['frameworks'],
    queryFn: () => api<Framework[]>('/frameworks'),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['frameworks'] });
    void qc.invalidateQueries({ queryKey: ['coverage'] });
    void qc.invalidateQueries({ queryKey: ['soa'] });
  };
  const activate = useMutation({
    mutationFn: (v: { frameworkKey: string; isPrimary?: boolean }) =>
      api('/frameworks/activate', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: refresh,
  });
  const deactivate = useMutation({
    mutationFn: (key: string) => api(`/frameworks/${key}/activate`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  /** Hauptnorm zuerst, dann die übrigen aktiven, dann der Rest — sonst steht sie mitten drin. */
  const rows = [...(frameworks.data ?? [])].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      Number(b.isActive) - Number(a.isActive) ||
      a.name.localeCompare(b.name, 'de'),
  );
  const activeCount = rows.filter((f) => f.isActive).length;
  // Schlank stehen nur ISO 27001, NIS2 und der EU AI Act zur Wahl. DSGVO und IT-Grundschutz
  // bleiben samt Daten erhalten und erscheinen mit VITE_FULL_UI=true wieder.
  const shown = LEAN ? rows.filter((f) => !LEAN_HIDDEN_FRAMEWORKS.includes(f.key)) : rows;

  return (
    <>
      <PageHeader
        eyebrow="Einstellungen"
        title="Regelwerke"
        norm={['iso:4.3', 'iso:6.1.3']}
        description="Welche Normen dieser Mandant führt. Jede aktivierte Norm erscheint als Reiter unter „Normen“. Eine Maßnahme zählt dabei für alle zugleich."
      />
      <ErrorNote error={frameworks.error ?? activate.error ?? deactivate.error} />

      <section className="mb-6">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          Organisation <NormHint refs="iso:4.3" />
        </h2>
        <div className="card p-4 text-sm text-slate-700">
          <p>
            <span className="text-slate-500">Name:</span> {session?.activeTenant?.tenantName ?? '–'}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Kürzel:</span>{' '}
            <span className="font-mono text-xs">{session?.activeTenant?.tenantSlug ?? '–'}</span>
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Eigene Rollen:</span>{' '}
            {session?.activeTenant?.roles.join(', ') || '–'}
          </p>
        </div>
      </section>

      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
        Normen & Regelwerke <NormHint refs={['iso:4.3', 'iso:6.1.3']} />
      </h2>
      {frameworks.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((f) => (
            <article
              key={f.key}
              className={clsx('card p-4', f.isActive ? 'border-l-4 border-l-brand-500' : 'opacity-75')}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <FrameworkChip k={f.key} />
                  {f.isPrimary && <span className="text-xs font-medium text-brand-700">Hauptnorm</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {/* Gezählt wird, was in der SoA bewertet werden kann — Kapitelüberschriften
                      zählen nicht mit, sonst verspräche die Zahl mehr als sie hält. */}
                  {f.modular && f.isActive
                    ? `${f.inScopeCount} von ${f.requirementCount} Anforderungen modelliert`
                    : f.key === 'EU_AI_ACT'
                      ? `${f.requirementCount} Betreiberpflichten${f.isActive ? `, ${f.inScopeCount} durch das KI-Register ausgelöst` : ''}`
                      : f.inScopeCount < f.requirementCount
                        ? `${f.inScopeCount} Pflichten für Unternehmen (von ${f.requirementCount} Einträgen im Katalog)`
                        : `${f.requirementCount} bewertbare Anforderungen`}
                  {f.version && ` · Ausgabe ${f.version}`}
                </span>
              </div>

              <p className="text-sm text-slate-800">{f.name}</p>
              <p className="mt-1 text-xs text-slate-600">{PURPOSE[f.key] ?? f.publisher}</p>
              {f.licenseNote && <p className="mt-1 text-xs text-slate-400">{f.licenseNote}</p>}

              {writable && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {f.isActive ? (
                    <>
                      {!f.isPrimary && (
                        <button
                          type="button"
                          className="btn-ghost py-0.5 text-xs"
                          disabled={activate.isPending}
                          onClick={() => activate.mutate({ frameworkKey: f.key, isPrimary: true })}
                        >
                          Zur Hauptnorm machen
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost py-0.5 text-xs"
                        disabled={deactivate.isPending || f.isPrimary || activeCount === 1}
                        title={
                          f.isPrimary
                            ? 'Bestimmen Sie zuerst eine andere Hauptnorm.'
                            : activeCount === 1
                              ? 'Das letzte aktive Framework lässt sich nicht abwählen.'
                              : undefined
                        }
                        onClick={() => deactivate.mutate(f.key)}
                      >
                        Abwählen
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn-ghost py-0.5 text-xs"
                      disabled={activate.isPending || f.requirementCount === 0}
                      title={
                        f.requirementCount === 0
                          ? 'Für dieses Regelwerk gibt es nur Kapitelangaben, also nichts zu bewerten.'
                          : undefined
                      }
                      onClick={() => activate.mutate({ frameworkKey: f.key })}
                    >
                      Aktivieren
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Abwählen löscht nichts: Anwendbarkeit, Begründungen, Reifegrade und die Zuordnung von Maßnahmen hängen
        an der Anforderung, nicht an der Aktivierung. Wer versehentlich abwählt und erneut aktiviert, findet
        alles unverändert vor.
      </p>

      {can('tenant.settings') && can('risk.read') && <RiskScaleSection />}
    </>
  );
}

interface Scale {
  likelihoodLabels: string[] | null;
  impactLabels: string[] | null;
  likelihoodDescriptions: string[];
  impactDescriptions: string[];
}

/**
 * Bewertungsskala (Kap. 6.1.2 a): was jede der fünf Stufen bedeutet. Als Text änderbar, damit
 * Beispiele (Euro, Ausfallzeit, Häufigkeit) zur Organisation passen; die Schwellen 4, 9 und 14
 * bleiben fest.
 */
function RiskScaleSection() {
  const qc = useQueryClient();
  const scale = useQuery({ queryKey: ['risk-matrix'], queryFn: () => api<Scale>('/risks/matrix') });
  const save = useMutation({
    mutationFn: (dto: { likelihood: string[]; impact: string[] }) =>
      api('/risks/scale', { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['risk-matrix'] }),
  });
  const d = scale.data;
  if (!d) return null;
  const axis = (prefix: string, labels: string[] | null, texts: string[]) =>
    texts.map((t, i) => (
      <div key={`${prefix}${i}`}>
        <label className="label" htmlFor={`${prefix}${i}`}>
          {i + 1} {labels?.[i] ?? ''}
        </label>
        <input
          id={`${prefix}${i}`}
          name={`${prefix}${i}`}
          className="input"
          defaultValue={t}
          required
          minLength={3}
        />
      </div>
    ));
  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-500">
        Bewertungsskala für Risiken{' '}
        <NormHint refs="iso:6.1.2" note="Die Schwellen 4, 9 und 14 Punkte bleiben fest." />
      </h2>
      <form
        key={JSON.stringify([d.likelihoodDescriptions, d.impactDescriptions])}
        className="card grid gap-6 p-4 lg:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const read = (p: string) => [0, 1, 2, 3, 4].map((i) => String(f.get(`${p}${i}`) ?? '').trim());
          save.mutate({ likelihood: read('l'), impact: read('i') });
        }}
      >
        <ErrorNote error={save.error} />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-800">Wie wahrscheinlich ist es?</legend>
          {axis('l', d.likelihoodLabels, d.likelihoodDescriptions)}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-800">Wie schlimm wäre es?</legend>
          {axis('i', d.impactLabels, d.impactDescriptions)}
        </fieldset>
        <div className="lg:col-span-2">
          <button type="submit" className="btn-ghost" disabled={save.isPending}>
            {save.isSuccess ? 'Gespeichert' : 'Skala speichern'}
          </button>
        </div>
      </form>
    </section>
  );
}
