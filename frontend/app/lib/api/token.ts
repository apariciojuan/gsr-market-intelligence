/* GSR Market Intelligence — JWT token storage primitive.
 *
 * Kept in its own tiny module so `client.ts` can read the token without
 * importing `lib/auth` (which would create a cycle: auth → api → client → auth).
 * `lib/auth` is the public-facing API for login/logout; it uses these too.
 */

const TOKEN_KEY = "gsr_token";

/** Read the stored JWT, or null. SSR-safe (returns null on the server). */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Persist the JWT. SSR-safe no-op on the server. */
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Remove the stored JWT. SSR-safe no-op on the server. */
export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}
