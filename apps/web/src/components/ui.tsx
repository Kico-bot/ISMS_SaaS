import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { findAbbreviations } from '../lib/glossary';
import { NORM_REF, type NormRefKey } from '../lib/norm-refs';

export function PageHeader({
  eyebrow,
  title,
  description,
  norm,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Normbezug der ganzen Seite — beantwortet „wofür führe ich dieses Register überhaupt?“. */
  norm?: NormRefKey | NormRefKey[];
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
      <div data-hint-scope>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          {title}
          {norm ? <NormHint refs={norm} /> : <AbbrHint text={`${title} ${description ?? ''}`} />}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  norm,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Normbezug der Kennzahl — eine Zahl ohne Anlass ist Dekoration. */
  norm?: NormRefKey | NormRefKey[];
  tone?: Tone;
}) {
  return (
    <div data-hint-scope className={clsx('card p-4', TONE_BORDER[tone])}>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
        {label}
        {norm ? <NormHint refs={norm} /> : <AbbrHint text={`${label} ${hint ?? ''}`} />}
      </p>
      <p className={clsx('mt-1 text-2xl font-semibold tabular-nums', TONE_TEXT[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-slate-500">{hint}</p>}
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
  good: 'border-l-[3px] border-l-level-low',
  warn: 'border-l-[3px] border-l-level-medium',
  bad: 'border-l-[3px] border-l-level-critical',
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
  verified: 'Wirksam bestätigt',
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
    EU_AI_ACT: 'AI Act',
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

/**
 * Restlaufzeit in Worten. „überfällig seit 3 Tagen“ liest sich schneller als ein Datum, und
 * der Singular muss stimmen — „in 1 Tagen“ fällt sofort als Maschinentext auf.
 */
export function relativeDays(daysLeft: number): string {
  if (daysLeft < -1) return `überfällig seit ${Math.abs(daysLeft)} Tagen`;
  if (daysLeft === -1) return 'seit gestern überfällig';
  if (daysLeft === 0) return 'heute fällig';
  if (daysLeft === 1) return 'morgen fällig';
  return `in ${daysLeft} Tagen`;
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
  norm = 'iso:5.3',
}: {
  id?: string;
  label?: string;
  defaultValue?: string;
  norm?: NormRefKey | NormRefKey[];
}) {
  const persons = useQuery({
    queryKey: ['persons', false],
    queryFn: () => api<{ id: string; name: string; department: string | null }[]>('/persons'),
  });
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        <NormHint refs={norm} />
      </label>
      {/* Erst nach dem Laden neu aufbauen: ein ungesteuertes Select übernimmt defaultValue nur beim
          ersten Anzeigen, und da fehlen die Personen noch. */}
      <select
        key={persons.data ? 'geladen' : 'lädt'}
        id={id}
        name="ownerPersonId"
        className="input"
        defaultValue={defaultValue}
      >
        <option value="">noch niemand</option>
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

/**
 * Info-Symbol mit Blase. Gemeinsame Grundlage von NormHint und AbbrHint: öffnet bei Hover,
 * Tastaturfokus oder Tippen, schließt mit Escape.
 *
 * Die Blase hängt an `document.body`, weil Tabellen und Karten `overflow-hidden` tragen und
 * einen absolut positionierten Tooltip sonst abschneiden.
 *
 * Abkürzungen findet die Blase selbst: im eigenen Inhalt und im Text um das Symbol herum
 * (Beschriftung, Spaltenkopf, Seitenkopf). Wer „RTO (Std.)“ liest und auf das i zeigt, soll
 * erfahren, was RTO heißt, ohne dass jede Stelle das einzeln angeben muss.
 */
function InfoBubble({
  label,
  heading,
  extraText = '',
  children,
  className,
}: {
  label: string;
  heading?: string;
  /** Text, der in der Blase steht und nach Abkürzungen durchsucht wird. */
  extraText?: string;
  children?: ReactNode;
  className?: string;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [abbrs, setAbbrs] = useState<{ abbr: string; meaning: string }[]>([]);

  const open = () => {
    const el = anchor.current;
    const r = el?.getBoundingClientRect();
    if (!el || !r) return;
    const width = 288;
    const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 12));
    // Nach oben aufklappen, wenn unten kein Platz mehr ist, sonst steht die Hilfe außerhalb des Bildes.
    const above = r.bottom > window.innerHeight - 220;
    const scope = el.closest('[data-hint-scope]') ?? el.closest('label, h1, h2, h3, th, dt, legend, p');
    setAbbrs(findAbbreviations(`${scope?.textContent ?? ''} ${extraText}`));
    setBox(above ? { left, bottom: window.innerHeight - r.top + 8 } : { left, top: r.bottom + 8 });
  };
  const close = () => setBox(null);

  return (
    <span className={clsx('inline-flex', className)}>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 font-serif text-[10px] font-semibold italic leading-none text-slate-400 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onClick={(e) => {
          e.preventDefault();
          box ? close() : open();
        }}
      >
        i
      </button>
      {box &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: box.left, top: box.top, bottom: box.bottom }}
            className="pointer-events-none fixed z-50 block w-72 rounded-lg border border-slate-200 bg-white p-3 text-left normal-case tracking-normal shadow-pop"
          >
            {heading && (
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {heading}
              </span>
            )}
            {children}
            {abbrs.length > 0 && (
              <span className={clsx('block', children ? 'mt-2 border-t border-slate-100 pt-2' : '')}>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Abkürzungen
                </span>
                {abbrs.map((a) => (
                  <span key={a.abbr} className="mt-1 block text-xs leading-snug text-slate-600">
                    <span className="font-semibold text-slate-800">{a.abbr}</span> {a.meaning}
                  </span>
                ))}
              </span>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}

/**
 * Kurzhilfe am Formularfeld: ein dezentes i, das den Normbezug zeigt: Regelwerk, Kapitel,
 * Kurztitel. Dazu die Abkürzungen aus der Umgebung ausgeschrieben.
 *
 * Bewusst *nicht* der Normtext. Zum einen verbietet das DIN-Urheberrecht die Wiedergabe der
 * ISO-27001-Texte, zum anderen liest eine halbe Seite Norm am Eingabefeld ohnehin niemand. Die
 * Frage, die hier beantwortet wird, ist „warum muss ich das ausfüllen?“, und dafür genügt
 * „ISO 27001:2022 · Kap. 7.4 · Kommunikation“.
 */
export function NormHint({
  refs,
  note,
  className,
}: {
  refs: NormRefKey | NormRefKey[];
  /** Ein Satz in eigenen Worten, wenn die Referenz allein nicht erklärt, was gemeint ist. */
  note?: string;
  className?: string;
}) {
  const list = Array.isArray(refs) ? refs : [refs];
  const spoken = list.map((k) => `${NORM_REF[k].framework} ${NORM_REF[k].clause}`).join(', ');
  const own = list
    .map((k) => `${NORM_REF[k].framework} ${NORM_REF[k].clause} ${NORM_REF[k].title}`)
    .join(' ');
  return (
    <InfoBubble
      label={`Normbezug: ${spoken}`}
      heading={list.length > 1 ? 'Normbezüge' : 'Normbezug'}
      extraText={`${own} ${note ?? ''}`}
      className={className}
    >
      {list.map((k) => (
        <span key={k} className="mt-1.5 block">
          <span className="block text-xs font-semibold text-brand-700">
            {NORM_REF[k].framework} · {NORM_REF[k].clause}
          </span>
          <span className="block text-xs leading-snug text-slate-600">{NORM_REF[k].title}</span>
        </span>
      ))}
      {note && (
        <span className="mt-2 block border-t border-slate-100 pt-2 text-xs leading-snug text-slate-500">
          {note}
        </span>
      )}
    </InfoBubble>
  );
}

/**
 * Nur die Abkürzungen: für Spaltenköpfe und Kennzahlen ohne Normbezug. Zeigt sich nur, wenn im
 * übergebenen Text eine bekannte Abkürzung steht.
 */
export function AbbrHint({ text, className }: { text: string; className?: string }) {
  if (!findAbbreviations(text).length) return null;
  return <InfoBubble label={`Abkürzungen in „${text}“`} extraText={text} className={className} />;
}
