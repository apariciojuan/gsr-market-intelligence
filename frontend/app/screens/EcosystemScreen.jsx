/* /ecosystem — Ecosystem screen (Fase 4, task 4.11).
 *
 * Ported from web-example `EcosystemScreen`. Every datum comes from a React
 * Query hook in `lib/hooks/useEcosystem` — no JSON / fetch / GSR_MOCKS here.
 *
 * Sections (each with its own loading / empty / error state):
 *  - KPI strip          → useEcosystemKpis + useEcoKpiSparkline (G1)
 *  - Total Volume (G14) → useEcoVolume
 *  - Active Markets G15 → useEcoActiveMarkets
 *  - By Category  (G16) → useEcoByCategory
 *  - Calibration  (G17) → useCalibration
 *  - Top Wallets table  → useTopWallets        (supports `total: null`)
 *  - Activity Heatmap   → useActivityHeatmap   (G18)
 */

import { useState } from "react";
import {
  useEcosystemKpis,
  useEcoKpiSparkline,
  useEcoVolume,
  useEcoActiveMarkets,
  useEcoByCategory,
  useCalibration,
  useActivityHeatmap,
  useTopWallets,
} from "../lib/hooks/useEcosystem";
import {
  AddressPill,
  DataTable,
  Icon,
  fmtNum,
  fmtUSD,
} from "../lib/components";
import * as Recharts from "recharts";
import {
  EcosystemVolume,
  ActiveMarkets,
  CategoryBars,
  CalibrationScatter,
  ActivityHeatmap,
} from "../lib/charts";

