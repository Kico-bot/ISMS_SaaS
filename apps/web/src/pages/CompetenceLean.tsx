import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useState } from 'react';
import {
  EmptyState,
  ErrorNote,
  MoreMenu,
  MoreMenuItem,
  NormHint,
  PageHeader,
  Spinner,
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { TRAINING_KIND_LABEL, type Training, type TrainingDetail } from './Competence';

interface PersonRow {
  id: string;
  name: string;
  department: string | null;
}

interface Assignment {
  trainingId: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  overdue: boolean | null;
}

type Form = 'assign' | 'training' | 'person' | null;

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

/**
 * Team & Schulung in der schlanken Oberfläche: eine Liste der Beschäftigten mit ihrem
 * Schulungsstand (Kap. 7.2, 7.3). Ein Klick zeigt die Schulungen der Person. Qualifikations-
 * matrix und Profile bleiben in der vollständigen Oberfläche (VITE_FULL_UI=true).
 */
export function CompetenceLeanPage() {
  const { can, personId } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const persons = useQuery({
    queryKey: ['persons'],
    queryFn: () => api<PersonRow[]>('/persons'),
    enabled: can('context.read'),
  });
  const trainings = useQuery({ queryKey: ['trainings'], queryFn: () => api<Training[]>('/trainings') });
  const details = useQueries({
    queries: (trainings.data ?? []).map((t) => ({
      queryKey: ['training', t.id],
      queryFn: () => api<TrainingDetail>(`/trainings/${t.id}`),
    })),
  });

  // Je Person ihre Schulungen, aus den Teilnehmerlisten der Schulungen zusammengesetzt.
  const byPerson = new Map<string, Assignment[]>();
  const people = new Map<string, PersonRow>();
  for (const p of persons.data ?? []) people.set(p.id, p);
  for (const d of details) {
    const t = d.data;
    if (!t) continue;
    for (const p of t.participants) {
      if (!people.has(p.personId))
        people.set(p.personId, { id: p.personId, name: p.name, department: p.department });
      const list = byPerson.get(p.personId) ?? [];
      list.push({
        trainingId: t.id,
        title: t.title,
        dueAt: p.dueAt,
        completedAt: p.completedAt,
        overdue: p.overdue,
      });
      byPerson.set(p.personId, list);
    }
  }
  const rows = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['trainings'] });
    void qc.invalidateQueries({ queryKey: ['training'] });
    void qc.invalidateQueries({ queryKey: ['my-trainings'] });
    void qc.invalidateQueries({ queryKey: ['persons'] });
  };
  const complete = useMutation({
    mutationFn: (v: { trainingId: string; personId?: string }) =>
      api(`/trainings/${v.trainingId}/complete`, {
        method: 'POST',
        body: JSON.stringify(v.personId ? { personId: v.personId } : {}),
      }),
    onSuccess: refresh,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/persons/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const canAssign = can('training.write');
  const loading = trainings.isLoading || persons.isLoading || details.some((d) => d.isLoading);

  return (
    <>
      <PageHeader
        eyebrow="Betreiben"
        title="Team & Schulung"
        norm={['iso:7.2', 'iso:7.3', 'iso:A.6.3']}
        description="Wer im ISMS mitarbeitet und wie weit jede Person mit ihren Schulungen ist."
        actions={
          canAssign || can('context.write') ? (
            <>
              {canAssign && (
                <button type="button" className="btn-primary" onClick={() => setForm('assign')}>
                  Schulung zuweisen
                </button>
              )}
              <MoreMenu>
                {canAssign && (
                  <MoreMenuItem onClick={() => setForm('training')}>Neue Schulung anlegen</MoreMenuItem>
                )}
                {can('context.write') && (
                  <MoreMenuItem onClick={() => setForm('person')}>Person erfassen</MoreMenuItem>
                )}
              </MoreMenu>
            </>
          ) : undefined
        }
      />
      <ErrorNote error={trainings.error ?? persons.error ?? complete.error ?? deactivate.error} />

      {form === 'assign' && (
        <AssignForm
          trainings={trainings.data ?? []}
          persons={rows}
          onDone={() => {
            refresh();
            setForm(null);
          }}
          onCancel={() => setForm(null)}
        />
      )}
      {form === 'training' && (
        <TrainingForm
          onDone={() => {
            refresh();
            setForm(null);
          }}
          onCancel={() => setForm(null)}
        />
      )}
      {form === 'person' && (
        <PersonForm
          onDone={() => {
            refresh();
            setForm(null);
          }}
          onCancel={() => setForm(null)}
        />
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Noch niemand erfasst." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Person</th>
                <th className="th w-56">Bereich</th>
                <th className="th w-56">
                  <span className="inline-flex items-center gap-1.5">
                    Schulungsstand <NormHint refs="iso:7.3" />
                  </span>
                </th>
                {can('context.write') && <th className="th w-12" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const list = byPerson.get(p.id) ?? [];
                const done = list.filter((a) => a.completedAt).length;
                const overdue = list.filter((a) => !a.completedAt && a.overdue).length;
                const open = openId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setOpenId(open ? null : p.id)}
                      aria-expanded={open}
                    >
                      <td className="td font-medium text-slate-800">{p.name}</td>
                      <td className="td text-sm text-slate-600">{p.department ?? '–'}</td>
                      <td className="td text-sm">
                        {list.length === 0 ? (
                          <span className="text-slate-400">keine zugewiesen</span>
                        ) : (
                          <span className={clsx(done === list.length ? 'text-level-low' : 'text-slate-700')}>
                            {done} von {list.length} abgeschlossen
                            {overdue > 0 && (
                              <span className="ml-2 whitespace-nowrap font-medium text-level-critical">
                                {overdue} überfällig
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      {can('context.write') && (
                        <td className="td">
                          <MoreMenu compact label={`Aktionen für ${p.name}`}>
                            <MoreMenuItem onClick={() => deactivate.mutate(p.id)}>Ausscheiden</MoreMenuItem>
                          </MoreMenu>
                        </td>
                      )}
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={4} className="bg-slate-50 px-4 py-3">
                          {list.length === 0 ? (
                            <p className="text-sm text-slate-500">Keine Schulung zugewiesen.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {list.map((a) => (
                                <li key={a.trainingId} className="flex flex-wrap items-center gap-3 text-sm">
                                  <span className="min-w-0 flex-1 text-slate-800">{a.title}</span>
                                  {a.completedAt ? (
                                    <span className="text-level-low">
                                      abgeschlossen am {date(a.completedAt)}
                                    </span>
                                  ) : (
                                    <>
                                      <span
                                        className={clsx(
                                          a.overdue ? 'font-medium text-level-critical' : 'text-slate-600',
                                        )}
                                      >
                                        offen, Frist {date(a.dueAt)}
                                      </span>
                                      {(p.id === personId || canAssign) && (
                                        <button
                                          type="button"
                                          className="btn-ghost py-0.5 text-xs"
                                          disabled={complete.isPending}
                                          onClick={() =>
                                            complete.mutate({
                                              trainingId: a.trainingId,
                                              personId: p.id === personId ? undefined : p.id,
                                            })
                                          }
                                        >
                                          {p.id === personId
                                            ? 'Teilnahme bestätigen'
                                            : 'Als abgeschlossen eintragen'}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Actions({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <button type="submit" className="btn-primary" disabled={pending}>
        Speichern
      </button>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  );
}

function AssignForm({
  trainings,
  persons,
  onDone,
  onCancel,
}: {
  trainings: Training[];
  persons: PersonRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const assign = useMutation({
    mutationFn: (v: { trainingId: string; personIds: string[]; dueAt: string | null }) =>
      api(`/trainings/${v.trainingId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ personIds: v.personIds, dueAt: v.dueAt }),
      }),
    onSuccess: onDone,
  });
  if (trainings.length === 0) {
    return <EmptyState title="Noch keine Schulung angelegt." hint="Legen Sie sie über „Mehr“ an." />;
  }
  return (
    <form
      className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_12rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const who = String(f.get('personId') || '');
        assign.mutate({
          trainingId: String(f.get('trainingId')),
          // Leer heißt: alle aktiven Beschäftigten. Wer schon teilgenommen hat, behält das.
          personIds: who ? [who] : [],
          dueAt: String(f.get('dueAt') || '') || null,
        });
      }}
    >
      <ErrorNote error={assign.error} />
      <div>
        <label className="label" htmlFor="assign-training">
          Schulung
        </label>
        <select id="assign-training" name="trainingId" className="input" required>
          {trainings.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="assign-person">
          Für
        </label>
        <select id="assign-person" name="personId" className="input" defaultValue="">
          <option value="">alle Beschäftigten</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="assign-due">
          Frist
        </label>
        <input id="assign-due" name="dueAt" type="date" className="input" />
      </div>
      <Actions pending={assign.isPending} onCancel={onCancel} />
    </form>
  );
}

function TrainingForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/trainings', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: onDone,
  });
  return (
    <form
      className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_14rem_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        create.mutate({ title: String(f.get('title')).trim(), kind: String(f.get('kind')) });
      }}
    >
      <ErrorNote error={create.error} />
      <div>
        <label className="label" htmlFor="training-title">
          Schulung
        </label>
        <input id="training-title" name="title" required minLength={3} className="input" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="training-kind">
          Art
        </label>
        <select id="training-kind" name="kind" className="input" defaultValue="awareness">
          {Object.entries(TRAINING_KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <Actions pending={create.isPending} onCancel={onCancel} />
    </form>
  );
}

function PersonForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/persons', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: onDone,
  });
  return (
    <form
      className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const t = (k: string) => String(f.get(k) ?? '').trim() || null;
        create.mutate({ name: t('name'), department: t('department'), email: t('email') });
      }}
    >
      <ErrorNote error={create.error} />
      <div>
        <label className="label" htmlFor="person-name">
          Name
        </label>
        <input id="person-name" name="name" required minLength={2} className="input" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="person-department">
          Bereich
        </label>
        <input id="person-department" name="department" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="person-email">
          E-Mail
        </label>
        <input id="person-email" name="email" type="email" className="input" />
      </div>
      <Actions pending={create.isPending} onCancel={onCancel} />
    </form>
  );
}
