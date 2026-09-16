import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { EmptyState, ErrorNote, PageHeader, Progress, Spinner, StatTile } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';

interface MatrixRow {
  id: string;
  name: string;
  department: string | null;
  profileNames: string;
  profileCount: number;
  requiredSkills: number;
  openGaps: number;
  maxGap: number;
  expiredEvidence: number;
  openTrainings: number;
}

interface Skill {
  id: string;
  name: string;
  description: string | null;
  profileCount: number;
  personCount: number;
}

interface Profile {
  id: string;
  name: string;
  description: string | null;
  personCount: number;
  requirements: { skillId: string; name: string; minLevel: number }[];
}

interface Gap {
  skillId: string;
  name: string;
  affectedPersons: number;
  maxGap: number;
  personNames: string;
}

interface PersonCompetence {
  id: string;
  name: string;
  department: string | null;
  position: string | null;
  profiles: { id: string; name: string }[];
  skills: {
    skillId: string;
    name: string;
    level: number;
    evidenceNote: string | null;
    validUntil: string | null;
    expired: boolean | null;
  }[];
  gaps: {
    skillId: string;
    name: string;
    minLevel: number;
    actualLevel: number;
    gap: number;
    profileName: string;
  }[];
}

interface Training {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  isActive: boolean;
  assigned: number;
  completed: number;
  overdue: number;
  nextDueAt: string | null;
}

interface TrainingDetail extends Training {
  participants: {
    personId: string;
    name: string;
    department: string | null;
    dueAt: string | null;
    completedAt: string | null;
    score: number | null;
    overdue: boolean | null;
  }[];
}

interface MyTraining {
  trainingId: string;
  title: string;
  kind: string;
  dueAt: string | null;
  overdue: boolean | null;
}

const TRAINING_KIND_LABEL: Record<string, string> = {
  awareness: 'Awareness',
  nis2_management: 'NIS2-Leitungsschulung',
  phishing: 'Phishing-Simulation',
  onboarding: 'Einarbeitung',
  other: 'Sonstige',
};

const LEVEL_LABEL: Record<number, string> = {
  1: 'Grundkenntnisse',
  2: 'Anwendung unter Anleitung',
  3: 'selbstständige Anwendung',
  4: 'vertieft',
  5: 'Fachexpertise',
};

const date = (v: string | null) => (v ? new Date(v).toLocaleDateString('de-DE') : '–');

type Tab = 'matrix' | 'profiles' | 'trainings';

