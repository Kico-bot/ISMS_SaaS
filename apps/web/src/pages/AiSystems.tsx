import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorNote, NormHint, PageHeader, Spinner, StatTile } from '../components/ui';
import { aiFriaRequired, aiRiskClass, type AiAnswers } from '../lib/ai';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import {
  AI_ANNEX_III_LABEL,
  AI_PROHIBITED_LABEL,
  AI_RISK_CLASS_LABEL,
  AI_SYSTEM_STATUS_LABEL,
} from '../lib/labels';

interface ListRow {
  id: string;
  refNo: string;
  name: string;
  purpose: string | null;
  providerName: string | null;
  status: string;
  riskClass: string;
  friaRequired: boolean;
  ownerName: string | null;
  oversightName: string | null;
  errorCount: number;
}

interface Detail extends AiAnswers {
  id: string;
  refNo: string;
  name: string;
  purpose: string | null;
  providerName: string | null;
  ownerPersonId: string | null;
  oversightPersonId: string | null;
  status: string;
  riskClass: string;
  friaRequired: boolean;
  art6Justification: string | null;
  instructionsReceived: boolean;
  logRetentionMonths: number | null;
  workplaceUse: boolean;
  workersInformedAt: string | null;
  friaCompletedAt: string | null;
  personalData: boolean;
  processingActivityId: string | null;
  notes: string | null;
  findings: { severity: 'error' | 'warning' | 'info'; message: string }[];
  obligations: { id: string; refCode: string; title: string; appliesFrom: string | null }[];
  incidents: { id: string; refNo: string; title: string }[];
}

const CLASS_STYLE: Record<string, string> = {
  prohibited: 'bg-red-600 text-white',
  high: 'bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-300',
  limited: 'bg-sky-100 text-sky-900',
  minimal: 'bg-slate-100 text-slate-700',
};

const CLASS_EXPLAIN: Record<string, string> = {
  prohibited: 'Eine verbotene Praxis nach Art. 5. Dieses System darf nicht eingesetzt werden.',
  high: 'Hochrisiko: als Betreiber gelten Art. 26 (Aufsicht, Betriebsanleitung, Protokolle, Information) und ggf. Art. 27.',
  limited:
    'Transparenzpflicht: Betroffene sind zu informieren bzw. Inhalte als KI-erzeugt zu kennzeichnen (Art. 50).',
  minimal:
    'Minimales Risiko: Als Betreiber müssen Sie nur dafür sorgen, dass die Beschäftigten mit KI umgehen können (Art. 4), und nichts Verbotenes einsetzen.',
};

function ClassBadge({ cls }: { cls: string }) {
  return <span className={clsx('badge', CLASS_STYLE[cls])}>{AI_RISK_CLASS_LABEL[cls] ?? cls}</span>;
}

/**
 * KI-Register nach dem AI Act — **nur Betreiberpflichten**. Das Register ist für den AI Act, was
 * die Modellierung für den IT-Grundschutz ist: erst ein erfasstes System löst Pflichten aus.
 */
