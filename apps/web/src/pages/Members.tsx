import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader, Spinner } from '../components/ui';
import { ApiError, api } from '../lib/api';

interface Member {
  membershipId: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
}

const ROLE_LABEL: Record<string, string> = {
  isms_manager: 'ISMS-Manager / CISO',
  risk_owner: 'Asset-/Risk-Owner',
  auditor: 'Auditor',
  dpo: 'Datenschutzbeauftragte:r',
};

export function MembersPage() {
  const qc = useQueryClient();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [sodWarning, setSodWarning] = useState<{ membershipId: string; roles: string[]; detail: string } | null>(null);

  const list = useQuery({ queryKey: ['members'], queryFn: () => api<Member[]>('/members') });

  const invite = useMutation({
    mutationFn: (dto: { email: string; displayName: string; roleKeys: string[] }) =>
      api<{ membershipId: string; inviteToken: string }>('/members', { method: 'POST', body: JSON.stringify(dto) }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      setInviteLink(`${window.location.origin}/einladung?token=${res.inviteToken}`);
    },
  });

  const setRoles = useMutation({
    mutationFn: (v: { membershipId: string; roleKeys: string[]; acknowledgeSodWarnings?: boolean }) =>
      api(`/members/${v.membershipId}/roles`, {
        method: 'PUT',
        body: JSON.stringify({ roleKeys: v.roleKeys, acknowledgeSodWarnings: v.acknowledgeSodWarnings ?? false }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['members'] });
      setSodWarning(null);
    },
    onError: (err, v) => {
      // Eine „warn“-Regel der Funktionstrennung lässt sich bewusst bestätigen; „block“ nicht.
      if (err instanceof ApiError && err.status === 409 && String((err.body as { type?: string })?.type).includes('sod-warning')) {
        setSodWarning({ membershipId: v.membershipId, roles: v.roleKeys, detail: err.detail ?? '' });
      }
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Verwaltung"
        title="Mitglieder & Rollen"
        description="Rollen steuern, wer was darf. Unvereinbare Kombinationen — etwa Auditor und ISMS-Manager — lehnt die Suite ab; heikle wie DSB und ISMS-Manager verlangen eine bewusste Bestätigung."
      />
      <ErrorNote error={list.error ?? invite.error} />

      {inviteLink && (
        <div className="mb-4 rounded-md border border-brand-200 bg-brand-50 p-3">
          <p className="text-sm font-medium text-brand-900">Einladung erstellt</p>
          <p className="mt-1 text-xs text-brand-800">Geben Sie diesen Link weiter — damit setzt die Person ihr Passwort und tritt dem Mandanten bei.</p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs text-slate-700">{inviteLink}</code>
          <button type="button" className="mt-2 text-xs text-brand-700 underline" onClick={() => setInviteLink(null)}>
            Ausblenden
          </button>
        </div>
      )}

      {sodWarning && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Funktionstrennung: Bitte bestätigen</p>
          <p className="mt-1 text-xs text-amber-800">{sodWarning.detail}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-primary py-1 text-xs"
              onClick={() => setRoles.mutate({ ...sodWarning, roleKeys: sodWarning.roles, acknowledgeSodWarnings: true })}
            >
              Trotzdem zuweisen
            </button>
            <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setSodWarning(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <form
        className="card mb-6 flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          invite.mutate({
            email: String(f.get('email')),
            displayName: String(f.get('displayName')),
            roleKeys: [String(f.get('role'))],
          });
          e.currentTarget.reset();
        }}
      >
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="displayName">
            Name
          </label>
          <input id="displayName" name="displayName" required minLength={2} className="input" />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="email">
            E-Mail
          </label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="role">
            Rolle
          </label>
          <select id="role" name="role" className="input w-auto" defaultValue="risk_owner">
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={invite.isPending}>
          Einladen
        </button>
      </form>

      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="th">Person</th>
                <th className="th w-32">Status</th>
                <th className="th w-64">Rollen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data?.map((m) => (
                <tr key={m.membershipId}>
                  <td className="td">
                    <p className="font-medium text-slate-800">{m.displayName}</p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </td>
                  <td className="td">
                    <span className={`badge ${m.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                      {m.status === 'active' ? 'Aktiv' : 'Eingeladen'}
                    </span>
                  </td>
                  <td className="td">
                    <select
                      className="input py-1 text-xs"
                      value={m.roles[0] ?? ''}
                      onChange={(e) => setRoles.mutate({ membershipId: m.membershipId, roleKeys: [e.target.value] })}
                    >
                      {Object.entries(ROLE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {m.roles.length > 1 && <p className="mt-1 text-xs text-slate-500">+ {m.roles.slice(1).map((r) => ROLE_LABEL[r] ?? r).join(', ')}</p>}
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