// ---------------------------------------------------------------
// Shared section-level error card
// ---------------------------------------------------------------
function SectionError({ title, error, onRetry }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="empty">
          <Icon name="alert" size={20} />
          <div className="ttl">{title}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {error?.message || "Something went wrong."}
          </div>
          {onRetry && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => onRetry()}>
              <Icon name="refresh" size={13} /> Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// KPI card wired to the API shape (KpiItem) + its own sparkline hook.
//
// `KpiCard` from lib/components expects the example's shape
// (`k.spark` / `k.delta` / formatted `k.value`); the contract's `KpiItem`
// is different, so this screen renders its own tile against the contract.
// ---------------------------------------------------------------
function EcoKpiCard({ kpi }) {
  const sparkQuery = useEcoKpiSparkline(kpi.key);
  const dir = kpi.delta_direction;
  const trendClass = dir === "down" ? "down" : "up";
  const color = dir === "down" ? "#EF4444" : "#22C55E";

  const values = sparkQuery.data?.values ?? [];
  const data = values.map((v, i) => ({ i, v }));

  return (
    <div className="card kpi-card">
      <div className="kpi-label">{kpi.label}</div>
      <div className="kpi-row">
        <div className="kpi-value">{kpi.value_formatted}</div>
        {kpi.delta_pct != null && dir !== "neutral" && (
          <div className={"kpi-delta " + trendClass}>
            <Icon name={dir === "down" ? "arrow-down" : "arrow-up"} size={12} />
            {Math.abs(kpi.delta_pct).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="kpi-spark">
        {sparkQuery.isLoading ? (
          <div className="skel" style={{ width: "100%", height: "100%" }} />
        ) : sparkQuery.isError || data.length === 0 ? (
          <div style={{ width: "100%", height: "100%" }} />
        ) : (
          <Recharts.ResponsiveContainer width="100%" height="100%">
            <Recharts.AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={"eco-spark-" + kpi.key} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Recharts.Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.6}
                fill={`url(#eco-spark-${kpi.key})`}
                dot={false}
                isAnimationActive={false}
              />
            </Recharts.AreaChart>
          </Recharts.ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function KpiStrip() {
  const { data, isLoading, isError, error, refetch } = useEcosystemKpis();

  if (isLoading) {
    return (
      <div className="grid grid-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card kpi-card">
            <div className="skel" style={{ width: "60%", height: 12, marginBottom: 10 }} />
            <div className="skel" style={{ width: "45%", height: 22, marginBottom: 12 }} />
            <div className="skel" style={{ width: "100%", height: 36 }} />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <SectionError title="Couldn't load KPIs" error={error} onRetry={refetch} />;
  }

  const kpis = data?.kpis ?? [];
  if (kpis.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="empty">
            <Icon name="info" size={20} />
            <div className="ttl">No KPIs available</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-5">
      {kpis.map((k) => (
        <EcoKpiCard key={k.key} kpi={k} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Top Wallets — server-paginated table, supports `total: null`.
// ---------------------------------------------------------------
const WALLET_PAGE_SIZE = 10;

function TopWalletsCard() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useTopWallets({
    limit: WALLET_PAGE_SIZE,
    order_by: "volume",
  });

  const columns = [
    {
      key: "address",
      label: "Wallet",
      render: (r) => <AddressPill address={r.address} label={r.address_label} />,
    },
    {
      key: "total_volume_usd",
      label: "Volume",
      align: "right",
      mono: true,
      render: (r) => fmtUSD(r.total_volume_usd),
    },
    {
      key: "market_count",
      label: "Markets",
      align: "right",
      mono: true,
      render: (r) => fmtNum(r.market_count),
    },
    {
      key: "trade_count",
      label: "Trades",
      align: "right",
      mono: true,
      render: (r) => fmtNum(r.trade_count),
    },
    {
      key: "realized_pnl_usd",
      label: "PnL",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.realized_pnl_usd >= 0 ? "t-pos" : "t-neg"}>
          {fmtUSD(r.realized_pnl_usd)}
        </span>
      ),
    },
    {
      key: "success_rate_pct",
      label: "Win rate",
      align: "right",
      mono: true,
      render: (r) => r.success_rate_pct.toFixed(0) + "%",
    },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Top Wallets</h3>
        <div className="card-sub">Most active over last 30d</div>
      </div>
      {isLoading ? (
        <div className="card-body">
          <div className="skel" style={{ width: "100%", height: 220 }} />
        </div>
      ) : isError ? (
        <div className="card-body">
          <div className="empty">
            <Icon name="alert" size={20} />
            <div className="ttl">Couldn't load wallets</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              {error?.message || "Something went wrong."}
            </div>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => refetch()}>
              <Icon name="refresh" size={13} /> Retry
            </button>
          </div>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          serverPaginated
          page={page}
          onPageChange={setPage}
          hasMore={!!data?.has_more}
          total={data?.total ?? null}
          pageSize={WALLET_PAGE_SIZE}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Section wrappers for each chart — own loading / error state.
// (Empty state is handled inside each chart via its `empty` prop.)
// ---------------------------------------------------------------
function EcoVolumeSection() {
  const [interval, setInterval] = useState("1d");
  const { data, isLoading, isError, error, refetch } = useEcoVolume({ interval });

  if (isError) {
    return <SectionError title="Couldn't load volume" error={error} onRetry={refetch} />;
  }
  return (
    <EcosystemVolume
      buckets={data?.buckets}
      interval={interval}
      onInterval={setInterval}
      loading={isLoading}
    />
  );
}

function ActiveMarketsSection() {
  const { data, isLoading, isError, error, refetch } = useEcoActiveMarkets();

  if (isError) {
    return <SectionError title="Couldn't load active markets" error={error} onRetry={refetch} />;
  }
  return <ActiveMarkets buckets={data?.buckets} loading={isLoading} />;
}

function CategorySection() {
  const { data, isLoading, isError, error, refetch } = useEcoByCategory();

  if (isError) {
    return <SectionError title="Couldn't load category breakdown" error={error} onRetry={refetch} />;
  }
  return <CategoryBars categories={data?.categories} loading={isLoading} />;
}

function CalibrationSection() {
  const { data, isLoading, isError, error, refetch } = useCalibration();

  if (isError) {
    return <SectionError title="Couldn't load calibration" error={error} onRetry={refetch} />;
  }
  return <CalibrationScatter calibration={data} loading={isLoading} />;
}

function ActivityHeatmapSection() {
  const { data, isLoading, isError, error, refetch } = useActivityHeatmap();

  if (isError) {
    return <SectionError title="Couldn't load activity heatmap" error={error} onRetry={refetch} />;
  }
  return <ActivityHeatmap matrix={data?.matrix} loading={isLoading} />;
}

// ---------------------------------------------------------------
// Screen
// ---------------------------------------------------------------
export default function EcosystemScreen() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ecosystem</h1>
          <div className="page-sub">Polymarket aggregate metrics</div>
        </div>
      </div>

      <KpiStrip />

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <EcoVolumeSection />
        <ActiveMarketsSection />
      </div>

      <div style={{ marginTop: 16 }}>
        <CategorySection />
      </div>

      <div style={{ marginTop: 16 }}>
        <CalibrationSection />
      </div>

      <div style={{ marginTop: 16 }}>
        <TopWalletsCard />
      </div>

      <div style={{ marginTop: 16 }}>
        <ActivityHeatmapSection />
      </div>
    </div>
  );
}