export function CompetencePage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('matrix');

  const matrix = useQuery({
    queryKey: ['competence-matrix'],
    queryFn: () => api<MatrixRow[]>('/competence/matrix'),
  });
  const gaps = useQuery({ queryKey: ['competence-gaps'], queryFn: () => api<Gap[]>('/competence/gaps') });
  const mine = useQuery({ queryKey: ['my-trainings'], queryFn: () => api<MyTraining[]>('/trainings/mine') });

  const complete = useMutation({
    mutationFn: (trainingId: string) =>
      api(`/trainings/${trainingId}/complete`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-trainings'] });
      void qc.invalidateQueries({ queryKey: ['trainings'] });
      void qc.invalidateQueries({ queryKey: ['competence-matrix'] });
    },
  });

  const rows = matrix.data ?? [];
  const withGaps = rows.filter((r) => r.openGaps > 0).length;
  const withoutProfile = rows.filter((r) => r.profileCount === 0).length;
  const expired = rows.reduce((n, r) => n + r.expiredEvidence, 0);

  return (
    <>
      <PageHeader
        eyebrow="ISMS-Kern"
        title="Kompetenz & Schulung"
        description="Erforderliche Kompetenz nach ISO 27001 Kap. 7.2 und Sensibilisierung nach Kap. 7.3. Ein Kompetenzprofil sagt, was eine Rolle können muss — die Lücke dazu ist der Schulungsbedarf, nicht das Bauchgefühl."
      />
      <ErrorNote error={matrix.error ?? gaps.error ?? complete.error} />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Personen mit Lücke"
          value={withGaps}
          tone={withGaps > 0 ? 'warn' : 'good'}
          hint={`${rows.length} Beschäftigte`}
        />
        <StatTile
          label="Ohne Kompetenzprofil"
          value={withoutProfile}
          tone={withoutProfile > 0 ? 'neutral' : 'good'}
        />
        <StatTile label="Abgelaufene Nachweise" value={expired} tone={expired > 0 ? 'bad' : 'good'} />
        <StatTile
          label="Von mir zu absolvieren"
          value={mine.data?.length ?? 0}
          tone={(mine.data?.length ?? 0) > 0 ? 'warn' : 'good'}
        />
      </section>

      {(mine.data?.length ?? 0) > 0 && (
        <section className="card mb-6 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-medium text-slate-700">Ihre offenen Schulungen</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {mine.data!.map((t) => (
              <li
                key={t.trainingId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {TRAINING_KIND_LABEL[t.kind] ?? t.kind}
                    {t.dueAt && (
                      <span className={clsx('ml-2', t.overdue && 'font-medium text-level-critical')}>
                        {t.overdue ? 'überfällig seit' : 'bis'} {date(t.dueAt)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary py-1 text-xs"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate(t.trainingId)}
                >
                  Teilnahme bestätigen
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ['matrix', 'Qualifikationsmatrix'],
            ['profiles', 'Fähigkeiten & Profile'],
            ['trainings', 'Schulungen'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === key
                ? 'border-brand-600 font-medium text-brand-700'
                : 'border-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'matrix' && (
        <MatrixTab
          rows={rows}
          gaps={gaps.data ?? []}
          loading={matrix.isLoading}
          writable={can('competence.write')}
        />
      )}
      {tab === 'profiles' && <ProfilesTab writable={can('competence.write')} />}
      {tab === 'trainings' && <TrainingsTab writable={can('training.write')} />}
    </>
  );
}

function MatrixTab({
  rows,
  gaps,
  loading,
  writable,
}: {
  rows: MatrixRow[];
  gaps: Gap[];
  loading: boolean;
  writable: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) return <Spinner />;
  if (rows.length === 0)
    return (
      <EmptyState
        title="Noch keine Beschäftigten erfasst"
        hint="Personen pflegen Sie unter „Beschäftigte“."
      />
    );

  return (
    <>
      {gaps.length > 0 && (
        <section className="card mb-4 overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2">
            <h2 className="text-sm font-medium text-slate-700">Schulungsbedarf nach Fähigkeit</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {gaps.map((g) => (
              <li key={g.skillId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="text-sm text-slate-800">{g.name}</span>
                <span className="text-xs text-slate-500">
                  {g.affectedPersons} {g.affectedPersons === 1 ? 'Person' : 'Personen'} · größte Lücke{' '}
                  {g.maxGap} Stufen
                  <span className="ml-2 text-slate-400">{g.personNames}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="th">Person</th>
              <th className="th w-56">Kompetenzprofil</th>
              <th className="th w-44">Sollerfüllung</th>
              <th className="th w-28">Größte Lücke</th>
              <th className="th w-32">Nachweise</th>
              <th className="th w-32">Schulungen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const met = r.requiredSkills - r.openGaps;
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(r.id)}>
                  <td className="td">
                    <span className="font-medium text-slate-800">{r.name}</span>
                    {r.department && <span className="ml-2 text-xs text-slate-500">{r.department}</span>}
                  </td>
                  <td className="td text-xs text-slate-600">
                    {r.profileNames || <span className="text-slate-400">nicht zugewiesen</span>}
                  </td>
                  <td className="td">
                    {r.requiredSkills === 0 ? (
                      <span className="text-xs text-slate-400">keine Anforderung</span>
                    ) : (
                      <>
                        <p className="mb-1 text-xs tabular-nums text-slate-600">
                          {met} von {r.requiredSkills} erfüllt
                        </p>
                        <Progress value={met} max={r.requiredSkills} tone="level" />
                      </>
                    )}
                  </td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      r.maxGap > 1 ? 'font-medium text-level-critical' : 'text-slate-600',
                    )}
                  >
                    {r.maxGap > 0 ? `${r.maxGap} Stufen` : '–'}
                  </td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      r.expiredEvidence > 0 ? 'font-medium text-level-critical' : 'text-slate-400',
                    )}
                  >
                    {r.expiredEvidence > 0 ? `${r.expiredEvidence} abgelaufen` : 'gültig'}
                  </td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      r.openTrainings > 0 ? 'text-level-medium' : 'text-slate-400',
                    )}
                  >
                    {r.openTrainings > 0 ? `${r.openTrainings} offen` : 'keine'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && <PersonPanel personId={openId} writable={writable} onClose={() => setOpenId(null)} />}
    </>
  );
}

function PersonPanel({
  personId,
  writable,
  onClose,
}: {
  personId: string;
  writable: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['competence-person', personId],
    queryFn: () => api<PersonCompetence>(`/competence/persons/${personId}`),
  });
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api<Profile[]>('/competence/profiles'),
  });
  const skills = useQuery({ queryKey: ['skills'], queryFn: () => api<Skill[]>('/competence/skills') });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['competence-person', personId] });
    void qc.invalidateQueries({ queryKey: ['competence-matrix'] });
    void qc.invalidateQueries({ queryKey: ['competence-gaps'] });
  };
  const assign = useMutation({
    mutationFn: (profileIds: string[]) =>
      api(`/competence/persons/${personId}/profiles`, {
        method: 'PUT',
        body: JSON.stringify({ profileIds }),
      }),
    onSuccess: refresh,
  });
  const setSkill = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api(`/competence/persons/${personId}/skills`, { method: 'PUT', body: JSON.stringify(dto) }),
    onSuccess: refresh,
  });

  const d = detail.data;
  const assignedProfileIds = new Set((d?.profiles ?? []).map((p) => p.id));

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Kompetenz der Person"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{d.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {[d.department, d.position].filter(Boolean).join(' · ') || 'keine Abteilung hinterlegt'}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Schließen
              </button>
            </div>

            <ErrorNote error={assign.error ?? setSkill.error} />

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-medium text-slate-700">Kompetenzprofile</h3>
              {(profiles.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Noch kein Profil angelegt.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(profiles.data ?? []).map((p) => {
                    const on = assignedProfileIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!writable}
                        className={clsx(
                          'badge cursor-pointer ring-1 ring-inset',
                          on
                            ? 'bg-brand-50 text-brand-700 ring-brand-200'
                            : 'bg-white text-slate-600 ring-slate-300',
                          !writable && 'cursor-default',
                        )}
                        onClick={() => {
                          const next = new Set(assignedProfileIds);
                          if (on) next.delete(p.id);
                          else next.add(p.id);
                          assign.mutate([...next]);
                        }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {d.gaps.length > 0 && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-medium text-slate-700">Offene Lücken</h3>
                <ul className="space-y-1">
                  {d.gaps.map((g) => (
                    <li
                      key={g.skillId}
                      className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2"
                    >
                      <span className="text-sm text-slate-800">
                        {g.name}
                        <span className="ml-2 text-xs text-slate-500">aus „{g.profileName}“</span>
                      </span>
                      <span className="text-xs tabular-nums text-amber-900">
                        Stufe {g.actualLevel} von {g.minLevel} gefordert
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Erfasster Stand</h3>
              {d.skills.length === 0 ? (
                <p className="mb-2 text-sm text-slate-500">Noch keine Kompetenz erfasst.</p>
              ) : (
                <ul className="mb-3 space-y-1">
                  {d.skills.map((s) => (
                    <li key={s.skillId} className="rounded border border-slate-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-800">{s.name}</span>
                        <span className="text-xs text-slate-600">
                          Stufe {s.level} <span className="text-slate-400">{LEVEL_LABEL[s.level]}</span>
                        </span>
                      </div>
                      {(s.evidenceNote || s.validUntil) && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {s.evidenceNote}
                          {s.validUntil && (
                            <span className={clsx('ml-2', s.expired && 'font-medium text-level-critical')}>
                              {s.expired ? 'abgelaufen am' : 'gültig bis'} {date(s.validUntil)}
                            </span>
                          )}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {writable && (skills.data ?? []).length > 0 && (
                <form
                  className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setSkill.mutate({
                      skillId: String(f.get('skillId')),
                      level: Number(f.get('level')),
                      evidenceNote: String(f.get('evidenceNote') || '') || null,
                      validUntil: String(f.get('validUntil') || '') || null,
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <div className="min-w-44 flex-1">
                    <label className="label" htmlFor="skillId">
                      Fähigkeit
                    </label>
                    <select id="skillId" name="skillId" className="input">
                      {(skills.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="level">
                      Stufe
                    </label>
                    <select id="level" name="level" className="input w-auto" defaultValue="3">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} — {LEVEL_LABEL[n]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-40 flex-1">
                    <label className="label" htmlFor="evidenceNote">
                      Nachweis
                    </label>
                    <input
                      id="evidenceNote"
                      name="evidenceNote"
                      className="input"
                      placeholder="Zertifikat, Schulung, Projekt"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="validUntil">
                      Gültig bis
                    </label>
                    <input id="validUntil" name="validUntil" type="date" className="input w-auto" />
                  </div>
                  <button type="submit" className="btn-ghost" disabled={setSkill.isPending}>
                    Erfassen
                  </button>
                </form>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function ProfilesTab({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const [creatingSkill, setCreatingSkill] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [levels, setLevels] = useState<Record<string, number>>({});

  const skills = useQuery({ queryKey: ['skills'], queryFn: () => api<Skill[]>('/competence/skills') });
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api<Profile[]>('/competence/profiles'),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['skills'] });
    void qc.invalidateQueries({ queryKey: ['profiles'] });
    void qc.invalidateQueries({ queryKey: ['competence-matrix'] });
    void qc.invalidateQueries({ queryKey: ['competence-gaps'] });
  };
  const createSkill = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/competence/skills', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      refresh();
      setCreatingSkill(false);
    },
  });
  const createProfile = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/competence/profiles', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      refresh();
      setCreatingProfile(false);
      setLevels({});
    },
  });
  const removeSkill = useMutation({
    mutationFn: (id: string) => api(`/competence/skills/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const removeProfile = useMutation({
    mutationFn: (id: string) => api(`/competence/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ErrorNote
        error={createSkill.error ?? createProfile.error ?? removeSkill.error ?? removeProfile.error}
      />

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">Fähigkeiten</h2>
          {writable && (
            <button
              type="button"
              className="btn-ghost py-0.5 text-xs"
              onClick={() => setCreatingSkill(!creatingSkill)}
            >
              {creatingSkill ? 'Abbrechen' : 'Fähigkeit'}
            </button>
          )}
        </div>
        {creatingSkill && (
          <form
            className="mb-3 flex flex-wrap items-end gap-2 rounded border border-dashed border-slate-300 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              createSkill.mutate({
                name: String(f.get('name')).trim(),
                description: String(f.get('description') || '') || null,
              });
            }}
          >
            <input
              name="name"
              required
              minLength={2}
              className="input flex-1"
              placeholder="z. B. IT-Forensik"
              autoFocus
            />
            <input name="description" className="input flex-1" placeholder="Beschreibung" />
            <button type="submit" className="btn-primary py-1 text-xs" disabled={createSkill.isPending}>
              Anlegen
            </button>
          </form>
        )}
        {skills.isLoading ? (
          <Spinner />
        ) : (skills.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Fähigkeiten erfasst.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(skills.data ?? []).map((s) => (
              <li key={s.id} className="group flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{s.name}</p>
                  {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {s.profileCount} Profile · {s.personCount} Personen
                  </span>
                  {writable && (
                    <button
                      type="button"
                      className="hidden text-xs text-slate-400 underline hover:text-slate-700 group-hover:inline"
                      onClick={() => removeSkill.mutate(s.id)}
                    >
                      Entfernen
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">Kompetenzprofile</h2>
          {writable && (skills.data ?? []).length > 0 && (
            <button
              type="button"
              className="btn-ghost py-0.5 text-xs"
              onClick={() => setCreatingProfile(!creatingProfile)}
            >
              {creatingProfile ? 'Abbrechen' : 'Profil'}
            </button>
          )}
        </div>
        {creatingProfile && (
          <form
            className="mb-3 space-y-2 rounded border border-dashed border-slate-300 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              createProfile.mutate({
                name: String(f.get('name')).trim(),
                description: String(f.get('description') || '') || null,
                requirements: Object.entries(levels)
                  .filter(([, lvl]) => lvl > 0)
                  .map(([skillId, minLevel]) => ({ skillId, minLevel })),
              });
            }}
          >
            <input
              name="name"
              required
              minLength={2}
              className="input"
              placeholder="z. B. Systemadministration"
              autoFocus
            />
            <input name="description" className="input" placeholder="Wofür steht dieses Profil?" />
            <fieldset>
              <legend className="label">Geforderte Mindeststufen</legend>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {(skills.data ?? []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-700">{s.name}</span>
                    <select
                      className="input w-auto py-0.5 text-xs"
                      value={levels[s.id] ?? 0}
                      onChange={(e) => setLevels({ ...levels, [s.id]: Number(e.target.value) })}
                    >
                      <option value={0}>nicht gefordert</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          ab Stufe {n}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </fieldset>
            <button
              type="submit"
              className="btn-primary w-full py-1 text-xs"
              disabled={createProfile.isPending}
            >
              Profil anlegen
            </button>
          </form>
        )}
        {profiles.isLoading ? (
          <Spinner />
        ) : (profiles.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Noch kein Profil angelegt.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(profiles.data ?? []).map((p) => (
              <li key={p.id} className="group py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                    <p className="mt-1 text-xs text-slate-600">
                      {p.requirements.length === 0 ? (
                        <span className="text-level-medium">ohne Anforderungen — erzeugt keine Lücke</span>
                      ) : (
                        p.requirements.map((r) => `${r.name} ab ${r.minLevel}`).join(' · ')
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400">{p.personCount} Personen</span>
                    {writable && (
                      <button
                        type="button"
                        className="hidden text-xs text-slate-400 underline hover:text-slate-700 group-hover:inline"
                        onClick={() => removeProfile.mutate(p.id)}
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TrainingsTab({ writable }: { writable: boolean }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['trainings'], queryFn: () => api<Training[]>('/trainings') });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['trainings'] });
    void qc.invalidateQueries({ queryKey: ['my-trainings'] });
    void qc.invalidateQueries({ queryKey: ['competence-matrix'] });
  };
  const create = useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      api('/trainings', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: () => {
      refresh();
      setCreating(false);
    },
  });

  return (
    <>
      <ErrorNote error={list.error ?? create.error} />
      {writable && !creating && (
        <button type="button" className="btn-primary mb-4" onClick={() => setCreating(true)}>
          Schulung anlegen
        </button>
      )}
      {creating && (
        <form
          className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              title: String(f.get('title')).trim(),
              kind: String(f.get('kind')),
              description: String(f.get('description') || '') || null,
            });
          }}
        >
          <div className="lg:col-span-2">
            <label className="label" htmlFor="title">
              Schulung
            </label>
            <input
              id="title"
              name="title"
              required
              minLength={3}
              className="input"
              placeholder="Security-Awareness 2026"
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Art
            </label>
            <select id="kind" name="kind" className="input" defaultValue="awareness">
              {Object.entries(TRAINING_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="description">
              Inhalt
            </label>
            <input
              id="description"
              name="description"
              className="input"
              placeholder="Phishing, Passwörter, Meldewege"
            />
          </div>
          <div className="flex items-end gap-2 lg:col-span-4">
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              Anlegen
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="Noch keine Schulungen"
          hint="Kap. 7.3 verlangt Sensibilisierung aller Beschäftigten. Eine Awareness-Schulung je Jahr plus Einarbeitung neuer Kolleginnen und Kollegen ist der übliche Zuschnitt."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Schulung</th>
                <th className="th w-44">Art</th>
                <th className="th w-44">Teilnahme</th>
                <th className="th w-32">Nächste Frist</th>
                <th className="th w-28">Überfällig</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(list.data ?? []).map((t) => (
                <tr
                  key={t.id}
                  className={clsx('cursor-pointer hover:bg-slate-50', !t.isActive && 'opacity-50')}
                  onClick={() => setOpenId(t.id)}
                >
                  <td className="td">
                    <span className="font-medium text-slate-800">{t.title}</span>
                    {t.description && <span className="ml-2 text-xs text-slate-500">{t.description}</span>}
                  </td>
                  <td className="td text-xs text-slate-600">{TRAINING_KIND_LABEL[t.kind] ?? t.kind}</td>
                  <td className="td">
                    {t.assigned === 0 ? (
                      <span className="text-xs text-slate-400">nicht zugewiesen</span>
                    ) : (
                      <>
                        <p className="mb-1 text-xs tabular-nums text-slate-600">
                          {t.completed} von {t.assigned}
                        </p>
                        <Progress value={t.completed} max={t.assigned} tone="level" />
                      </>
                    )}
                  </td>
                  <td className="td text-xs tabular-nums text-slate-600">{date(t.nextDueAt)}</td>
                  <td
                    className={clsx(
                      'td text-xs tabular-nums',
                      t.overdue > 0 ? 'font-medium text-level-critical' : 'text-slate-400',
                    )}
                  >
                    {t.overdue || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <TrainingPanel id={openId} writable={writable} onClose={() => setOpenId(null)} onChanged={refresh} />
      )}
    </>
  );
}

function TrainingPanel({
  id,
  writable,
  onClose,
  onChanged,
}: {
  id: string;
  writable: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['training', id],
    queryFn: () => api<TrainingDetail>(`/trainings/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['training', id] });
    onChanged();
  };
  const assign = useMutation({
    mutationFn: (dueAt: string | null) =>
      api(`/trainings/${id}/assign`, { method: 'POST', body: JSON.stringify({ dueAt }) }),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (personId: string) =>
      api(`/trainings/${id}/complete`, { method: 'POST', body: JSON.stringify({ personId }) }),
    onSuccess: refresh,
  });

  const d = detail.data;
  const done = (d?.participants ?? []).filter((p) => p.completedAt).length;

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-slate-900/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Schulung"
      >
        {!d ? (
          <Spinner />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{d.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {TRAINING_KIND_LABEL[d.kind] ?? d.kind}
                  {d.description && ` · ${d.description}`}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Schließen
              </button>
            </div>

            <ErrorNote error={assign.error ?? complete.error} />

            {writable && (
              <form
                className="mb-6 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-slate-300 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  assign.mutate(String(f.get('dueAt') || '') || null);
                }}
              >
                <div>
                  <label className="label" htmlFor="assignDue">
                    Frist
                  </label>
                  <input id="assignDue" name="dueAt" type="date" className="input w-auto" />
                </div>
                <button type="submit" className="btn-ghost" disabled={assign.isPending}>
                  Allen Beschäftigten zuweisen
                </button>
                <p className="w-full text-xs text-slate-500">
                  Bereits abgeschlossene Teilnahmen bleiben erhalten — eine erneute Zuweisung setzt niemanden
                  zurück.
                </p>
              </form>
            )}

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-700">
                Teilnahme ({done} von {d.participants.length})
              </h3>
              {d.participants.length === 0 ? (
                <p className="text-sm text-slate-500">Noch niemandem zugewiesen.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.participants.map((p) => (
                    <li key={p.personId} className="flex items-center justify-between gap-2 py-2">
                      <span
                        className={clsx(
                          'text-sm',
                          p.completedAt ? 'text-slate-500' : 'font-medium text-slate-800',
                        )}
                      >
                        {p.name}
                        {p.department && <span className="ml-2 text-xs text-slate-400">{p.department}</span>}
                      </span>
                      <span className="flex items-center gap-2 text-xs tabular-nums">
                        {p.completedAt ? (
                          <span className="text-slate-500">
                            teilgenommen {date(p.completedAt)}
                            {p.score != null && ` · ${p.score} %`}
                          </span>
                        ) : (
                          <>
                            <span
                              className={clsx(
                                p.overdue ? 'font-medium text-level-critical' : 'text-level-medium',
                              )}
                            >
                              {p.overdue
                                ? `überfällig seit ${date(p.dueAt)}`
                                : p.dueAt
                                  ? `bis ${date(p.dueAt)}`
                                  : 'offen'}
                            </span>
                            {writable && (
                              <button
                                type="button"
                                className="btn-ghost py-0.5 text-xs"
                                onClick={() => complete.mutate(p.personId)}
                              >
                                Nachtragen
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
