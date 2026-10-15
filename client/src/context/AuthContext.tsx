import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../lib/api';
import { EDITOR_ROLES } from '../lib/constants';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** True when the signed-in user may create or edit records. */
  canEdit: boolean;
  /** True when the signed-in user is an administrator. */
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Refresh the profile after changes like a password reset. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Provides the authenticated session to the whole application. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Bumped by login so a session restore started before it cannot overwrite
  // the freshly signed-in profile when it resolves later.
  const sessionGeneration = useRef(0);

  useEffect(() => {
    // Restore the session on refresh via the httpOnly session cookie.
    authApi
      .me()
      .then((u) => {
        if (sessionGeneration.current === 0) setUser(u);
      })
      .catch(() => {
        if (sessionGeneration.current === 0) setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: profile } = await authApi.login(email, password);
    sessionGeneration.current += 1;
    setUser(profile);
    return profile;
  }, []);

  // Await the logout response before clearing the user so a login that
  // follows cannot have its new cookie deleted by a late logout response.
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Network failure: clear local state anyway; the cookie expires on its own.
    }
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await authApi.me());
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      canEdit: !!user && EDITOR_ROLES.includes(user.role),
      isAdmin: user?.role === 'administrator',
      login,
      logout,
      refresh,
    }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Accesses the auth context; throws when used outside the provider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
