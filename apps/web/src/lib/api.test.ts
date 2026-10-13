import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, onSessionRefresh, setAccessToken, type Session } from './api';

const session = (tenantSlug: string): Session => ({
  accessToken: `token-${tenantSlug}`,
  user: { id: 'u', email: 'u@example.test', displayName: 'U', isPlatformAdmin: false },
  activeTenant: {
    membershipId: 'm',
    tenantId: `t-${tenantSlug}`,
    tenantSlug,
    tenantName: tenantSlug,
    roles: [],
  },
  memberships: [],
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('stille Erneuerung', () => {
  it('reicht die erneuerte Sitzung an den Anmeldekontext weiter', async () => {
    setAccessToken('abgelaufen');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { title: 'abgelaufen' }))
      .mockResolvedValueOnce(json(200, session('delta')))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const seen: Session[] = [];
    const off = onSessionRefresh((s) => seen.push(s));
    try {
      await expect(api('/risks')).resolves.toEqual({ ok: true });
    } finally {
      off();
    }
    expect(seen.map((s) => s.activeTenant?.tenantSlug)).toEqual(['delta']);
  });
});
