/* DashboardScreen — Fase 4, task 4.2.
 *
 * Ported from `web-example/nextjs/screens/index.jsx` `DashboardScreen`. The
 * example read everything from the `GSR_MOCKS` global; this version is wired
 * to React Query hooks instead:
 *   - useDashboardSummary()   → GET /dashboard/summary  (KPIs + active resolutions)
 *   - useTopMarkets()         → GET /dashboard/top-markets  (the table, G2 sparkline)
 *   - useNotableDivergences() → GET /dashboard/notable-divergences  (G12 cards)
 *
 * Data shapes come straight from API_CONTRACT.md / lib/api/types.ts — not the
 * example's loose shapes. KPI tiles are built inline against the contract's
 * `KpiItem` (which has `value_formatted` / `delta_pct` / `delta_direction`,
 * and no sparkline) rather than reusing `KpiCard` (whose shape is the
 * example's). Each data region has its own loading / empty / error state.
 */

import { useRouter } from "next/router";
import Link from "next/link";
import {
  Icon,
  CatPill,
  StatusPill,
  DataTable,
  MiniSpark,
  fmtUSD,
  fmtPct,
  fmtCountdown,
} from "../lib/components";
import { DivergenceMini } from "../lib/charts";
import {
  useDashboardSummary,
  useTopMarkets,
  useNotableDivergences,
} from "../lib/hooks";

// divergence_type (contract) → StatusPill key.
const DIVERGENCE_PILL = {
  price_gap_vs_chainlink: "price_gap",
  sudden_move_no_signal: "sudden",
  news_not_reflected: "news",
  chainlink_move_no_market: "news",
};

// ---- small shared state blocks ----------------------------------------
function StateBlock({ children }) {
  return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
      {children}
    </div>
  );
}

function ErrorBlock({ error, onRetry }) {
  return (
    <StateBlock>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <Icon name="alert" size={20} color="var(--danger)" />
        <div>{(error && error.message) || "Failed to load."}</div>
        {onRetry && (
          <button className="btn sm" onClick={onRetry} style={{ marginTop: 4 }}>
            <Icon name="refresh" size={12} /> Retry
          </button>
        )}
      </div>
    </StateBlock>
  );
}

