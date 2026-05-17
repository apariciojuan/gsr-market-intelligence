/* /signals — Signals & Divergences list (Fase 4, task 4.9).
 *
 * Ported from web-example `SignalsScreen`. The example read a flat
 * `GSR_MOCKS.signals` array and filtered client-side; here every byte of
 * data comes from `useSignals` (React Query → api.signals.list), and the
 * filters (`divergence_type`, `min_severity`, `status`) are pushed to the
 * endpoint as query params per API_CONTRACT.md §7.
 *
 * Each card renders G12 `DivergenceMini` with the item's `mini_chart_data`.
 * loading / empty / error states are all handled. `total` may be null.
 */

import { useState } from "react";
import Link from "next/link";
import { useSignals } from "../lib/hooks/useSignals";
import { StatusPill, Icon, fmtPct, fmtRelTime } from "../lib/components";
import { DivergenceMini } from "../lib/charts";

/** Divergence-type filter chips. `value` is sent as the `divergence_type` query param. */
const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "price_gap_vs_chainlink", label: "Price Gap" },
  { value: "news_not_reflected", label: "News" },
  { value: "sudden_move_no_signal", label: "Sudden Move" },
  { value: "chainlink_move_no_market", label: "Chainlink Move" },
];

/** Status filter chips → `status` query param. */
const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

/** Maps a contract `divergence_type` to a StatusPill status key. */
function typeToPill(type) {
  if (type === "price_gap_vs_chainlink" || type === "chainlink_move_no_market")
    return "price_gap";
  if (type === "sudden_move_no_signal") return "sudden";
  return "news";
}

/** 1–5 severity meter. */
function SevMeter({ severity }) {
  return (
    <span className="sev-meter">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={"s " + (i <= severity ? "on" : "")} />
      ))}
    </span>
  );
}

export default function SignalsScreen() {
  const [type, setType] = useState("all");
  const [minSeverity, setMinSeverity] = useState(1);
  const [status, setStatus] = useState("active");

  const { data, isLoading, isError, error, refetch } = useSignals({
    divergence_type: type,
    min_severity: minSeverity,
    status,
  });

  const items = data?.items ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Signals &amp; Divergences</h1>
          <div className="page-sub">Markets out of sync with external reality</div>
        </div>
      </div>

      {/* ---- Filters ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          className="card-body"
          style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
        >
          <div className="chip-row">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                className={"chip " + (type === f.value ? "active" : "")}
                onClick={() => setType(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div className="chip-row">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                className={"chip " + (status === f.value ? "active" : "")}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Severity ≥
            </span>
            <div className="chip-row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={"chip " + (minSeverity === n ? "active" : "")}
                  onClick={() => setMinSeverity(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---- List ---- */}
      {isError ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
            <div style={{ color: "var(--danger)", fontWeight: 500, marginBottom: 6 }}>
              Couldn&apos;t load signals
            </div>
            <div
              style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}
            >
              {error?.message || "Unexpected error."}
            </div>
            <button className="btn sm" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="card">
              <div className="card-body" style={{ display: "flex", gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <div className="skel" style={{ height: 16, width: 120, marginBottom: 12 }} />
                  <div className="skel" style={{ height: 20, width: "70%", marginBottom: 14 }} />
                  <div className="skel" style={{ height: 40, width: "100%" }} />
                </div>
                <div style={{ width: 320, minWidth: 280 }}>
                  <div className="skel" style={{ height: 90, width: "100%" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 48 }}>
            <Icon name="info" size={28} color="var(--text-secondary)" />
            <div
              style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 12 }}
            >
              No signals match these filters
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Try lowering the severity threshold or switching status.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item) => {
            const d = item.divergence;
            const m = item.market;
            return (
              <div key={d.id} className="card">
                <div
                  className="card-body"
                  style={{ display: "flex", gap: 20, alignItems: "stretch" }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <StatusPill status={typeToPill(d.divergence_type)} />
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        Severity
                      </span>
                      <SevMeter severity={d.severity} />
                    </div>

                    <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>
                      {m.question}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 16,
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div className="stat-k">Polymarket implied prob</div>
                        <div className="stat-v" style={{ fontSize: 16 }}>
                          {(d.market_value * 100).toFixed(0)}%{" "}
                          <span
                            style={{
                              color:
                                d.direction === "market_below"
                                  ? "var(--danger)"
                                  : "var(--success)",
                              fontSize: 13,
                            }}
                          >
                            {d.direction === "market_below" ? "▼" : "▲"}{" "}
                            {fmtPct(d.magnitude_pct)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="stat-k">{d.external_source}</div>
                        <div className="stat-v" style={{ fontSize: 16 }}>
                          {(d.external_value * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: 11,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span>
                        Detected {fmtRelTime(new Date(d.detected_at).getTime())}{" "}
                        · Updated{" "}
                        {fmtRelTime(new Date(d.last_updated_at).getTime())}
                      </span>
                      <Link className="btn sm" href={"/signals/" + d.id}>
                        Investigate <Icon name="arrow-right" size={12} />
                      </Link>
                    </div>
                  </div>

                  <div style={{ width: 320, minWidth: 280 }}>
                    <DivergenceMini miniChart={item.mini_chart_data} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
