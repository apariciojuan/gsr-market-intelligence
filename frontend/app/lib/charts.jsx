/* GSR Market Intelligence — chart components (G3..G18) using Recharts.
 *
 * Ported from `web-example/nextjs/lib/charts.jsx`. Differences from the example:
 *   - `Recharts` is imported locally (the example relied on a global).
 *   - **The `GSR_MOCKS` global is gone.** Every chart now receives its data
 *     through typed props (shapes from `lib/api/types.ts`). No chart reads a
 *     JSON file, a global, or calls `fetch`. This is the core Phase 3 refactor:
 *     the data layer (api + hooks) feeds these charts; they stay dumb.
 *   - Each chart accepts `loading` and `empty` props and renders the
 *     skeleton-shimmer / "No data for this period" states inside its own
 *     chart body, per CHART_CATALOG.md "Estados" conventions.
 *
 * G1/G2 (sparklines) live in `components.jsx` as `KpiCard` spark + `MiniSpark`.
 *
 * @typedef {import("./api/types").PriceHistory} PriceHistory
 * @typedef {import("./api/types").VolumePoint} VolumePoint
 * @typedef {import("./api/types").PriceMarker} PriceMarker
 * @typedef {import("./api/types").Orderbook} Orderbook
 * @typedef {import("./api/types").Holder} Holder
 * @typedef {import("./api/types").ContractActivityBucket} ContractActivityBucket
 * @typedef {import("./api/types").ResolutionDetail} ResolutionDetail
 * @typedef {import("./api/types").BondHistogramBucket} BondHistogramBucket
 * @typedef {import("./api/types").SignalMiniChart} SignalMiniChart
 * @typedef {import("./api/types").SignalDetail} SignalDetail
 * @typedef {import("./api/types").EcoVolumeBucket} EcoVolumeBucket
 * @typedef {import("./api/types").EcoActiveMarketsBucket} EcoActiveMarketsBucket
 * @typedef {import("./api/types").EcoCategory} EcoCategory
 * @typedef {import("./api/types").Calibration} Calibration
 * @typedef {import("./api/types").ActivityHeatmapCell} ActivityHeatmapCell
 * @typedef {import("./api/types").PriceInterval} PriceInterval
 */

import React, { useState } from "react";
import * as Recharts from "recharts";
import {
  ChartContainer,
  Icon,
  fmtUSD,
  fmtNum,
  fmtTime,
  fmtDay,
  truncAddr,
  fmtCountdown,
} from "./components";

const R = Recharts;

// ----- Category presentation map (UI only — color/label, not a data shape) ---
const CATEGORY_STYLES = {
  politics: { name: "Politics", color: "#A855F7" },
  crypto: { name: "Crypto", color: "#F59E0B" },
  sports: { name: "Sports", color: "#22C55E" },
  economics: { name: "Economics", color: "#06B6D4" },
  pop: { name: "Pop Culture", color: "#EC4899" },
  "pop-culture": { name: "Pop Culture", color: "#EC4899" },
  science: { name: "Science", color: "#14B8A6" },
};
function catColor(cat) {
  return (CATEGORY_STYLES[cat] || { color: "#4F8CFF" }).color;
}

// =============================================================
// Shared state helpers — loading skeleton + empty placeholder.
// Every chart renders these *inside* its own body so the toolbar/title
// stay visible while data loads (CHART_CATALOG.md "Estados").
// =============================================================

/** Shimmer skeleton sized to the chart body. */
export function ChartSkeleton({ height = 280 }) {
  return (
    <div
      className="skel"
      style={{ width: "100%", height }}
      role="presentation"
      aria-hidden="true"
    />
  );
}

/** Centered "No data for this period" placeholder. */
export function ChartEmpty({ height = 280, message = "No data for this period" }) {
  return (
    <div
      style={{
        width: "100%",
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--text-muted)",
      }}
    >
      <Icon name="info" size={22} />
      <div style={{ fontSize: 13 }}>{message}</div>
    </div>
  );
}

/**
 * Resolve which body to render for a chart: skeleton, empty, or the real
 * children. `isEmpty` lets a caller pass an explicit emptiness test; by
 * default a falsy `empty` prop means "render children".
 */
function chartBody({ loading, empty, height, children }) {
  if (loading) return <ChartSkeleton height={height} />;
  if (empty) return <ChartEmpty height={height} />;
  return children;
}

// ----- Tooltip factory (shared by all time-series charts) -----
export function customTooltip(formatRows) {
  return function CT({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const ts = payload[0].payload.t;
    return (
      <div className="custom-tooltip">
        {ts && <div className="tt-time">{fmtTime(ts)}</div>}
        {formatRows(payload, label).map((r, i) => (
          <div className="tt-row" key={i}>
            <span className="lbl">
              {r.dot && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 50,
                    background: r.dot,
                    display: "inline-block",
                  }}
                />
              )}
              {r.label}
            </span>
            <span className="val">{r.value}</span>
          </div>
        ))}
      </div>
    );
  };
}

