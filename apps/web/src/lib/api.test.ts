import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onSessionRefresh, setAccessToken, uploadFile, type Session } from './api';

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

const html = (status: number) =>
  new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  });

describe('Fehler ohne JSON (H15)', () => {
  it('macht aus einer HTML-Fehlerseite des Proxys eine deutsche Meldung', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html(502)));
    const err = await api('/risks').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, title: 'Der Server ist gerade nicht erreichbar' });
  });

  it('meldet eine unlesbare Antwort auch beim Hochladen auf Deutsch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html(504)));
    const err = await uploadFile(new File(['x'], 'x.txt')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 504, title: 'Der Server ist gerade nicht erreichbar' });
  });

  it('nennt eine unlesbare Antwort mit anderem Status nicht „nicht erreichbar“', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(html(500)));
    await expect(api('/risks')).rejects.toMatchObject({
      status: 500,
      title: 'Unerwartete Antwort vom Server (Status 500)',
    });
  });

  it('macht aus einem Netzwerkfehler eine deutsche Meldung', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api('/risks').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, title: 'Keine Verbindung zum Server' });
  });
});