export function AiSystemsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['ai-systems'], queryFn: () => api<ListRow[]>('/ai-systems') });
  const create = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>('/ai-systems', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['ai-systems'] });
      setOpenId(r.id);
    },
  });
  const rows = list.data ?? [];
  const live = rows.filter((r) => r.status !== 'retired');
  const n = (c: string) => live.filter((r) => r.riskClass === c).length;

  return (
    <>
      <PageHeader
        eyebrow="Datenschutz & KI"
        title="KI-Register"
        norm={['aiact:Art. 26', 'aiact:Art. 4']}
        description="Die KI-Systeme, die Sie einsetzen, und was der AI Act Ihnen dafür abverlangt. Die Risikoklasse ergibt sich aus wenigen Fragen."
        actions={
          can('ai.write') ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const name = String(f.get('name') ?? '').trim();
                if (name.length >= 3) create.mutate(name);
                e.currentTarget.reset();
              }}
            >
              <input
                name="name"
                className="input w-64"
                placeholder="z. B. Chatbot im Kundenservice"
                aria-label="Name des KI-Systems"
                minLength={3}
                required
              />
              <button type="submit" className="btn-primary" disabled={create.isPending}>
                Erfassen
              </button>
            </form>
          ) : undefined
        }
      />

      <div className="mb-4 rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <strong>Nur Betreiberpflichten.</strong> Erfasst werden KI-Systeme, die Ihre Organisation{' '}
        <em>einsetzt</em> (Betreiber nach Art. 3 Nr. 4 AI Act). Pflichten von <em>Anbietern</em>, also von
        denen, die ein KI-System entwickeln oder unter eigenem Namen verkaufen, bildet die Suite bewusst nicht
        ab. Dazu gehören Konformitätsbewertung, CE-Kennzeichnung, technische Dokumentation und
        Qualitätsmanagement. Wer ein System wesentlich verändert oder unter eigenem Namen anbietet, wird
        selbst Anbieter (Art. 25) und braucht dafür eine eigene Prüfung.
      </div>
      <ErrorNote error={list.error ?? create.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Hochrisiko"
          value={n('high')}
          tone={n('high') ? 'warn' : 'neutral'}
          norm="aiact:Art. 26"
        />
        <StatTile label="Transparenzpflicht" value={n('limited')} norm="aiact:Art. 50" />
        <StatTile label="Minimales Risiko" value={n('minimal')} />
        <StatTile
          label="Noch nicht einsatzbereit"
          value={live.filter((r) => r.errorCount > 0).length}
          hint="Prüfpunkte offen"
          tone={live.some((r) => r.errorCount > 0) ? 'bad' : 'good'}
        />
      </section>

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch kein KI-System erfasst"
          hint="Auch eingekaufte Software zählt: Chatbots, Textgeneratoren, Bewerbervorauswahl, Prognosen in der Leittechnik."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th w-24">Nr.</th>
                <th className="th">KI-System</th>
                <th className="th w-40">Einstufung</th>
                <th className="th w-40">Aufsicht</th>
                <th className="th w-36">Status</th>
                <th className="th w-28">Prüfung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                  <td className="td font-mono text-xs text-slate-600">{r.refNo}</td>
                  <td className="td">
                    <p className="font-medium text-slate-800">{r.name}</p>
                    {r.providerName && <p className="text-xs text-slate-500">Anbieter: {r.providerName}</p>}
                  </td>
                  <td className="td">
                    <ClassBadge cls={r.riskClass} />
                  </td>
                  <td className="td text-xs text-slate-600">{r.oversightName ?? '–'}</td>
                  <td className="td text-xs text-slate-700">
                    {AI_SYSTEM_STATUS_LABEL[r.status] ?? r.status}
                  </td>
                  <td className="td text-xs">
                    {r.errorCount ? (
                      <span className="font-medium text-level-critical">{r.errorCount} offen</span>
                    ) : (
                      <span className="text-emerald-700">vollständig</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Welche Pflichten die Systeme auslösen und womit sie erfüllt sind, zeigt das{' '}
        <Link className="text-brand-700 underline" to="/cockpit?framework=EU_AI_ACT">
          Cockpit für den AI Act
        </Link>
        .
      </p>

      {openId && <AiSystemPanel id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

// --- Detail ----------------------------------------------------------------------------

type Form = Omit<
  Detail,
  'id' | 'refNo' | 'status' | 'riskClass' | 'friaRequired' | 'findings' | 'obligations' | 'incidents'
>;

const FORM_KEYS: (keyof Form)[] = [
  'name',
  'purpose',
  'providerName',
  'ownerPersonId',
  'oversightPersonId',
  'prohibitedPractices',
  'annexIiiArea',
  'annexIProduct',
  'art6Exception',
  'art6Justification',
  'emotionOrBiometric',
  'deepfakeOrPublicText',
  'publicService',
  'creditOrInsurance',
  'instructionsReceived',
  'logRetentionMonths',
  'workplaceUse',
  'workersInformedAt',
  'friaCompletedAt',
  'personalData',
  'processingActivityId',
  'notes',
];

function AiSystemPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const writable = can('ai.write');
  const detail = useQuery({ queryKey: ['ai-system', id], queryFn: () => api<Detail>(`/ai-systems/${id}`) });
  const persons = useQuery({
    queryKey: ['persons', false],
    queryFn: () => api<{ id: string; name: string; department: string | null }[]>('/persons'),
  });
  const processing = useQuery({
    queryKey: ['processing-options'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/processing-activities?size=200'),
    enabled: can('privacy.read'),
  });
  const [form, setForm] = useState<Form | null>(null);
  useEffect(() => {
    if (detail.data) {
      const f = {} as Record<string, unknown>;
      for (const k of FORM_KEYS) f[k] = detail.data[k];
      setForm(f as Form);
    }
  }, [detail.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Detail>(`/ai-systems/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (d) => {
      qc.setQueryData(['ai-system', id], d);
      void qc.invalidateQueries({ queryKey: ['ai-systems'] });
      void qc.invalidateQueries({ queryKey: ['coverage-map'] });
      void qc.invalidateQueries({ queryKey: ['frameworks'] });
    },
  });

  const d = detail.data;
  if (!d || !form) {
    return (
      <Shell onClose={onClose}>
        <Spinner />
      </Shell>
    );
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const cls = aiRiskClass(form);
  const fria = aiFriaRequired(form);
  const payload = () => {
    const b: Record<string, unknown> = { ...form };
    for (const k of ['purpose', 'providerName', 'art6Justification', 'notes'] as const)
      b[k] = (form[k] as string | null)?.trim() || null;
    for (const k of [
      'workersInformedAt',
      'friaCompletedAt',
      'ownerPersonId',
      'oversightPersonId',
      'processingActivityId',
    ] as const)
      b[k] = form[k] || null;
    return b;
  };
  const errors = d.findings.filter((f) => f.severity === 'error');

  return (
    <Shell onClose={onClose} title={`${d.refNo} · ${d.name}`}>
      <ErrorNote error={save.error} />

      <div
        className={clsx('mb-4 rounded-md p-3 text-sm', cls === 'prohibited' ? 'bg-red-50' : 'bg-slate-50')}
      >
        <div className="mb-1 flex items-center gap-2">
          <ClassBadge cls={cls} />
          {fria && (
            <span className="badge bg-amber-100 text-amber-900">Grundrechte-Folgenabschätzung nötig</span>
          )}
          <span className="ml-auto text-xs text-slate-500">
            Status: {AI_SYSTEM_STATUS_LABEL[d.status] ?? d.status}
          </span>
        </div>
        <p className="text-slate-700">{CLASS_EXPLAIN[cls]}</p>
      </div>

      <fieldset disabled={!writable} className="space-y-5">
        <Section title="Was ist das System?" norm="aiact:Art. 26">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Anbieter (Hersteller oder Dienst)">
              <input
                className="input"
                value={form.providerName ?? ''}
                onChange={(e) => set('providerName', e.target.value)}
              />
            </Field>
            <Field label="Wofür wird es eingesetzt?" wide>
              <textarea
                className="input"
                rows={2}
                value={form.purpose ?? ''}
                onChange={(e) => set('purpose', e.target.value)}
              />
            </Field>
            <Field label="Verantwortlich">
              <PersonSelect
                value={form.ownerPersonId}
                onChange={(v) => set('ownerPersonId', v)}
                persons={persons.data ?? []}
              />
            </Field>
          </div>
        </Section>

        <Section title="1. Ist der Einsatz verboten?" norm="aiact:Art. 5">
          <p className="mb-2 text-xs text-slate-500">
            Trifft eine dieser Praktiken zu, darf das System nicht eingesetzt werden.
          </p>
          <div className="grid gap-1">
            {Object.entries(AI_PROHIBITED_LABEL).map(([k, label]) => (
              <Check
                key={k}
                checked={form.prohibitedPractices.includes(k)}
                onChange={(on) =>
                  set(
                    'prohibitedPractices',
                    on ? [...form.prohibitedPractices, k] : form.prohibitedPractices.filter((x) => x !== k),
                  )
                }
              >
                {label}
              </Check>
            ))}
          </div>
        </Section>

        <Section title="2. Ist es ein Hochrisiko-System?" norm="aiact:Art. 26">
          <Field label="Einsatzbereich nach Anhang III">
            <select
              className="input"
              value={form.annexIiiArea ?? ''}
              onChange={(e) => set('annexIiiArea', e.target.value || null)}
            >
              <option value="">keiner davon</option>
              {Object.entries(AI_ANNEX_III_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-2 grid gap-1">
            <Check checked={form.annexIProduct} onChange={(v) => set('annexIProduct', v)}>
              Sicherheitsbauteil eines Produkts mit EU-Produktvorschriften (Anhang I, z. B. Maschine,
              Medizinprodukt)
            </Check>
            {form.annexIiiArea && (
              <Check checked={form.art6Exception} onChange={(v) => set('art6Exception', v)}>
                Ausnahme nach Art. 6 Abs. 3: nur vorbereitende oder eng begrenzte Aufgabe, kein erhebliches
                Risiko
              </Check>
            )}
          </div>
          {form.art6Exception && (
            <Field label="Begründung der Ausnahme" wide>
              <textarea
                className="input"
                rows={2}
                value={form.art6Justification ?? ''}
                onChange={(e) => set('art6Justification', e.target.value)}
              />
            </Field>
          )}
        </Section>

        <Section title="3. Müssen Betroffene informiert werden?" norm="aiact:Art. 50">
          <div className="grid gap-1">
            <Check checked={form.emotionOrBiometric} onChange={(v) => set('emotionOrBiometric', v)}>
              Erkennt Emotionen oder ordnet Menschen anhand biometrischer Daten Kategorien zu (Art. 50 Abs. 3)
            </Check>
            <Check checked={form.deepfakeOrPublicText} onChange={(v) => set('deepfakeOrPublicText', v)}>
              Erzeugt Deepfakes oder veröffentlicht Texte zu Themen von öffentlichem Interesse (Art. 50 Abs.
              4)
            </Check>
          </div>
        </Section>

        {cls === 'high' && (
          <Section title="4. Betrieb als Hochrisiko-System" norm={['aiact:Art. 26', 'aiact:Art. 27']}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Menschliche Aufsicht (Art. 26 Abs. 2)">
                <PersonSelect
                  value={form.oversightPersonId}
                  onChange={(v) => set('oversightPersonId', v)}
                  persons={persons.data ?? []}
                />
              </Field>
              <Field label="Protokolle aufbewahrt (Monate, mind. 6)">
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={form.logRetentionMonths ?? ''}
                  onChange={(e) =>
                    set('logRetentionMonths', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <div className="mt-2 grid gap-1">
              <Check checked={form.instructionsReceived} onChange={(v) => set('instructionsReceived', v)}>
                Betriebsanleitung des Anbieters liegt vor und wird befolgt (Art. 26 Abs. 1)
              </Check>
              <Check checked={form.workplaceUse} onChange={(v) => set('workplaceUse', v)}>
                Wird am Arbeitsplatz eingesetzt oder betrifft Beschäftigte (Art. 26 Abs. 7)
              </Check>
              <Check checked={form.publicService} onChange={(v) => set('publicService', v)}>
                Wir sind eine öffentliche Stelle oder erbringen öffentliche Dienstleistungen (Art. 27)
              </Check>
              {form.annexIiiArea === 'essential_services' && (
                <Check checked={form.creditOrInsurance} onChange={(v) => set('creditOrInsurance', v)}>
                  Kreditwürdigkeitsprüfung oder Tarifierung von Lebens- und Krankenversicherungen (Art. 27)
                </Check>
              )}
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {form.workplaceUse && (
                <Field label="Beschäftigte informiert am">
                  <input
                    type="date"
                    className="input"
                    value={form.workersInformedAt ?? ''}
                    onChange={(e) => set('workersInformedAt', e.target.value || null)}
                  />
                </Field>
              )}
              {fria && (
                <Field label="Grundrechte-Folgenabschätzung durchgeführt am">
                  <input
                    type="date"
                    className="input"
                    value={form.friaCompletedAt ?? ''}
                    onChange={(e) => set('friaCompletedAt', e.target.value || null)}
                  />
                </Field>
              )}
            </div>
          </Section>
        )}

        <Section title="Personenbezogene Daten" norm={['dsgvo:Art. 30', 'aiact:Art. 26 Abs. 9']}>
          <Check checked={form.personalData} onChange={(v) => set('personalData', v)}>
            Das System verarbeitet personenbezogene Daten
          </Check>
          {form.personalData && (
            <Field label="Verarbeitungstätigkeit im Verzeichnis">
              <select
                className="input"
                value={form.processingActivityId ?? ''}
                onChange={(e) => set('processingActivityId', e.target.value || null)}
              >
                <option value="">noch nicht verknüpft</option>
                {(processing.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Section>

        <Field label="Notizen" wide>
          <textarea
            className="input"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </fieldset>

      {writable && (
        <div className="sticky bottom-0 -mx-6 mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-6 py-3">
          <button
            type="button"
            className="btn-ghost"
            disabled={save.isPending}
            onClick={() => save.mutate(payload())}
          >
            Speichern
          </button>
          {d.status !== 'active' && (
            <button
              type="button"
              className="btn-primary"
              disabled={save.isPending || cls === 'prohibited'}
              onClick={() => save.mutate({ ...payload(), status: 'active' })}
              title={cls === 'prohibited' ? 'Verbotene Praxis, darf nicht eingesetzt werden' : undefined}
            >
              In Betrieb nehmen
            </button>
          )}
          {d.status !== 'retired' && (
            <button type="button" className="btn-ghost" onClick={() => save.mutate({ status: 'retired' })}>
              Stilllegen
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {errors.length ? `${errors.length} Prüfpunkt(e) offen` : 'Alle Prüfpunkte erfüllt'}
          </span>
        </div>
      )}

      <section className="mt-5">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          Prüfung (Stand der letzten Speicherung) <NormHint refs="aiact:Art. 26" />
        </h3>
        {d.findings.length === 0 ? (
          <p className="text-sm text-emerald-700">Keine offenen Punkte.</p>
        ) : (
          <ul className="space-y-1">
            {d.findings.map((f, i) => (
              <li
                key={i}
                className={clsx(
                  'rounded border px-3 py-1.5 text-sm',
                  f.severity === 'error' && 'border-red-200 bg-red-50 text-red-900',
                  f.severity === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
                  f.severity === 'info' && 'border-slate-200 bg-slate-50 text-slate-700',
                )}
              >
                {f.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-slate-700">
          Betreiberpflichten, die dieses System auslöst
        </h3>
        <ul className="space-y-1 text-sm">
          {d.obligations.map((o) => (
            <li key={o.id} className="flex gap-2">
              <span className="w-28 shrink-0 font-mono text-xs text-slate-500">{o.refCode}</span>
              <span className="min-w-0 flex-1 text-slate-800">{o.title}</span>
              {o.appliesFrom && o.appliesFrom > new Date().toISOString().slice(0, 10) && (
                <span className="shrink-0 text-xs text-amber-700">
                  ab {new Date(o.appliesFrom).toLocaleDateString('de-DE')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {d.incidents.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-slate-700">Schwerwiegende Vorfälle</h3>
          <ul className="space-y-1 text-sm">
            {d.incidents.map((i) => (
              <li key={i.id}>
                <span className="font-mono text-xs text-slate-500">{i.refNo}</span> {i.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white px-6 pt-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="KI-System"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function Section({
  title,
  norm,
  children,
}: {
  title: string;
  norm?: Parameters<typeof NormHint>[0]['refs'];
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800">
        {title}
        {norm && <NormHint refs={norm} />}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={clsx('block', wide && 'sm:col-span-2')}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="mt-0.5 rounded border-slate-300"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function PersonSelect({
  value,
  onChange,
  persons,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  persons: { id: string; name: string; department: string | null }[];
}) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">noch offen</option>
      {persons.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.department ? ` · ${p.department}` : ''}
        </option>
      ))}
    </select>
  );
}
