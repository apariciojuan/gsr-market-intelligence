/* /resolutions/[questionId] — Resolution detail (checklist task 4.8).
 *
 * Ported from `web-example/nextjs/screens/index.jsx` (`ResolutionDetailScreen`).
 * Differences from the example:
 *   - Receives `questionId` as a prop (the page reads it from the router).
 *     The example used `slug`; the route is renamed to `[questionId]` to
 *     match `API_CONTRACT.md`.
 *   - Data comes ONLY from the `useResolution(questionId)` hook — no
 *     `GSR_MOCKS`, no JSON, no `fetch`.
 *   - Shapes follow `lib/api/types.ts` (`ResolutionDetail`): `timeline`,
 *     `current_phase`, `is_disputed`, `dispute`, `market_impact_chart`,
 *     `ancillary_data_decoded`, `uma_oracle_url`.
 *   - Star chart G10 `ResolutionTimeline` is fed the real payload.
 *   - Handles the 404 `RESOLUTION_NOT_FOUND` error plus loading / empty.
 */

import { useRouter } from "next/router";
import * as Recharts from "recharts";
import Shell from "../components/Shell";
import {
  Icon,
  StatusPill,
  AddressPill,
  fmtTime,
  fmtUSD,
  truncAddr,
} from "../lib/components";
import { ResolutionTimeline } from "../lib/charts";
import { useResolution } from "../lib/hooks/useResolutions";

// Maps the resolution `current_phase` onto a StatusPill variant.
const PHASE_TO_STATUS = {
  initialized: "pending_uma",
  proposed: "proposed",
  challenge: "proposed",
  dvm_vote: "disputed",
  resolved: "resolved",
};

const PHASE_LABEL = {
  initialized: "Initialized",
  proposed: "Proposed",
  challenge: "Challenge window",
  dvm_vote: "DVM vote",
  resolved: "Resolved",
};

