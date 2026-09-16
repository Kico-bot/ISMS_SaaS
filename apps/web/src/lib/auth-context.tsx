import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, setAccessToken, type Membership, type Session } from './api';

interface AuthState {
  ready: boolean;
  session: Session | null;
  permissions: Set<string>;
  personId: string | null;
  can: (permission: string) => boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  register: (dto: {
    tenantName: string;
    tenantSlug: string;
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  switchTenant: (slug: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [personId, setPersonId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const loadPermissions = useCallback(async () => {
    const me = await auth.me();
    setPermissions(new Set(me.permissions));
    setPersonId(me.personId);
  }, []);

  const apply = useCallback(
    async (s: Session) => {
      setAccessToken(s.accessToken);
      setSession(s);
      await loadPermissions();
    },
    [loadPermissions],
  );

  // Beim Laden: bestehende Sitzung über das Refresh-Cookie wiederherstellen. Genau ein
  // Aufruf — der Server rotiert das Refresh-Token dabei, ein zweiter wäre eine zweite Rotation.
  useEffect(() => {
    void (async () => {
      const restored = await auth.refresh();
      if (restored) {
        setSession(restored);
        try {
          const me = await auth.me();
          setPermissions(new Set(me.permissions));
          setPersonId(me.personId);
        } catch {
          setAccessToken(null);
        }
      }
      setReady(true);
    })();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      permissions,
      personId,
      can: (p) => permissions.has(p) || permissions.has(`${p}_own`),
      login: async (email, password, tenantSlug) => apply(await auth.login(email, password, tenantSlug)),
      register: async (dto) => apply(await auth.register(dto)),
      switchTenant: async (slug) => apply(await auth.switchTenant(slug)),
      logout: async () => {
        await auth.logout().catch(() => undefined);
        setAccessToken(null);
        setSession(null);
        setPermissions(new Set());
      },
    }),
    [ready, session, permissions, personId, apply],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth außerhalb des AuthProvider');
  return ctx;
}

export type { Membership };
