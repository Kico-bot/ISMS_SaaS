import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { api } from '../lib/api';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className={clsx('card p-4', TONE_BORDER[tone])}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={clsx('mt-1 text-2xl font-semibold tabular-nums', TONE_TEXT[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad';
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-slate-900',
  good: 'text-level-low',
  warn: 'text-level-medium',
  bad: 'text-level-critical',
};
const TONE_BORDER: Record<Tone, string> = {
  neutral: '',
  good: 'border-l-4 border-l-level-low',
  warn: 'border-l-4 border-l-level-medium',
  bad: 'border-l-4 border-l-level-critical',
};

const LEVEL_STYLE: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-orange-100 text-orange-900',
  critical: 'bg-red-100 text-red-800',
};
const LEVEL_LABEL: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};

export function RiskLevelBadge({ level, score }: { level: string | null; score?: number | null }) {
  if (!level) return <span className="text-xs text-slate-400">nicht bewertet</span>;
  return (
    <span className={clsx('badge', LEVEL_STYLE[level])}>
      {LEVEL_LABEL[level] ?? level}
      {score != null && <span className="ml-1 tabular-nums opacity-75">{score}</span>}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-800',
  implemented: 'bg-green-100 text-green-800',
  verified: 'bg-emerald-100 text-emerald-900',
  not_applicable: 'bg-slate-100 text-slate-500',
  identified: 'bg-slate-100 text-slate-700',
  assessed: 'bg-blue-100 text-blue-800',
  treated: 'bg-indigo-100 text-indigo-800',
  monitored: 'bg-cyan-100 text-cyan-900',
  accepted: 'bg-emerald-100 text-emerald-900',
  closed: 'bg-slate-100 text-slate-500',
  // Vorfälle
  new: 'bg-red-100 text-red-800',
  triage: 'bg-amber-100 text-amber-900',
  contained: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  // KVP
  open: 'bg-slate-100 text-slate-700',
  done: 'bg-green-100 text-green-800',
  rejected: 'bg-slate-100 text-slate-500',
  // Audit
  reported: 'bg-indigo-100 text-indigo-800',
  // BIA / Notfallpläne
  approved: 'bg-emerald-100 text-emerald-900',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-slate-100 text-slate-500',
  // Dokumentenlenkung
  draft: 'bg-slate-100 text-slate-700',
  in_review: 'bg-amber-100 text-amber-900',
  published: 'bg-green-100 text-green-800',
  retired: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL: Record<string, string> = {
  planned: 'Geplant',
  in_progress: 'In Umsetzung',
  implemented: 'Umgesetzt',
  verified: 'Verifiziert',
  not_applicable: 'Nicht anwendbar',
  identified: 'Identifiziert',
  assessed: 'Bewertet',
  treated: 'Behandelt',
  monitored: 'Überwacht',
  accepted: 'Akzeptiert',
  closed: 'Geschlossen',
  new: 'Neu',
  triage: 'In Bewertung',
  contained: 'Eingedämmt',
  resolved: 'Behoben',
  open: 'Offen',
  done: 'Umgesetzt',
  rejected: 'Verworfen',
  reported: 'Berichtet',
  approved: 'Freigegeben',
  active: 'Aktiv',
  archived: 'Archiviert',
  draft: 'Entwurf',
  in_review: 'In Prüfung',
  published: 'Freigegeben',
  retired: 'Zurückgezogen',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('badge', STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-700')}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  observation: 'bg-slate-100 text-slate-700',
  minor: 'bg-amber-100 text-amber-900',
  major: 'bg-red-100 text-red-800',
};
const SEVERITY_LABEL: Record<string, string> = {
  observation: 'Beobachtung',
  minor: 'Nebenabweichung',
  major: 'Hauptabweichung',
};

/** Einstufung einer Feststellung. Nur Neben- und Hauptabweichung sind Nichtkonformitäten. */
export function FindingSeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={clsx('badge', SEVERITY_STYLE[severity] ?? 'bg-slate-100 text-slate-700')}>
      {SEVERITY_LABEL[severity] ?? severity}
    </span>
  );
}

export function FrameworkChip({ k }: { k: string }) {
  const label: Record<string, string> = {
    ISO27001: 'ISO 27001',
    BSI_GS: 'IT-Grundschutz',
    BSI_STD200: 'BSI 200-x',
    NIS2: 'NIS2',
    DSGVO: 'DSGVO',
  };
  return (
    <span className="badge bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">{label[k] ?? k}</span>
  );
}

/**
 * Zahl aus der Datenbank menschenlesbar machen. `numeric` kommt als String mit fester
 * Nachkommastelle an ("1.600"), was ohne Formatierung als 1600 gelesen wird.
 */
export function formatNumber(value: string | number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || value === '') return '–';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const text = n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  if (!unit) return text;
  return unit === '%' ? `${text} %` : `${text} ${unit}`;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-md text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as { title?: string; detail?: string; message?: string };
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      <p className="font-medium">{e.title ?? e.message ?? 'Fehler'}</p>
      {e.detail && <p className="mt-0.5 text-red-700">{e.detail}</p>}
    </div>
  );
}

export function Spinner({ label = 'Lädt …' }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-slate-500">{label}</p>;
}

/** Fortschrittsbalken mit Zielmarke — für Abdeckung und Reifegrad. */
export function Progress({
  value,
  max = 100,
  tone = 'brand',
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'level';
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color =
    tone === 'brand'
      ? 'bg-brand-500'
      : pct >= 80
        ? 'bg-level-low'
        : pct >= 50
          ? 'bg-level-medium'
          : 'bg-level-critical';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Auswahl der verantwortlichen Person. Steht überall dort, wo Eigentümerschaft vergeben wird —
 * ohne benannte Verantwortung greift das Ownership-Scoping der Rollen ins Leere.
 */
export function OwnerSelect({
  id = 'ownerPersonId',
  label = 'Verantwortlich',
  defaultValue = '',
}: {
  id?: string;
  label?: string;
  defaultValue?: string;
}) {
  const persons = useQuery({
    queryKey: ['persons', false],
    queryFn: () => api<{ id: string; name: string; department: string | null }[]>('/persons'),
  });
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} name="ownerPersonId" className="input" defaultValue={defaultValue}>
        <option value="">– offen –</option>
        {(persons.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.department ? ` · ${p.department}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
