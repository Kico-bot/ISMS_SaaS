import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorNote } from '../components/ui';
import { auth, setAccessToken } from '../lib/api';

/** Einladungslink: Passwort setzen (neues Konto) bzw. bestätigen (bestehendes) und beitreten. */
export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await auth.acceptInvite(token, String(new FormData(e.currentTarget).get('password')));
      setAccessToken(session.accessToken);
      window.location.href = '/';
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Einladung annehmen</h1>
        <p className="mb-6 text-sm text-slate-600">Legen Sie Ihr Passwort fest, um dem Mandanten beizutreten.</p>
        <div className="card p-6">
          <ErrorNote error={error} />
          {!token ? (
            <p className="text-sm text-slate-600">Dieser Link enthält keinen Einladungscode. Bitte fordern Sie eine neue Einladung an.</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="label" htmlFor="password">
                  Passwort
                </label>
                <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" className="input" />
                <p className="mt-1 text-xs text-slate-500">
                  Mindestens 12 Zeichen. Falls Sie bereits ein Konto haben, geben Sie Ihr bestehendes Passwort ein.
                </p>
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
                {busy ? 'Einen Moment …' : 'Beitreten'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