// =============================================================
// G3 / G4 — Price History (Yes / No + optional Chainlink overlay)
// =============================================================
/**
 * @param {object} props
 * @param {PriceHistory=} props.priceHistory  GET /markets/{id}/prices payload
 * @param {PriceInterval} props.interval      currently selected interval
 * @param {(iv: PriceInterval) => void=} props.onInterval
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function PriceChart({ priceHistory, interval, onInterval, loading = false, empty = false }) {
  const ph = priceHistory;
  const seriesYes = ph?.series_yes ?? [];
  const seriesNo = ph?.series_no ?? [];
  const overlay = ph?.chainlink_overlay ?? null;
  const markers = ph?.markers ?? [];
  const stats = ph?.stats ?? null;

  const isEmpty = empty || (!loading && seriesYes.length === 0);
  const hasChainlink = !!overlay && overlay.series.length > 0;
  const [seriesOn, setSeriesOn] = useState({ yes: true, no: true, cl: false });

  // Join the parallel series on timestamp index.
  const clByT = {};
  if (overlay) overlay.series.forEach((p) => { clByT[p.t] = p.v; });
  const data = seriesYes.map((p, i) => ({
    t: p.t,
    yes: p.v,
    no: seriesNo[i]?.v ?? null,
    cl: clByT[p.t] ?? null,
  }));

  const showCl = seriesOn.cl && hasChainlink;

  return (
    <ChartContainer
      title="Price History"
      subtitle="YES / NO implied probability"
      intervals={["1h", "4h", "1d", "1w", "max"]}
      currentInterval={interval}
      onInterval={onInterval}
      legend={
        <div className="legend-group">
          <button
            className={"legend-toggle " + (seriesOn.yes ? "active" : "dim")}
            onClick={() => setSeriesOn((s) => ({ ...s, yes: !s.yes }))}
          >
            <span className="dot" style={{ background: "#22C55E" }} />
            Yes
          </button>
          <button
            className={"legend-toggle " + (seriesOn.no ? "active" : "dim")}
            onClick={() => setSeriesOn((s) => ({ ...s, no: !s.no }))}
          >
            <span className="dot" style={{ background: "#EF4444" }} />
            No
          </button>
          {hasChainlink && (
            <button
              className={"legend-toggle " + (seriesOn.cl ? "active" : "dim")}
              onClick={() => setSeriesOn((s) => ({ ...s, cl: !s.cl }))}
            >
              <span className="dot" style={{ background: "#06B6D4" }} />
              Chainlink
            </button>
          )}
        </div>
      }
      footer={
        stats && !loading && !isEmpty ? (
          <>
            <div>Min<b className="mono">{stats.min_yes.toFixed(2)}</b></div>
            <div>Max<b className="mono">{stats.max_yes.toFixed(2)}</b></div>
            <div>Avg<b className="mono">{stats.avg_yes.toFixed(2)}</b></div>
            <div>Volume<b className="mono">{fmtUSD(stats.total_volume_usd)}</b></div>
          </>
        ) : null
      }
    >
      {chartBody({
        loading,
        empty: isEmpty,
        height: 380,
        children: (
          <div style={{ width: "100%", height: 380 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 20 }}>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false} />
                <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} minTickGap={40} />
                <R.YAxis yAxisId="prob" domain={[0, 1]} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={(v) => v.toFixed(2)} width={42} />
                {showCl && <R.YAxis yAxisId="cl" orientation="right" stroke="#06B6D4" tick={{ fontSize: 11, fill: "#06B6D4" }} width={56} tickFormatter={fmtUSD} />}
                <R.Tooltip
                  content={customTooltip((p) => [
                    ...(seriesOn.yes ? [{ label: "YES", value: p.find((x) => x.dataKey === "yes")?.value?.toFixed(4), dot: "#22C55E" }] : []),
                    ...(seriesOn.no ? [{ label: "NO", value: p.find((x) => x.dataKey === "no")?.value?.toFixed(4), dot: "#EF4444" }] : []),
                    ...(showCl ? [{ label: "Chainlink", value: fmtUSD(p.find((x) => x.dataKey === "cl")?.value), dot: "#06B6D4" }] : []),
                  ])}
                  cursor={{ stroke: "#353B4D", strokeDasharray: "3 3" }}
                />
                {seriesOn.yes && <R.Line yAxisId="prob" type="monotone" dataKey="yes" stroke="#22C55E" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />}
                {seriesOn.no && <R.Line yAxisId="prob" type="monotone" dataKey="no" stroke="#EF4444" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />}
                {showCl && <R.Line yAxisId="cl" type="monotone" dataKey="cl" stroke="#06B6D4" strokeWidth={1.4} strokeOpacity={0.7} dot={false} isAnimationActive={false} connectNulls />}
                {markers.map((m, i) => (
                  <R.ReferenceDot
                    key={i}
                    yAxisId="prob"
                    x={m.t}
                    y={0.5}
                    r={5}
                    fill={m.type === "news" ? "#F59E0B" : "#A855F7"}
                    stroke="none"
                  >
                    <R.Label position="top" fill={m.type === "news" ? "#F59E0B" : "#A855F7"} fontSize={10}>
                      {m.type === "news" ? "📰" : "⚖"}
                    </R.Label>
                  </R.ReferenceDot>
                ))}
              </R.LineChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G5 — Volume bars (shares the X axis with G3, shown below it)
// =============================================================
/**
 * @param {object} props
 * @param {VolumePoint[]=} props.volumeSeries  PriceHistory.volume_series
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function VolumeBars({ volumeSeries, loading = false, empty = false }) {
  const series = volumeSeries ?? [];
  const isEmpty = empty || (!loading && series.length === 0);
  const data = series.map((p) => ({ t: p.t, vol: p.v, dir: p.direction }));

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="chart-toolbar">
        <div>
          <h3>Volume</h3>
          <div className="sub">Trading volume per interval</div>
        </div>
      </div>
      <div className="chart-body" style={{ height: 120 }}>
        {chartBody({
          loading,
          empty: isEmpty,
          height: 120,
          children: (
            <R.ResponsiveContainer width="100%" height="100%">
              <R.BarChart data={data} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
                <R.XAxis dataKey="t" hide />
                <R.YAxis tick={{ fontSize: 10, fill: "#8A92A6" }} stroke="#5A6178" width={42} tickFormatter={(v) => fmtUSD(v)} />
                <R.Tooltip content={customTooltip((p) => [{ label: "Volume", value: fmtUSD(p[0].value), dot: "#4F8CFF" }])} cursor={{ fill: "#1C2030" }} />
                <R.Bar dataKey="vol">
                  {data.map((d, i) => (
                    <R.Cell key={i} fill={d.dir === "up" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"} />
                  ))}
                </R.Bar>
              </R.BarChart>
            </R.ResponsiveContainer>
          ),
        })}
      </div>
    </div>
  );
}

// =============================================================
// G6 — Orderbook depth (step area, bids vs asks)
// =============================================================
/**
 * @param {object} props
 * @param {Orderbook=} props.orderbook  GET /markets/{id}/orderbook payload
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function OrderbookDepth({ orderbook, loading = false, empty = false }) {
  const ob = orderbook;
  const bids = ob?.bids ?? [];
  const asks = ob?.asks ?? [];
  const mid = ob?.midpoint ?? 0.5;
  const isEmpty = empty || (!loading && bids.length === 0 && asks.length === 0);

  const data = [
    ...bids.map((b) => ({ price: b.price, bid: b.cumulative_size, ask: null })),
    { price: mid, bid: null, ask: null },
    ...asks.map((a) => ({ price: a.price, bid: null, ask: a.cumulative_size })),
  ];

  return (
    <div className="card chart-container">
      <div className="chart-toolbar">
        <div>
          <h3>Orderbook Depth</h3>
          <div className="sub">
            Bids vs Asks • Midpoint <span className="mono">{mid.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className="chart-body" style={{ height: 300 }}>
        {chartBody({
          loading,
          empty: isEmpty,
          height: 300,
          children: (
            <R.ResponsiveContainer width="100%" height="100%">
              <R.AreaChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 20 }}>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" />
                <R.XAxis dataKey="price" type="number" domain={[0, 1]} tickFormatter={(v) => v.toFixed(2)} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} />
                <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} width={50} tickFormatter={fmtNum} />
                <R.Tooltip
                  content={customTooltip((p) =>
                    p.map((x) => ({
                      label: x.dataKey === "bid" ? "Bid size" : "Ask size",
                      value: fmtNum(x.value),
                      dot: x.dataKey === "bid" ? "#22C55E" : "#EF4444",
                    }))
                  )}
                />
                <R.Area type="step" dataKey="bid" stroke="#22C55E" fill="rgba(34,197,94,0.20)" strokeWidth={1.5} isAnimationActive={false} />
                <R.Area type="step" dataKey="ask" stroke="#EF4444" fill="rgba(239,68,68,0.20)" strokeWidth={1.5} isAnimationActive={false} />
                <R.ReferenceLine x={mid} stroke="#8A92A6" strokeDasharray="3 3" label={{ value: "Mid " + mid.toFixed(2), fill: "#E6E9F0", fontSize: 11, position: "top" }} />
              </R.AreaChart>
            </R.ResponsiveContainer>
          ),
        })}
      </div>
    </div>
  );
}

// =============================================================
// G7 — Top Holders bar (compact list, or full horizontal bar chart)
// =============================================================
/**
 * @param {object} props
 * @param {Holder[]=} props.holders  GET /markets/{id}/holders items
 * @param {boolean=} props.compact   sidebar variant (top 5, plain rows)
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function HoldersBar({ holders, compact = false, loading = false, empty = false }) {
  const list = holders ?? [];
  const isEmpty = empty || (!loading && list.length === 0);
  const height = compact ? 5 * 28 + 16 : Math.max(120, list.length * 28 + 60);

  if (loading) return <ChartSkeleton height={height} />;
  if (isEmpty) return <ChartEmpty height={height} />;

  const data = list.slice(0, compact ? 5 : 20).map((h) => ({
    name: h.address_label || truncAddr(h.address),
    value: h.value_usd,
    side: h.side,
    address: h.address,
  }));
  const max = Math.max(...data.map((d) => d.value), 1);

  if (compact) {
    return (
      <div>
        {data.map((h, i) => (
          <div className="holder-row" key={i}>
            <span style={{ width: 14, color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
              #{i + 1}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, width: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
              {h.name}
            </span>
            <div className="holder-bar-wrap">
              <div
                className="holder-bar-fill"
                style={{ width: (h.value / max) * 100 + "%", background: h.side === "yes" ? "#22C55E" : "#EF4444" }}
              />
            </div>
            <span className="mono" style={{ fontSize: 11, width: 56, textAlign: "right" }}>
              {fmtUSD(h.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ height: data.length * 28 + 60 }}>
      <R.ResponsiveContainer width="100%" height="100%">
        <R.BarChart data={data} layout="vertical" margin={{ top: 10, right: 40, bottom: 10, left: 10 }}>
          <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" />
          <R.XAxis type="number" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtUSD} />
          <R.YAxis type="category" dataKey="name" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6", fontFamily: "IBM Plex Mono" }} width={140} />
          <R.Tooltip
            content={customTooltip((p) => [
              { label: p[0].payload.side.toUpperCase(), value: fmtUSD(p[0].value), dot: p[0].payload.side === "yes" ? "#22C55E" : "#EF4444" },
            ])}
            cursor={{ fill: "#1C2030" }}
          />
          <R.Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <R.Cell key={i} fill={d.side === "yes" ? "#22C55E" : "#EF4444"} />
            ))}
          </R.Bar>
        </R.BarChart>
      </R.ResponsiveContainer>
    </div>
  );
}

// =============================================================
// G8 — Contract Activity (area: transactions per bucket)
// =============================================================
/**
 * @param {object} props
 * @param {ContractActivityBucket[]=} props.buckets  ContractActivity.buckets
 * @param {string=} props.interval
 * @param {(iv: string) => void=} props.onInterval
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function ContractActivity({ buckets, interval = "1d", onInterval, loading = false, empty = false }) {
  const data = (buckets ?? []).map((b) => ({
    t: b.t,
    tx: b.tx_count,
    unique: b.unique_senders,
    vol: b.volume_usd,
  }));
  const isEmpty = empty || (!loading && data.length === 0);

  return (
    <ChartContainer
      title="Contract Activity"
      subtitle="Transactions per day"
      intervals={["1h", "1d", "1w", "1m"]}
      currentInterval={interval}
      onInterval={onInterval}
    >
      {chartBody({
        loading,
        empty: isEmpty,
        height: 280,
        children: (
          <div style={{ height: 280 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.AreaChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="g-act" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4F8CFF" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#4F8CFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false} />
                <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} />
                <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtNum} width={56} />
                <R.Tooltip
                  content={customTooltip((p) => [
                    { label: "Transactions", value: fmtNum(p[0].payload.tx), dot: "#4F8CFF" },
                    { label: "Unique wallets", value: fmtNum(p[0].payload.unique), dot: "#06B6D4" },
                    { label: "Volume", value: fmtUSD(p[0].payload.vol), dot: "#22C55E" },
                  ])}
                />
                <R.Area type="monotone" dataKey="tx" stroke="#4F8CFF" strokeWidth={1.6} fill="url(#g-act)" isAnimationActive={false} />
              </R.AreaChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G9 — Unique wallets per day (bar chart)
// =============================================================
/**
 * @param {object} props
 * @param {ContractActivityBucket[]=} props.buckets  ContractActivity.buckets
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function WalletsDaily({ buckets, loading = false, empty = false }) {
  const data = (buckets ?? []).map((b) => ({ t: b.t, unique: b.unique_senders }));
  const isEmpty = empty || (!loading && data.length === 0);

  return (
    <ChartContainer title="Unique Wallets" subtitle="Daily distinct addresses">
      {chartBody({
        loading,
        empty: isEmpty,
        height: 220,
        children: (
          <div style={{ height: 220 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.BarChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false} />
                <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} />
                <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtNum} width={56} />
                <R.Tooltip content={customTooltip((p) => [{ label: "Wallets", value: fmtNum(p[0].value), dot: "#06B6D4" }])} cursor={{ fill: "#1C2030" }} />
                <R.Bar dataKey="unique" fill="#06B6D4" radius={[2, 2, 0, 0]} />
              </R.BarChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G10 — Resolution Timeline (custom SVG-ish timeline)
// =============================================================
const PHASE_TITLES = {
  initialized: "Created",
  proposed: "Proposed",
  challenge: "Challenge",
  dvm_vote: "DVM Vote",
  resolved: "Resolved",
};

/**
 * @param {object} props
 * @param {ResolutionDetail=} props.detail  GET /resolutions/{questionId} payload
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function ResolutionTimeline({ detail, loading = false, empty = false }) {
  const timeline = detail?.timeline ?? [];
  const isEmpty = empty || (!loading && timeline.length === 0);
  const [expanded, setExpanded] = useState(null);

  const stateClass = (n) => {
    if (n.phase === "challenge" && !n.completed) return "active";
    if (detail?.is_disputed && n.phase === "challenge") return "disputed";
    if (n.completed) return "done";
    return "";
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">Resolution Cycle</h3>
          <div className="card-sub">UMA Optimistic Oracle V2 — phases</div>
        </div>
        <a
          className="btn sm"
          href={detail?.uma_oracle_url || "https://oracle.uma.xyz"}
          target="_blank"
          rel="noreferrer"
        >
          View on UMA <Icon name="external-link" size={12} />
        </a>
      </div>
      {loading ? (
        <ChartSkeleton height={220} />
      ) : isEmpty ? (
        <ChartEmpty height={220} />
      ) : (
        <div className="tl-wrap">
          <div className="tl-line" />
          <div className="tl-nodes">
            {timeline.map((n, i) => {
              const data = n.data || {};
              return (
                <div className="tl-node" key={i}>
                  <div className="phase">{PHASE_TITLES[n.phase] || n.phase}</div>
                  <button
                    className={"tl-circle " + stateClass(n)}
                    onClick={() => setExpanded(expanded === n.phase ? null : n.phase)}
                    aria-label={PHASE_TITLES[n.phase] || n.phase}
                  />
                  <div className="tl-time">{n.timestamp ? fmtTime(n.timestamp) : "—"}</div>
                  {expanded === n.phase && (
                    <div className="tl-card">
                      {n.phase === "initialized" && (
                        <div className="row">
                          <span className="k">Reward</span>
                          <span className="v">{data.reward_usd != null ? "$" + data.reward_usd : "Created"}</span>
                        </div>
                      )}
                      {n.phase === "proposed" && (
                        <>
                          <div className="row">
                            <span className="k">Proposer</span>
                            <span className="v">{data.proposer ? truncAddr(data.proposer) : "—"}</span>
                          </div>
                          <div className="row">
                            <span className="k">Bond</span>
                            <span className="v">{data.bond_usd != null ? "$" + data.bond_usd : "—"}</span>
                          </div>
                          <div className="row">
                            <span className="k">Outcome</span>
                            <span className="v">{data.outcome ?? "—"}</span>
                          </div>
                        </>
                      )}
                      {n.phase === "challenge" && (
                        <>
                          <div className="row">
                            <span className="k">Window</span>
                            <span className="v">
                              {data.seconds_remaining != null
                                ? fmtCountdown(data.seconds_remaining * 1000)
                                : "—"}
                            </span>
                          </div>
                          <div className="row">
                            <span className="k">Status</span>
                            <span className="v" style={{ color: "var(--info)" }}>
                              {n.completed ? "Closed" : "In progress"}
                            </span>
                          </div>
                        </>
                      )}
                      {n.phase === "dvm_vote" && (
                        <div className="row">
                          <span className="k">Status</span>
                          <span className="v">{n.completed ? "Voted" : "Awaiting dispute"}</span>
                        </div>
                      )}
                      {n.phase === "resolved" && (
                        <div className="row">
                          <span className="k">Status</span>
                          <span className="v">{n.completed ? "Resolved" : "Pending"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// G11 — Bond Distribution (histogram)
// =============================================================
/**
 * @param {object} props
 * @param {BondHistogramBucket[]=} props.histogram  ResolutionStats.bond_histogram
 * @param {string=} props.windowLabel
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function BondHistogram({ histogram, windowLabel = "Last 30d", loading = false, empty = false }) {
  const data = (histogram ?? []).map((b) => ({ bucket: b.bucket, count: b.count }));
  const isEmpty = empty || (!loading && data.length === 0);

  return (
    <div className="card">
      <div className="chart-toolbar">
        <div>
          <h3>Bond Distribution</h3>
          <div className="sub">{windowLabel}</div>
        </div>
      </div>
      <div className="chart-body" style={{ height: 120 }}>
        {chartBody({
          loading,
          empty: isEmpty,
          height: 120,
          children: (
            <R.ResponsiveContainer width="100%" height="100%">
              <R.BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 6 }}>
                <R.XAxis dataKey="bucket" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} />
                <R.YAxis hide />
                <R.Tooltip content={customTooltip((p) => [{ label: "Resolutions", value: fmtNum(p[0].value), dot: "#4F8CFF" }])} cursor={{ fill: "#1C2030" }} />
                <R.Bar dataKey="count" fill="#4F8CFF" radius={[3, 3, 0, 0]} />
              </R.BarChart>
            </R.ResponsiveContainer>
          ),
        })}
      </div>
    </div>
  );
}

// =============================================================
// G12 — Divergence Mini Chart (dual line, signal cards)
// =============================================================
/**
 * @param {object} props
 * @param {SignalMiniChart=} props.miniChart  SignalListItem.mini_chart_data
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function DivergenceMini({ miniChart, loading = false, empty = false }) {
  const marketSeries = miniChart?.market_series ?? [];
  const externalSeries = miniChart?.external_series ?? [];
  const isEmpty = empty || (!loading && marketSeries.length === 0);

  if (loading) return <ChartSkeleton height={90} />;
  if (isEmpty) return <ChartEmpty height={90} />;

  const data = marketSeries.map((m, i) => ({
    t: m.t,
    market: m.v,
    external: externalSeries[i]?.v ?? null,
  }));

  return (
    <div style={{ height: 90 }}>
      <R.ResponsiveContainer width="100%" height="100%">
        <R.AreaChart data={data} margin={{ top: 2, right: 6, left: 6, bottom: 2 }}>
          <defs>
            <linearGradient id="g-div" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <R.XAxis dataKey="t" hide />
          <R.YAxis domain={[0, 1]} hide />
          <R.Tooltip
            content={customTooltip((p) => [
              { label: "Market", value: p.find((x) => x.dataKey === "market")?.value?.toFixed(3), dot: "#4F8CFF" },
              { label: "External", value: p.find((x) => x.dataKey === "external")?.value?.toFixed(3), dot: "#06B6D4" },
            ])}
          />
          <R.Area type="monotone" dataKey="external" stroke="#06B6D4" strokeWidth={1.4} fill="url(#g-div)" isAnimationActive={false} connectNulls />
          <R.Line type="monotone" dataKey="market" stroke="#4F8CFF" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
        </R.AreaChart>
      </R.ResponsiveContainer>
    </div>
  );
}

// =============================================================
// G13 — Market vs Chainlink (dual axis line, signal detail)
// =============================================================
/**
 * @param {object} props
 * @param {import("./api/types").PriceSeries=} props.marketSeries     SignalDetail.market_series
 * @param {import("./api/types").PriceSeries=} props.externalSeries   SignalDetail.external_series
 * @param {SignalDetail["detection_point"]=} props.detectionPoint
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function MarketVsChainlink({ marketSeries, externalSeries, detectionPoint, loading = false, empty = false }) {
  const ms = marketSeries ?? [];
  const es = externalSeries ?? [];
  const isEmpty = empty || (!loading && ms.length === 0);

  const data = ms.map((m, i) => ({ t: m.t, market: m.v, cl: es[i]?.v ?? null }));

  return (
    <ChartContainer title="Market vs Chainlink" subtitle="Implied probability vs oracle price">
      {chartBody({
        loading,
        empty: isEmpty,
        height: 360,
        children: (
          <div style={{ height: 360 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false} />
                <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} />
                <R.YAxis yAxisId="l" domain={[0, 1]} stroke="#4F8CFF" tick={{ fontSize: 11, fill: "#4F8CFF" }} width={42} />
                <R.YAxis yAxisId="r" orientation="right" stroke="#06B6D4" tick={{ fontSize: 11, fill: "#06B6D4" }} width={60} tickFormatter={(v) => v.toFixed(2)} />
                <R.Tooltip
                  content={customTooltip((p) => [
                    { label: "Market (impl. prob)", value: p[0]?.value?.toFixed(3), dot: "#4F8CFF" },
                    { label: "Chainlink", value: p[1]?.value?.toFixed(3), dot: "#06B6D4" },
                  ])}
                />
                {detectionPoint && (
                  <R.ReferenceLine
                    yAxisId="l"
                    x={detectionPoint.t}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    label={{ value: "Detected", fill: "#F59E0B", fontSize: 10, position: "top" }}
                  />
                )}
                <R.Line yAxisId="l" type="monotone" dataKey="market" stroke="#4F8CFF" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                <R.Line yAxisId="r" type="monotone" dataKey="cl" stroke="#06B6D4" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
              </R.LineChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G14 — Ecosystem Volume (line + bar combo)
// =============================================================
/**
 * @param {object} props
 * @param {EcoVolumeBucket[]=} props.buckets  EcoVolume.buckets
 * @param {string=} props.interval
 * @param {(iv: string) => void=} props.onInterval
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function EcosystemVolume({ buckets, interval = "1d", onInterval, loading = false, empty = false }) {
  const data = (buckets ?? []).map((b) => ({ t: b.t, vol: b.volume_usd, markets: b.new_markets }));
  const isEmpty = empty || (!loading && data.length === 0);

  return (
    <ChartContainer
      title="Total Volume"
      subtitle="USD volume + new markets"
      intervals={["1d", "1w", "1m"]}
      currentInterval={interval}
      onInterval={onInterval}
    >
      {chartBody({
        loading,
        empty: isEmpty,
        height: 280,
        children: (
          <div style={{ height: 280 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false} />
                <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} />
                <R.YAxis yAxisId="l" stroke="#4F8CFF" tick={{ fontSize: 11, fill: "#4F8CFF" }} tickFormatter={fmtUSD} width={56} />
                <R.YAxis yAxisId="r" orientation="right" stroke="#06B6D4" tick={{ fontSize: 11, fill: "#06B6D4" }} width={32} />
                <R.Tooltip
                  content={customTooltip((p) => [
                    { label: "Volume", value: fmtUSD(p[0]?.value), dot: "#4F8CFF" },
                    { label: "New markets", value: fmtNum(p[1]?.value), dot: "#06B6D4" },
                  ])}
                />
                <R.Bar yAxisId="r" dataKey="markets" fill="rgba(6,182,212,0.45)" radius={[2, 2, 0, 0]} />
                <R.Line yAxisId="l" type="monotone" dataKey="vol" stroke="#4F8CFF" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </R.ComposedChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G15 — Active Markets over time (area)
// =============================================================
/**
 * @param {object} props
 * @param {EcoActiveMarketsBucket[]=} props.buckets  EcoActiveMarkets.buckets
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function ActiveMarkets({ buckets, loading = false, empty = false }) {
  const data = (buckets ?? []).map((b) => ({ t: b.t, active: b.active_count }));
  const isEmpty = empty || (!loading && data.length === 0);

  return (
    <ChartContainer title="Active Markets" subtitle="Daily open markets">
      {chartBody({
        loading,
        empty: isEmpty,
        height: 280,
        children: (
          <div style={{ height: 280 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.AreaChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
                <defs>
                  <linearGradient id="g-act2" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#A855F7" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false} />
                <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} />
                <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} width={50} tickFormatter={fmtNum} />
                <R.Tooltip content={customTooltip((p) => [{ label: "Active", value: fmtNum(p[0]?.value), dot: "#A855F7" }])} />
                <R.Area type="monotone" dataKey="active" stroke="#A855F7" strokeWidth={1.8} fill="url(#g-act2)" isAnimationActive={false} />
              </R.AreaChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G16 — Category Breakdown (horizontal bars)
// =============================================================
/**
 * @param {object} props
 * @param {EcoCategory[]=} props.categories  EcoByCategory.categories
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function CategoryBars({ categories, loading = false, empty = false }) {
  const data = (categories ?? []).map((c) => ({
    name: c.name,
    value: c.volume_usd,
    share: c.share_pct,
    color: c.color,
  }));
  const isEmpty = empty || (!loading && data.length === 0);

  return (
    <ChartContainer title="Volume by Category" subtitle="Last 30 days">
      {chartBody({
        loading,
        empty: isEmpty,
        height: 280,
        children: (
          <div style={{ height: 280 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.BarChart data={data} layout="vertical" margin={{ top: 4, right: 80, left: 16, bottom: 4 }}>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" />
                <R.XAxis type="number" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtUSD} />
                <R.YAxis type="category" dataKey="name" stroke="#5A6178" tick={{ fontSize: 12, fill: "#E6E9F0" }} width={100} />
                <R.Tooltip
                  content={customTooltip((p) => [
                    { label: p[0]?.payload.name, value: fmtUSD(p[0]?.value) + " (" + p[0]?.payload.share + "%)", dot: p[0]?.payload.color },
                  ])}
                  cursor={{ fill: "#1C2030" }}
                />
                <R.Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {data.map((d, i) => (
                    <R.Cell key={i} fill={d.color} />
                  ))}
                  <R.LabelList dataKey="share" position="right" formatter={(v) => v + "%"} fill="#8A92A6" fontSize={11} />
                </R.Bar>
              </R.BarChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G17 — Calibration Scatter (scatter + reference diagonal)
// =============================================================
/**
 * @param {object} props
 * @param {Calibration=} props.calibration  GET /ecosystem/calibration payload
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function CalibrationScatter({ calibration, loading = false, empty = false }) {
  const cal = calibration;
  const allMarkets = cal?.markets ?? [];
  const buckets = cal?.buckets ?? [];
  const isEmpty = empty || (!loading && allMarkets.length === 0);

  const [filter, setFilter] = useState("all");
  const categories = Array.from(new Set(allMarkets.map((m) => m.category)));
  const cats = ["all", ...categories];

  // scatter points: x = implied prob, y = outcome, with tiny jitter on y
  const pts = (filter === "all" ? allMarkets : allMarkets.filter((m) => m.category === filter)).map(
    (m) => ({
      x: m.implied_prob_avg,
      y: m.outcome + (Math.random() - 0.5) * 0.06,
      outcome: m.outcome,
      category: m.category,
      volume: m.volume_usd,
      slug: m.slug,
      question: m.question,
    })
  );
  // aggregated buckets: x = predicted_avg, y = actual_rate
  const bucketPts = buckets.map((b) => ({
    x: b.predicted_avg,
    y: b.actual_rate,
    range: b.range,
    count: b.count,
  }));

  return (
    <ChartContainer
      title="Calibration"
      subtitle="Implied probability vs realized outcome"
      legend={
        <div className="chip-row">
          {cats.map((c) => (
            <button
              key={c}
              className={"chip " + (filter === c ? "active" : "")}
              onClick={() => setFilter(c)}
            >
              {c === "all" ? "All" : (CATEGORY_STYLES[c]?.name || c)}
            </button>
          ))}
        </div>
      }
    >
      {chartBody({
        loading,
        empty: isEmpty,
        height: 420,
        children: (
          <div style={{ height: 420 }}>
            <R.ResponsiveContainer width="100%" height="100%">
              <R.ScatterChart margin={{ top: 10, right: 18, left: 0, bottom: 20 }}>
                <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" />
                <R.XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 1]}
                  stroke="#5A6178"
                  tick={{ fontSize: 11, fill: "#8A92A6" }}
                  tickFormatter={(v) => (v * 100).toFixed(0) + "%"}
                  label={{ value: "Implied probability", fill: "#8A92A6", fontSize: 11, position: "insideBottom", offset: -8 }}
                />
                <R.YAxis
                  type="number"
                  dataKey="y"
                  domain={[-0.1, 1.1]}
                  stroke="#5A6178"
                  tick={{ fontSize: 11, fill: "#8A92A6" }}
                  ticks={[0, 1]}
                  tickFormatter={(v) => (v === 1 ? "YES" : v === 0 ? "NO" : "")}
                  width={48}
                />
                <R.ZAxis dataKey="volume" range={[16, 120]} />
                <R.Tooltip
                  content={customTooltip((p) => {
                    const d = p[0]?.payload || {};
                    if (d.range) {
                      return [
                        { label: "Bucket", value: d.range },
                        { label: "Actual rate", value: (d.y * 100).toFixed(1) + "%" },
                        { label: "Count", value: fmtNum(d.count) },
                      ];
                    }
                    return [
                      { label: "Predicted", value: ((d.x || 0) * 100).toFixed(1) + "%" },
                      { label: "Outcome", value: d.outcome === 1 ? "YES" : "NO" },
                      { label: "Category", value: d.category || "—" },
                      { label: "Volume", value: fmtUSD(d.volume || 0) },
                    ];
                  })}
                  cursor={{ strokeDasharray: "3 3" }}
                />
                <R.ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#5A6178" strokeDasharray="4 4" />
                <R.Scatter data={pts}>
                  {pts.map((p, i) => (
                    <R.Cell key={i} fill={catColor(p.category)} fillOpacity={0.55} />
                  ))}
                </R.Scatter>
                <R.Scatter data={bucketPts} shape="circle" fill="#F59E0B" />
              </R.ScatterChart>
            </R.ResponsiveContainer>
          </div>
        ),
      })}
    </ChartContainer>
  );
}

// =============================================================
// G18 — Activity Heatmap (7×24 grid)
// =============================================================
const HEATMAP_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * @param {object} props
 * @param {ActivityHeatmapCell[]=} props.matrix  ActivityHeatmap.matrix (flat cells)
 * @param {boolean=} props.loading
 * @param {boolean=} props.empty
 */