// G10 sibling — small "Market Impact" area chart for `price_series_yes`.
function MarketImpactChart({ chart }) {
  const series = chart?.price_series_yes ?? [];
  if (series.length === 0) {
    return (
      <div className="card-body">
        <div className="empty">
          <Icon name="info" size={20} />
          <div className="ttl">No price data for this period</div>
        </div>
      </div>
    );
  }
  const data = series.map((p) => ({ t: p.t, v: p.v }));
  return (
    <div className="chart-body" style={{ height: 220, padding: "8px 12px 12px" }}>
      <Recharts.ResponsiveContainer width="100%" height="100%">
        <Recharts.AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
          <defs>
            <linearGradient id="g-resimpact" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F8CFF" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#4F8CFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Recharts.CartesianGrid stroke="#1C2030" vertical={false} />
          <Recharts.XAxis
            dataKey="t"
            stroke="#5A6178"
            tick={{ fontSize: 11, fill: "#8A92A6" }}
            tickFormatter={(t) => fmtTime(t).slice(11, 16)}
            minTickGap={32}
          />
          <Recharts.YAxis
            stroke="#5A6178"
            tick={{ fontSize: 11, fill: "#8A92A6" }}
            domain={[0, 1]}
            width={36}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Recharts.Tooltip
            contentStyle={{
              background: "#13161F",
              border: "1px solid #1C2030",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(t) => fmtTime(t)}
            formatter={(v) => [(v * 100).toFixed(1) + "%", "YES price"]}
          />
          <Recharts.Area
            type="monotone"
            dataKey="v"
            stroke="#4F8CFF"
            strokeWidth={1.8}
            fill="url(#g-resimpact)"
            dot={false}
            isAnimationActive={false}
          />
        </Recharts.AreaChart>
      </Recharts.ResponsiveContainer>
    </div>
  );
}

export default function ResolutionDetailScreen({ questionId }) {
  const router = useRouter();
  const query = useResolution(questionId);

  const detail = query.data;

  // --- Loading ---
  if (!questionId || query.isLoading) {
    return (
      <Shell>
        <a href="/resolutions" className="back-link">
          <Icon name="arrow-left" size={12} /> Resolutions
        </a>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <div className="empty">
              <Icon name="clock" size={20} />
              <div className="ttl">Loading resolution…</div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Error (incl. 404 RESOLUTION_NOT_FOUND) ---
  if (query.isError) {
    const err = query.error;
    const notFound = err && err.code === "RESOLUTION_NOT_FOUND";
    return (
      <Shell>
        <a href="/resolutions" className="back-link">
          <Icon name="arrow-left" size={12} /> Resolutions
        </a>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <div className="empty">
              <Icon name={notFound ? "search" : "alert"} size={20} />
              <div className="ttl">
                {notFound
                  ? "Resolution not found"
                  : "Couldn’t load this resolution"}
              </div>
              <div className="sub">
                {notFound
                  ? "No resolution cycle exists for this question ID."
                  : err?.message || "Please try again."}
              </div>
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => router.push("/resolutions")}
              >
                Back to Resolutions
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Empty (query resolved but no payload) ---
  if (!detail) {
    return (
      <Shell>
        <a href="/resolutions" className="back-link">
          <Icon name="arrow-left" size={12} /> Resolutions
        </a>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <div className="empty">
              <Icon name="info" size={20} />
              <div className="ttl">Nothing to show</div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const market = detail.market;
  const dispute = detail.dispute;
  const proposedEntry = detail.timeline.find((t) => t.phase === "proposed");
  const proposedAt = proposedEntry?.timestamp;

  return (
    <Shell>
      <a href="/resolutions" className="back-link">
        <Icon name="arrow-left" size={12} /> Resolutions
      </a>

      <div
        className="page-header"
        style={{ marginTop: 8, alignItems: "flex-start" }}
      >
        <div>
          <StatusPill
            status={PHASE_TO_STATUS[detail.current_phase] || "pending_uma"}
          />
          <h1 className="detail-title">
            {market ? market.question : "Resolution"}
          </h1>
          <div className="meta-row">
            <span className="mono">QID {truncAddr(detail.question_id, 6)}</span>
            <span className="sep">·</span>
            <span>
              Proposed{" "}
              <b className="mono" style={{ color: "var(--text-primary)" }}>
                {proposedAt ? fmtTime(proposedAt) : "—"}
              </b>
            </span>
            <span className="sep">·</span>
            <span>
              Phase{" "}
              <b style={{ color: "var(--warning)" }}>
                {PHASE_LABEL[detail.current_phase] || detail.current_phase}
              </b>
            </span>
            {detail.is_disputed && (
              <>
                <span className="sep">·</span>
                <b style={{ color: "var(--danger)" }}>Disputed</b>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {market && (
            <button
              className="btn"
              onClick={() => router.push("/markets/" + market.slug)}
            >
              <Icon name="trending-up" size={14} /> View market
            </button>
          )}
          <a
            className="btn primary"
            href={detail.uma_oracle_url}
            target="_blank"
            rel="noreferrer"
          >
            View on UMA <Icon name="external-link" size={14} />
          </a>
        </div>
      </div>

      {/* G10 — Resolution Timeline (the star chart) */}
      <ResolutionTimeline detail={detail} />

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        {/* Question & rules */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Question &amp; Rules</h3>
          </div>
          <div
            className="card-body"
            style={{
              color: "var(--text-secondary)",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <p style={{ margin: 0 }}>{detail.ancillary_data_decoded}</p>
            {market?.description && (
              <p style={{ marginTop: 10 }}>{market.description}</p>
            )}
          </div>
        </div>

        {/* Dispute panel */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Dispute</h3>
          </div>
          <div className="card-body">
            {dispute ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span className="stat-k">Disputer</span>
                  <AddressPill address={dispute.disputer_address} />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span className="stat-k">Counter bond</span>
                  <span className="mono">
                    {fmtUSD(dispute.counter_bond_usd)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span className="stat-k">Disputed at</span>
                  <span className="mono">{fmtTime(dispute.disputed_at)}</span>
                </div>
                {dispute.reason && (
                  <div style={{ fontSize: 13 }}>
                    <div className="stat-k" style={{ marginBottom: 4 }}>
                      Reason
                    </div>
                    <div style={{ color: "var(--text-secondary)" }}>
                      {dispute.reason}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty">
                <Icon name="check-circle" size={20} />
                <div className="ttl">No dispute</div>
                <div className="sub">
                  This resolution has not been challenged.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Market impact */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Market Impact</h3>
          <div className="card-sub">YES price around the resolution window</div>
        </div>
        <MarketImpactChart chart={detail.market_impact_chart} />
      </div>
    </Shell>
  );
}
