/* SettingsScreen — Fase 4, task 4.12.
 *
 * Ported from `web-example/nextjs/screens/index.jsx` `SettingsScreen`. The
 * example's Profile tab had hardcoded `defaultValue`s; this version reads the
 * real profile through `useUser()` → `api.auth.me()` → GET /users/me. It never
 * touches JSON or fetch directly — the mock/http switch stays intact.
 *
 * The Profile fields are read-only: API_CONTRACT.md exposes no profile-update
 * endpoint, so there is nothing to save. The API / Preferences tabs are
 * presentation-only (no backing endpoint in the contract) and stay static.
 *
 * Profile tab has the three required states: loading (skeleton), error
 * (message + retry), and a populated form.
 */

import { useState } from "react";
import { Icon, fmtDay } from "../lib/components";
import { useUser } from "../lib/hooks";

function Field({ label, value, mono = false }) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <input className={"form-input" + (mono ? " mono" : "")} value={value ?? ""} readOnly />
    </div>
  );
}

function ProfileTab() {
  const { data: user, isLoading, isError, error, refetch } = useUser();

  if (isLoading) {
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div className="form-field" key={i}>
            <div className="skel" style={{ height: 12, width: 90, marginBottom: 6 }} />
            <div className="skel" style={{ height: 38, width: "100%" }} />
          </div>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 10,
          padding: "8px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--danger)", fontSize: 13 }}>
          <Icon name="alert" size={16} color="var(--danger)" />
          {(error && error.message) || "Failed to load your profile."}
        </div>
        <button className="btn sm" onClick={() => refetch()}>
          <Icon name="refresh" size={12} /> Retry
        </button>
      </div>
    );
  }

  // Success but somehow no body — treat as empty.
  if (!user) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "8px 0" }}>
        No profile data available.
      </div>
    );
  }

  return (
    <>
      <Field label="Email" value={user.email} mono />
      <Field label="Display name" value={user.display_name} />
      <Field label="User ID" value={user.id} mono />
      <Field label="Member since" value={fmtDay(user.created_at)} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2, marginBottom: 8 }}>
        <span className={"pill " + (user.is_active ? "success" : "neutral")}>
          <span className="dot" />
          {user.is_active ? "Active" : "Inactive"}
        </span>
        {user.is_superuser && (
          <span className="pill info">
            <span className="dot" />
            Superuser
          </span>
        )}
        <span className={"pill " + (user.is_verified ? "success" : "warning")}>
          <span className="dot" />
          {user.is_verified ? "Verified" : "Unverified"}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        Profile details are managed by your administrator.
      </div>
    </>
  );
}

function ApiTab() {
  return (
    <>
      <div className="form-field">
        <label className="form-label">Personal API Key</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="form-input mono"
            style={{ flex: 1 }}
            readOnly
            value="gsr_sk_live_82HGT4kQ•••••••••••••••••••MR3z"
          />
          <button className="btn">
            <Icon name="refresh" size={14} /> Regenerate
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
        Use this key to authenticate against{" "}
        <span className="mono">https://api.gsr-mi.io/v1</span>. Keep it secret.
      </div>
    </>
  );
}

function PrefsTab() {
  return (
    <>
      <div className="form-field">
        <label className="form-label">Theme</label>
        <div className="chip-row">
          <button className="chip active">
            <Icon name="moon" size={12} /> Dark
          </button>
          <button className="chip">Light</button>
          <button className="chip">Auto</button>
        </div>
      </div>
      <div className="form-field">
        <label className="form-label">Timezone</label>
        <input className="form-input" defaultValue="UTC" />
      </div>
      <div className="form-field">
        <label className="form-label">Language</label>
        <input className="form-input" defaultValue="English (US)" />
      </div>
    </>
  );
}

export default function SettingsScreen() {
  const [tab, setTab] = useState("profile");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Account &amp; preferences</div>
        </div>
      </div>
      <div className="card">
        <div className="tabbar">
          {[
            { id: "profile", label: "Profile" },
            { id: "api", label: "API" },
            { id: "prefs", label: "Preferences" },
          ].map((t) => (
            <button
              key={t.id}
              className={"tab " + (tab === t.id ? "active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="card-body" style={{ maxWidth: 600 }}>
          {tab === "profile" && <ProfileTab />}
          {tab === "api" && <ApiTab />}
          {tab === "prefs" && <PrefsTab />}
        </div>
      </div>
    </div>
  );
}