function ActivityHeatmap({ matrix, loading = false, empty = false }) {
  const cells = matrix ?? [];
  const isEmpty = empty || (!loading && cells.length === 0);

  // Build a 7×24 grid + normalize tx_count → 0..1 intensity.
  const grid = HEATMAP_DAYS.map(() => new Array(24).fill(0));
  let max = 1;
  cells.forEach((c) => {
    if (c.day >= 0 && c.day < 7 && c.hour >= 0 && c.hour < 24) {
      grid[c.day][c.hour] = c.tx_count;
      if (c.tx_count > max) max = c.tx_count;
    }
  });

  return (
    <div className="card">
      <div className="chart-toolbar">
        <div>
          <h3>Activity Heatmap</h3>
          <div className="sub">Trades by day-of-week × hour-of-day</div>
        </div>
      </div>
      <div className="chart-body">
        {loading ? (
          <ChartSkeleton height={200} />
        ) : isEmpty ? (
          <ChartEmpty height={200} />
        ) : (
          <>
            <div className="heatmap">
              {grid.map((row, di) => (
                <React.Fragment key={"row" + di}>
                  <div className="ylabel">{HEATMAP_DAYS[di]}</div>
                  {row.map((v, hi) => {
                    const intensity = v / max;
                    return (
                      <div
                        key={di + "-" + hi}
                        className="cell"
                        title={`${HEATMAP_DAYS[di]} ${String(hi).padStart(2, "0")}:00 — ${fmtNum(v)} trades`}
                        style={{ background: `rgba(79,140,255,${0.06 + intensity * 0.75})` }}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 12,
                alignItems: "center",
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              <span>Low</span>
              {[0.1, 0.3, 0.5, 0.7, 0.9].map((v) => (
                <div
                  key={v}
                  style={{ width: 16, height: 12, borderRadius: 2, background: `rgba(79,140,255,${0.06 + v * 0.75})` }}
                />
              ))}
              <span>High</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export {
  PriceChart,
  VolumeBars,
  OrderbookDepth,
  HoldersBar,
  ContractActivity,
  WalletsDaily,
  ResolutionTimeline,
  BondHistogram,
  DivergenceMini,
  MarketVsChainlink,
  EcosystemVolume,
  ActiveMarkets,
  CategoryBars,
  CalibrationScatter,
  ActivityHeatmap,
};
