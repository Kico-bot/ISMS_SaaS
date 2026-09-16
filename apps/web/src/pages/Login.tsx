import { useState, type FormEvent } from 'react';
import { ErrorNote } from '../components/ui';
import { useAuth } from '../lib/auth-context';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (mode === 'login') {
        await login(
          String(f.get('email')),
          String(f.get('password')),
          String(f.get('tenantSlug') || '') || undefined,
        );
      } else {
        await register({
          tenantName: String(f.get('tenantName')),
          tenantSlug: String(f.get('tenantSlug')),
          email: String(f.get('email')),
          password: String(f.get('password')),
          displayName: String(f.get('displayName')),
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">ISMS Suite</h1>
          <p className="mt-1 text-sm text-slate-600">
            Integriertes Managementsystem für Informationssicherheit und Datenschutz
          </p>
        </div>

        <div className="card p-6">
          <div className="mb-4 flex gap-1 rounded-md bg-slate-100 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                {m === 'login' ? 'Anmelden' : 'Mandant anlegen'}
              </button>
            ))}
          </div>

          <ErrorNote error={error} />

          <form onSubmit={onSubmit} className="space-y-3">
            {mode === 'register' && (
              <>
                <div>
                  <label className="label" htmlFor="tenantName">
                    Organisation
                  </label>
                  <input
                    id="tenantName"
                    name="tenantName"
                    required
                    minLength={2}
                    className="input"
                    placeholder="Muster GmbH"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="displayName">
                    Ihr Name
                  </label>
                  <input
                    id="displayName"
                    name="displayName"
                    required
                    minLength={2}
                    className="input"
                    placeholder="Vor- und Nachname"
                  />
                </div>
              </>
            )}
            <div>
              <label className="label" htmlFor="tenantSlug">
                Mandanten-Kürzel{' '}
                {mode === 'login' && <span className="font-normal text-slate-400">(optional)</span>}
              </label>
              <input
                id="tenantSlug"
                name="tenantSlug"
                required={mode === 'register'}
                pattern="[a-z0-9][a-z0-9\-]*"
                className="input"
                placeholder="muster-gmbh"
              />
            </div>
            <div>
              <label className="label" htmlFor="email">
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === 'register' ? 12 : 8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="input"
              />
              {mode === 'register' && <p className="mt-1 text-xs text-slate-500">Mindestens 12 Zeichen.</p>}
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {busy ? 'Einen Moment …' : mode === 'login' ? 'Anmelden' : 'Mandant anlegen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
