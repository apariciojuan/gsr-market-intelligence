/* LoginScreen — Fase 4, task 4.1.
 *
 * Ported from `web-example/nextjs/screens/index.jsx` `LoginScreen`, but the
 * example's version was a static mockup (a plain `<a href="#/">`). This is the
 * real, wired screen:
 *   - submits through `useAuth().login()` only — never `api` / JSON, so the
 *     mock→API switch stays intact;
 *   - in mock mode the credentials are `admin` / `1234` (shown as a hint);
 *   - handles the `LOGIN_BAD_CREDENTIALS` ApiError with an inline message;
 *   - inverse route guard: if a session already exists, redirect to `/`.
 *
 * `pages/login.jsx` just renders this component.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth, ApiError } from "../lib/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { isAuthenticated, loading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Inverse guard: a logged-in user has no business on /login.
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated, router]);

  // While auth resolves, or during the redirect, render nothing.
  if (loading || isAuthenticated) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username, password });
      router.replace("/");
    } catch (err) {
      if (ApiError.is(err)) {
        // LOGIN_BAD_CREDENTIALS (or any contract error) → human message.
        setError(
          err.code === "LOGIN_BAD_CREDENTIALS"
            ? "Invalid username or password."
            : err.message || "Sign in failed. Try again."
        );
      } else {
        setError("Something went wrong. Try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="login-bg">
      <form className="login-card" onSubmit={onSubmit}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div className="brand-mark" style={{ width: 36, height: 36, fontSize: 16 }}>G</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>GSR Market Intelligence</div>
            <div className="brand-sub">Prediction markets terminal</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
          Sign in to your account.
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="login-username">Username</label>
          <input
            id="login-username"
            className="form-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            className="form-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div
            role="alert"
            style={{ color: "var(--danger)", fontSize: 12, marginBottom: 12 }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn primary btn-block lg"
          style={{ marginTop: 8 }}
          disabled={submitting || !username || !password}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          Demo (mock mode) — use{" "}
          <span className="mono" style={{ color: "var(--text-primary)" }}>admin</span>
          {" / "}
          <span className="mono" style={{ color: "var(--text-primary)" }}>1234</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textAlign: "center",
            marginTop: 10,
          }}
        >
          Contact your admin for access · v1.0.0
        </div>
      </form>
    </div>
  );
}