export default function DashboardScreen() {
  const router = useRouter();

  const summary = useDashboardSummary();
  const topMarkets = useTopMarkets();
  const divergences = useNotableDivergences();

  // --- Top Markets table columns (contract: TopMarketItem) ---
  const topColumns = [
    {
      key: "question",
      label: "Question",
      truncate: true,
      render: (r) => <span style={{ color: "var(--text-primary)" }}>{r.question}</span>,
    },
    { key: "category", label: "Cat", render: (r) => <CatPill cat={r.category} /> },
    {
      key: "price_yes",
      label: "Yes",
      align: "right",
      mono: true,
      render: (r) => "$" + r.price_yes.toFixed(2),
    },
    {
      key: "delta_pct_24h",
      label: "Δ 24h",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.delta_pct_24h >= 0 ? "t-pos" : "t-neg"}>{fmtPct(r.delta_pct_24h)}</span>
      ),
    },
    {
      key: "volume_24h_usd",
      label: "Vol 24h",
      align: "right",
      mono: true,
      render: (r) => fmtUSD(r.volume_24h_usd),
    },
    {
      key: "sparkline",
      label: "Trend",
      sortable: false,
      render: (r) => <MiniSpark data={r.sparkline} delta={r.delta_pct_24h} />,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Live overview of the Polymarket ecosystem</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="filter" size={14} /> Last 24h</button>
          <button className="btn"><Icon name="download" size={14} /> Export</button>
        </div>
      </div>

      {/* ---- KPI strip (G1-ish tiles) ---- */}
      {summary.isLoading && (
        <div className="grid grid-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="card kpi-card">
              <div className="skel" style={{ height: 12, width: "60%", marginBottom: 12 }} />
              <div className="skel" style={{ height: 24, width: "45%" }} />
            </div>
          ))}
        </div>
      )}
      {summary.isError && (
        <div className="card">
          <ErrorBlock error={summary.error} onRetry={() => summary.refetch()} />
        </div>
      )}
      {summary.isSuccess && summary.data.kpis.length === 0 && (
        <div className="card"><StateBlock>No KPIs available.</StateBlock></div>
      )}
      {summary.isSuccess && summary.data.kpis.length > 0 && (
        <div className="grid grid-5">
          {summary.data.kpis.map((k) => {
            const dir = k.delta_direction;
            return (
              <div key={k.key} className="card kpi-card">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-row">
                  <div className="kpi-value">{k.value_formatted}</div>
                  {k.delta_pct != null && dir !== "neutral" && (
                    <div className={"kpi-delta " + (dir === "up" ? "up" : "down")}>
                      <Icon name={dir === "up" ? "arrow-up" : "arrow-down"} size={12} />
                      {Math.abs(k.delta_pct).toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-12" style={{ marginTop: 16 }}>
        {/* ---- Top Markets table ---- */}
        <div className="col-8">
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Top Markets — Last 24h</h3>
                <div className="card-sub">Sorted by volume</div>
              </div>
              <Link href="/markets" className="btn ghost sm">
                View all <Icon name="arrow-right" size={12} />
              </Link>
            </div>
            <div className="card-body flush">
              {topMarkets.isLoading && <StateBlock>Loading markets…</StateBlock>}
              {topMarkets.isError && (
                <ErrorBlock error={topMarkets.error} onRetry={() => topMarkets.refetch()} />
              )}
              {topMarkets.isSuccess && topMarkets.data.items.length === 0 && (
                <StateBlock>No markets in this window.</StateBlock>
              )}
              {topMarkets.isSuccess && topMarkets.data.items.length > 0 && (
                <DataTable
                  columns={topColumns}
                  data={topMarkets.data.items}
                  pageSize={10}
                  paginate={false}
                  onRowClick={(r) => router.push("/markets/" + r.slug)}
                  defaultSort={{ key: "volume_24h_usd", dir: "desc" }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ---- Active Resolutions (from /dashboard/summary) ---- */}
        <div className="col-4">
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Active Resolutions</h3>
                <div className="card-sub">Awaiting outcome</div>
              </div>
              <Link href="/resolutions" className="btn ghost sm">
                View all <Icon name="arrow-right" size={12} />
              </Link>
            </div>
            <div>
              {summary.isLoading && <StateBlock>Loading…</StateBlock>}
              {summary.isError && (
                <ErrorBlock error={summary.error} onRetry={() => summary.refetch()} />
              )}
              {summary.isSuccess && summary.data.active_resolutions.length === 0 && (
                <StateBlock>No active resolutions.</StateBlock>
              )}
              {summary.isSuccess &&
                summary.data.active_resolutions.map((r) => (
                  <Link
                    href={"/resolutions/" + r.question_id}
                    key={r.question_id}
                    style={{
                      display: "block",
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border-subtle)",
                      transition: "background 150ms",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ marginBottom: 6 }}>
                      <StatusPill status={r.status} />
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary)",
                        marginBottom: 4,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.market_question}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        display: "flex",
                        gap: 10,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <span>Bond ${r.bond_usd}</span>
                      <span>·</span>
                      <span>Ends in {fmtCountdown(r.ends_in_seconds * 1000)}</span>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Notable Divergences (G12 cards) ---- */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Notable Divergences — Last 24h</h3>
            <div className="card-sub">Markets out of sync with external signals</div>
          </div>
          <Link href="/signals" className="btn ghost sm">
            All signals <Icon name="arrow-right" size={12} />
          </Link>
        </div>
        <div className="card-body">
          {divergences.isLoading && <StateBlock>Loading divergences…</StateBlock>}
          {divergences.isError && (
            <ErrorBlock error={divergences.error} onRetry={() => divergences.refetch()} />
          )}
          {divergences.isSuccess && divergences.data.length === 0 && (
            <StateBlock>No notable divergences in the last 24h.</StateBlock>
          )}
          {divergences.isSuccess && divergences.data.length > 0 && (
            <div className="grid grid-3">
              {divergences.data.slice(0, 3).map((card) => {
                const d = card.divergence;
                return (
                  <div key={d.id} className="card" style={{ background: "var(--bg-base)" }}>
                    <div style={{ padding: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <StatusPill status={DIVERGENCE_PILL[d.divergence_type] || "news"} />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 11,
                            color: "var(--text-secondary)",
                          }}
                        >
                          <span>Severity</span>
                          <span className="sev-meter">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <span key={i} className={"s " + (i <= d.severity ? "on" : "")} />
                            ))}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          marginBottom: 12,
                          minHeight: 36,
                          lineHeight: 1.4,
                        }}
                      >
                        {card.market.question}
                      </div>
                      <DivergenceMini miniChart={card.mini_chart_data} />
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 12,
                          fontSize: 11,
                          color: "var(--text-secondary)",
                        }}
                      >
                        <span>{fmtPct(d.magnitude_pct)} gap</span>
                        <Link href={"/markets/" + card.market.slug} className="btn sm">
                          Investigate <Icon name="arrow-right" size={12} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
