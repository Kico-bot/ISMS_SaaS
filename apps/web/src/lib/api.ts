/**
 * Schmaler API-Client. Hält den Access-Token im Speicher (nicht in localStorage — XSS-Oberfläche)
 * und erneuert ihn bei 401 automatisch über das httpOnly-Refresh-Cookie.
 */
const BASE = '/api/v1';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export interface Membership {
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  roles: string[];
}

export interface Session {
  accessToken: string;
  user: { id: string; email: string; displayName: string; isPlatformAdmin: boolean };
  activeTenant: Membership | null;
  memberships: Membership[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly body?: unknown,
  ) {
    super(title);
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((l) => l());
}
export function getAccessToken(): string | null {
  return accessToken;
}
export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
}

/** Erneuert den Access-Token; parallele Aufrufe teilen sich denselben Versuch. */
async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const session = (await res.json()) as Session;
      setAccessToken(session.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && accessToken && (await tryRefresh())) res = await raw(path, init);

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const b = body as {
      title?: string;
      detail?: string;
      errors?: { path: string; message: string }[];
    } | null;
    const detail = b?.errors?.map((e) => `${e.path}: ${e.message}`).join(', ') ?? b?.detail;
    if (res.status === 401) setAccessToken(null);
    throw new ApiError(res.status, b?.title ?? `Fehler ${res.status}`, detail, body);
  }
  return body as T;
}

/**
 * Datei hochladen. Bewusst ein eigener Weg: der Content-Type muss vom Browser samt
 * Multipart-Grenze gesetzt werden, deshalb darf er hier nicht überschrieben werden.
 */
export async function uploadFile(
  file: File,
): Promise<{ id: string; filename: string; sizeBytes: number; deduplicated: boolean }> {
  const body = new FormData();
  body.append('file', file);
  const send = () =>
    fetch(`${BASE}/files`, {
      method: 'POST',
      body,
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

  let res = await send();
  if (res.status === 401 && accessToken && (await tryRefresh())) res = await send();

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const b = parsed as { title?: string; detail?: string } | null;
    if (res.status === 401) setAccessToken(null);
    throw new ApiError(res.status, b?.title ?? `Fehler ${res.status}`, b?.detail, parsed);
  }
  return parsed as { id: string; filename: string; sizeBytes: number; deduplicated: boolean };
}

/**
 * Nachweisdatei herunterladen. Ein einfacher Link genügt nicht: die Schnittstelle erwartet den
 * Access-Token im Header, den ein `<a href>` nicht mitschickt. Deshalb wird die Datei geholt
 * und als Blob an den Browser übergeben.
 */
export async function downloadFile(id: string, filename: string): Promise<void> {
  let res = await raw(`/files/${id}`);
  if (res.status === 401 && accessToken && (await tryRefresh())) res = await raw(`/files/${id}`);
  if (!res.ok) {
    if (res.status === 401) setAccessToken(null);
    throw new ApiError(res.status, 'Die Datei konnte nicht geladen werden');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const auth = {
  login: (email: string, password: string, tenantSlug?: string) =>
    api<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, tenantSlug }) }),
  register: (dto: {
    tenantName: string;
    tenantSlug: string;
    email: string;
    password: string;
    displayName: string;
  }) => api<Session>('/auth/register', { method: 'POST', body: JSON.stringify(dto) }),
  acceptInvite: (token: string, password: string) =>
    api<Session>('/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, password }) }),
  switchTenant: (tenantSlug: string) =>
    api<Session>('/auth/switch-tenant', { method: 'POST', body: JSON.stringify({ tenantSlug }) }),
  me: () =>
    api<{
      userId: string;
      tenantId: string | null;
      personId: string | null;
      permissions: string[];
      isPlatformAdmin: boolean;
    }>('/auth/me'),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  refresh: tryRefresh,
};
