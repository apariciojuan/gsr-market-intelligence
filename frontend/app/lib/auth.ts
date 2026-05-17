/* GSR Market Intelligence — auth: login flow, token storage, useAuth().
 *
 * The switch is respected here too:
 *   - mock mode: `api.auth.login` is `mockApi.auth.login`, which validates
 *     against the fixed mock user (admin / 1234) in `lib/mocks/auth.json`
 *     and throws `ApiError("LOGIN_BAD_CREDENTIALS")` on mismatch.
 *   - api  mode: `api.auth.login` hits POST /auth/jwt/login on the backend.
 * Either way this module just calls `api.auth.*` — it never knows the source.
 *
 * Token lives in localStorage (via `lib/api/token`). `AuthProvider` exposes
 * the current user + login/logout to the React tree; `useAuth()` reads it.
 *
 * NOTE: this file is `.ts` but defines a React context/provider. It is
 * consumed from `.jsx` (`_app.jsx`, screens) — JSX here would need a `.tsx`
 * extension, so the provider is built with `React.createElement`.
 */

import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { ApiError } from "./api/error";
import { clearToken, getToken, setToken } from "./api/token";
import type { LoginRequest, UserRead } from "./api/types";

export { ApiError };

interface AuthContextValue {
  /** Current user, or null when logged out. */
  user: UserRead | null;
  /** True while the initial token check / profile fetch is in flight. */
  loading: boolean;
  /** True when a valid token + user are present. */
  isAuthenticated: boolean;
  /** Authenticate; throws `ApiError` (LOGIN_BAD_CREDENTIALS) on bad creds. */
  login: (credentials: LoginRequest) => Promise<void>;
  /** Clear the session (best-effort backend logout + local token wipe). */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Wraps the app. On mount, if a token exists it fetches `users/me` to
 * rehydrate the session; otherwise it lands logged-out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.auth
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // Token invalid/expired — drop it and stay logged out.
        clearToken();
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(credentials: LoginRequest): Promise<void> {
    // Throws ApiError on bad credentials — caller (LoginScreen) handles it.
    const res = await api.auth.login(credentials);
    setToken(res.access_token);
    const me = await api.auth.me();
    setUser(me);
  }

  async function logout(): Promise<void> {
    try {
      await api.auth.logout();
    } catch {
      // Best effort — even if the backend call fails, kill the local session.
    }
    clearToken();
    setUser(null);
  }

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
  };

  return createElement(AuthContext.Provider, { value }, children);
}

/** Access the auth session. Must be used inside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used within an <AuthProvider>.");
  }
  return ctx;
}
