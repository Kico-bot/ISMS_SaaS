import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import {
  EmptyState,
  ErrorNote,
  NormHint,
  OwnerSelect,
  PageHeader,
  Spinner,
  StatTile,
} from '../components/ui';
import { api } from '../lib/api';
import { CHANGE_PLAN_STATUS_LABEL, ORG_NODE_KIND_LABEL } from '../lib/labels';
import { useAuth } from '../lib/auth-context';

interface CommunicationEntry {
  id: string;
  topic: string;
  audience: string;
  channel: string;
  frequency: string;
  responsiblePersonId: string | null;
  responsibleName: string | null;
  clauseRef: string | null;
}

interface ChangeEntry {
  id: string;
  title: string;
  purpose: string | null;
  impactAssessment: string | null;
  status: string;
  plannedFor: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

interface OrgNode {
  id: string;
  parentId: string | null;
  kind: string;
  label: string;
  personId: string | null;
  personName: string | null;
  personDepartment: string | null;
  sortOrder: number;
  assetCount: number;
  riskCount: number;
}

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

/**
 * Drei Register, die die ISO 27001 verlangt und die sonst in Word-Dateien versanden:
 * Kommunikationsplan (Kap. 7.4), Änderungsplanung (Kap. 6.3) und Organigramm (Kap. 5.3).
 */
export function PlanningPage() {
  const { can } = useAuth();
  const writable = can('context.write');
  const [tab, setTab] = useState<'communication' | 'changes' | 'org'>('communication');

  return (
    <>
      <PageHeader
        eyebrow="Managementsystem"
        title="Kommunikation, Änderungen & Organisation"
        norm={['iso:7.4', 'iso:6.3', 'iso:5.3']}
        description="Wer worüber mit wem kommuniziert (Kap. 7.4), welche Änderungen am ISMS geplant sind (Kap. 6.3) und wie die Verantwortung verteilt ist (Kap. 5.3) — einschließlich der unbesetzten Stellen."
      />

      <div className="tabs">
        {(
          [
            ['communication', 'Kommunikationsplan'],
            ['changes', 'Änderungsplanung'],
            ['org', 'Organigramm'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={clsx('tab', tab === k && 'tab-active')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'communication' && <CommunicationPlan writable={writable} />}
      {tab === 'changes' && <ChangePlan writable={writable} />}
      {tab === 'org' && <OrgChart writable={writable} />}
    </>
  );
}

/** Kap. 7.4 stellt vier Fragen: worüber, mit wem, wann und wie. Genau die stehen hier. */
function CommunicationPlan({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const list = useQuery({
    queryKey: ['communication'],
    queryFn: () => api<CommunicationEntry[]>('/context/communication'),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['communication'] });
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/context/communication', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      refresh();
      setAdding(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/context/communication/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const rows = list.data ?? [];

  return (
    <>
      <ErrorNote error={list.error ?? create.error ?? remove.error} />
      <p className="mb-4 text-sm text-slate-600">
        Kap. 7.4 verlangt, dass festgelegt ist, <strong>worüber</strong>, <strong>mit wem</strong>,{' '}
        <strong>wann</strong> und <strong>wie</strong> zur Informationssicherheit kommuniziert wird — intern
        wie extern.
      </p>

      {writable && (
        <div className="mb-3">
          <button type="button" className="btn-ghost" onClick={() => setAdding(!adding)}>
            {adding ? 'Abbrechen' : 'Eintrag hinzufügen'}
          </button>
        </div>
      )}

      {writable && adding && (
        <form
          className="card mb-4 grid gap-3 p-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              topic: String(f.get('topic')).trim(),
              audience: String(f.get('audience')).trim(),
              channel: String(f.get('channel')).trim(),
              frequency: String(f.get('frequency')).trim(),
              responsiblePersonId: String(f.get('ownerPersonId') || '') || null,
              clauseRef: String(f.get('clauseRef') || '') || null,
            });
          }}
        >
          <div>
            <label className="label" htmlFor="topic">
              Worüber (Thema)
              <NormHint refs="iso:7.4" />
            </label>
            <input id="topic" name="topic" required minLength={3} className="input" autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="audience">
              Mit wem (Zielgruppe)
              <NormHint refs="iso:7.4" />
            </label>
            <input id="audience" name="audience" required minLength={2} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="channel">
              Wie (Kanal)
              <NormHint refs="iso:7.4" />
            </label>
            <input id="channel" name="channel" required minLength={2} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="frequency">
              Wann (Anlass oder Frequenz)
              <NormHint refs="iso:7.4" />
            </label>
            <input id="frequency" name="frequency" required minLength={2} className="input" />
          </div>
          <OwnerSelect id="comm-responsible" label="Verantwortlich" />
          <div>
            <label className="label" htmlFor="clauseRef">
              Normbezug (optional)
              <NormHint refs="iso:7.4" />
            </label>
            <input id="clauseRef" name="clauseRef" className="input" placeholder="7.4, NIS2 Art. 23 …" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Aufnehmen
            </button>
          </div>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Noch kein Kommunikationsplan"
          hint="Beginnen Sie mit dem, was ohnehin passiert: Meldungen an Behörden, Kennzahlenbericht an die Leitung, Störungsinformation an die Kundschaft."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">Thema</th>
                <th className="px-4 py-2 font-medium">Zielgruppe</th>
                <th className="px-4 py-2 font-medium">Kanal</th>
                <th className="px-4 py-2 font-medium">Anlass / Frequenz</th>
                <th className="px-4 py-2 font-medium">Verantwortlich</th>
                <th className="px-4 py-2 font-medium">Norm</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="group">
                  <td className="px-4 py-2 text-slate-800">{c.topic}</td>
                  <td className="px-4 py-2 text-slate-700">{c.audience}</td>
                  <td className="px-4 py-2 text-slate-700">{c.channel}</td>
                  <td className="px-4 py-2 text-slate-700">{c.frequency}</td>
                  <td className="px-4 py-2 text-slate-600">{c.responsibleName ?? '–'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.clauseRef ?? '–'}</td>
                  <td className="px-4 py-2 text-right">
                    {writable && (
                      <button
                        type="button"
                        className="hidden text-xs text-slate-400 underline hover:text-slate-700 group-hover:inline"
                        onClick={() => remove.mutate(c.id)}
                      >
                        entfernen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Kap. 6.3: Änderungen am ISMS erfolgen geplant — mit bewerteter Auswirkung und Freigabe. */
function ChangePlan({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['changes'], queryFn: () => api<ChangeEntry[]>('/context/changes') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['changes'] });
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/context/changes', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      refresh();
      setAdding(false);
    },
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
      api(`/context/changes/${v.id}`, { method: 'PATCH', body: JSON.stringify(v.body) }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (id: string) => api(`/context/changes/${id}/approve`, { method: 'POST' }),
    onSuccess: refresh,
  });

  const rows = list.data ?? [];
  const offen = rows.filter((c) => ['planned', 'approved', 'in_progress'].includes(c.status)).length;
  const ohneBewertung = rows.filter((c) => !c.impactAssessment?.trim()).length;

  return (
    <>
      <ErrorNote error={list.error ?? create.error ?? patch.error ?? approve.error} />
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Geplante Änderungen" value={offen} />
        <StatTile
          label="Ohne bewertete Auswirkung"
          value={ohneBewertung}
          hint="ohne sie keine Freigabe"
          tone={ohneBewertung > 0 ? 'warn' : 'good'}
        />
        <StatTile label="Insgesamt erfasst" value={rows.length} />
      </section>

      {writable && (
        <div className="mb-3">
          <button type="button" className="btn-ghost" onClick={() => setAdding(!adding)}>
            {adding ? 'Abbrechen' : 'Änderung planen'}
          </button>
        </div>
      )}

      {writable && adding && (
        <form
          className="card mb-4 space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: String(f.get('title')).trim(),
              purpose: String(f.get('purpose') || '') || null,
              impactAssessment: String(f.get('impactAssessment') || '') || null,
              plannedFor: String(f.get('plannedFor') || '') || null,
            });
          }}
        >
          <input
            name="title"
            required
            minLength={3}
            className="input"
            placeholder="Was wird geändert?"
            autoFocus
          />
          <input name="purpose" className="input" placeholder="Wozu — der Anlass der Änderung" />
          <textarea
            name="impactAssessment"
            rows={3}
            className="input"
            placeholder="Was bewirkt die Änderung im ISMS? Welche Register, Risiken oder Nachweise sind betroffen?"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="plannedFor">
                Geplant für
                <NormHint refs="iso:6.3" />
              </label>
              <input id="plannedFor" name="plannedFor" type="date" className="input w-auto" />
            </div>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Aufnehmen
            </button>
          </div>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Keine geplanten Änderungen"
          hint="Kap. 6.3 meint Änderungen am Managementsystem selbst: Geltungsbereich, Risikomatrix, neue Standorte, Wechsel eines zentralen Dienstleisters."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{c.title}</p>
                  {c.purpose && <p className="mt-0.5 text-xs text-slate-600">{c.purpose}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    {c.plannedFor && <>geplant für {date(c.plannedFor)} · </>}
                    erfasst von {c.createdByName ?? 'unbekannt'}
                    {c.approvedByName && (
                      <span className="text-level-low">
                        {' '}
                        · freigegeben von {c.approvedByName} am {date(c.approvedAt)}
                      </span>
                    )}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={clsx(
                      'badge',
                      c.status === 'approved' || c.status === 'done'
                        ? 'bg-emerald-50 text-level-low'
                        : c.status === 'rejected'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-amber-50 text-level-medium',
                    )}
                  >
                    {CHANGE_PLAN_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-brand-700 underline"
                    onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  >
                    {openId === c.id ? 'schließen' : 'Auswirkung'}
                  </button>
                </span>
              </div>

              {openId === c.id && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {c.impactAssessment ? (
                    <p className="whitespace-pre-line text-sm text-slate-700">{c.impactAssessment}</p>
                  ) : (
                    <p className="text-sm text-level-medium">
                      Die Auswirkung ist noch nicht bewertet — ohne sie ist keine Freigabe möglich.
                    </p>
                  )}
                  {writable && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn-ghost py-0.5 text-xs"
                        disabled={approve.isPending || !!c.approvedAt}
                        title={
                          c.approvedAt
                            ? 'Bereits freigegeben'
                            : 'Vier-Augen-Prinzip: nicht durch die planende Person'
                        }
                        onClick={() => approve.mutate(c.id)}
                      >
                        Freigeben
                      </button>
                      {c.status === 'approved' && (
                        <button
                          type="button"
                          className="btn-ghost py-0.5 text-xs"
                          onClick={() => patch.mutate({ id: c.id, body: { status: 'in_progress' } })}
                        >
                          Umsetzung beginnen
                        </button>
                      )}
                      {c.status === 'in_progress' && (
                        <button
                          type="button"
                          className="btn-ghost py-0.5 text-xs"
                          onClick={() => patch.mutate({ id: c.id, body: { status: 'done' } })}
                        >
                          Als umgesetzt melden
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Kap. 5.3. Der eigentliche Wert liegt in den unbesetzten Stellen: eine Vakanz neben den
 * Assets und Risiken, die sie verantworten soll, ist eine Aussage, die kein Textdokument so
 * klar trifft.
 */
function OrgChart({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const [parentId, setParentId] = useState<string | null>(null);
  const [kind, setKind] = useState('unit');

  const list = useQuery({ queryKey: ['org-chart'], queryFn: () => api<OrgNode[]>('/context/org-chart') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['org-chart'] });
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/context/org-chart', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/context/org-chart/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const nodes = list.data ?? [];
  const vakanzen = nodes.filter((n) => n.kind === 'vacancy');
  const children = (id: string | null) => nodes.filter((n) => n.parentId === id);

  const renderNode = (node: OrgNode, depth: number) => (
    <li key={node.id} style={{ marginLeft: depth * 20 }}>
      <div
        className={clsx(
          'group mb-1 flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2',
          node.kind === 'vacancy' ? 'border-amber-200 bg-amber-50' : 'border-slate-200',
        )}
      >
        <span className="min-w-0">
          <span className="text-sm text-slate-800">{node.label}</span>
          <span className="ml-2 text-xs text-slate-400">{ORG_NODE_KIND_LABEL[node.kind] ?? node.kind}</span>
          {node.personName && <span className="ml-2 text-xs text-slate-600">{node.personName}</span>}
          {node.kind === 'vacancy' && (
            <span className="ml-2 text-xs font-medium text-level-medium">unbesetzt</span>
          )}
          {(node.assetCount > 0 || node.riskCount > 0) && (
            <span className="ml-2 text-xs text-slate-500">
              verantwortet {node.assetCount} Asset(s), {node.riskCount} Risiko/Risiken
            </span>
          )}
        </span>
        {writable && (
          <span className="flex shrink-0 gap-2 text-xs">
            <button type="button" className="text-brand-700 underline" onClick={() => setParentId(node.id)}>
              darunter anlegen
            </button>
            <button
              type="button"
              className="hidden text-slate-400 underline hover:text-slate-700 group-hover:inline"
              onClick={() => remove.mutate(node.id)}
              title="Löscht den Knoten samt allem darunter"
            >
              entfernen
            </button>
          </span>
        )}
      </div>
      <ul>{children(node.id).map((c) => renderNode(c, depth + 1))}</ul>
    </li>
  );

  return (
    <>
      <ErrorNote error={list.error ?? create.error ?? remove.error} />
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Knoten" value={nodes.length} />
        <StatTile
          label="Unbesetzte Stellen"
          value={vakanzen.length}
          hint={vakanzen.length > 0 ? vakanzen.map((v) => v.label).join(', ') : undefined}
          tone={vakanzen.length > 0 ? 'warn' : 'good'}
        />
        <StatTile label="Besetzte Stellen" value={nodes.filter((n) => n.kind === 'person').length} />
      </section>

      {writable && (
        <form
          className="card mb-4 flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              label: String(f.get('label')).trim(),
              kind,
              parentId,
              personId: kind === 'person' ? String(f.get('ownerPersonId') || '') || null : null,
              sortOrder: Number(f.get('sortOrder') || 0),
            });
            e.currentTarget.reset();
          }}
        >
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="label">
              Bezeichnung
              <NormHint refs="iso:5.3" />
            </label>
            <input id="label" name="label" required className="input" placeholder="Netzbetrieb" />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Art
              <NormHint refs="iso:5.3" />
            </label>
            <select id="kind" className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(ORG_NODE_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {kind === 'person' && <OwnerSelect id="org-person" label="Person" />}
          <div>
            <label className="label" htmlFor="parent">
              Unterhalb von
              <NormHint refs="iso:5.3" />
            </label>
            <select
              id="parent"
              className="input w-auto"
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
            >
              <option value="">(oberste Ebene)</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="label" htmlFor="sortOrder">
              Reihenfolge
              <NormHint refs="iso:5.3" />
            </label>
            <input id="sortOrder" name="sortOrder" type="number" min={0} className="input" defaultValue={0} />
          </div>
          <button type="submit" className="btn-ghost" disabled={create.isPending}>
            Anlegen
          </button>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : nodes.length === 0 ? (
        <EmptyState
          title="Noch kein Organigramm"
          hint="Beginnen Sie oben: Geschäftsführung, darunter die Bereiche. Unbesetzte Stellen als „Stelle (unbesetzt)“ anlegen — sie sind die interessanteste Information darin."
        />
      ) : (
        <div className="card p-4">
          <ul>{children(null).map((n) => renderNode(n, 0))}</ul>
        </div>
      )}
    </>
  );
}
