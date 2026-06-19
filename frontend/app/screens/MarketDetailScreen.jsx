/* GSR Market Intelligence — Market detail screen (route `/markets/[slug]`).
 *
 * Ported from `web-example/nextjs/screens/index.jsx` (`MarketDetailScreen`),
 * rewired from the `GSR_MOCKS` global onto React Query hooks.
 *
 * Data wiring (all from `app/lib/hooks/useMarkets.ts`, never JSON / fetch):
 *   - `useMarket(slug)`        → heavy `/markets/{slug}` payload (MarketDetail):
 *                                market record, stats, current prices, linked
 *                                contracts, chainlink overlay flag.
 *   - `useMarketPrices(id, …)` → `/markets/{id}/prices` for G3 (PriceChart) and
 *                                G5 (VolumeBars) in the Overview tab.
 *   - `useOrderbook(id, …)`    → `/markets/{id}/orderbook` for G6 in Orderbook.
 *   - `useHolders(id, …)`      → `/markets/{id}/holders` for G7 + Holders tab.
 *   - `useTrades(id, …)`       → `/markets/{id}/trades` for the Trades tab.
 *   - `useMarketNews(id, …)`   → `/markets/{id}/news` for the Signals tab.
 *
 * Note the heavy endpoint is keyed by `slug`, but every sub-resource endpoint
 * is keyed by the numeric `market.id` — which only exists *after* `useMarket`
 * resolves. The sub-hooks are all `enabled`-gated on `id` inside the hook
 * layer, so passing `undefined` before the detail loads is safe (they simply
 * don't fire).
 *
 * States:
 *   - Whole screen: loading skeleton while the heavy call is in flight; a
 *     dedicated 404 panel for `ApiError` code `MARKET_NOT_FOUND`; a generic
 *     error panel (with retry) for anything else.
 *   - Per section: each chart receives `loading` / `empty`; each tab table
 *     renders its own loading / error / empty state independently, so a slow
 *     or failing sub-resource never blocks the rest of the screen.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useHolders,
  useMarket,
  useMarketNews,
  useMarketPrices,
  useOrderbook,
  useTrades,
} from "../lib/hooks/useMarkets";
import { sourceLabel, sourcePillKey } from "../lib/externalSignals";
import { ExternalSignalBody, splitSignalHeadline } from "../lib/externalSignalContent";
import * as C from "../lib/components";
import * as G from "../lib/charts";
import { ApiError } from "../lib/api";

const {
  Icon,
  CatPill,
  StatusPill,
  AddressPill,
  DataTable,
  TabBar,
  fmtUSD,
  fmtNum,
  fmtPrice,
  fmtRelTime,
  truncAddr,
} = C;
const { PriceChart, VolumeBars, OrderbookDepth, HoldersBar } = G;

const PRICE_INTERVALS = ["1h", "4h", "1d", "1w", "max"];
const TRADES_PAGE_SIZE = 10;

// ---------------------------------------------------------------
// Shared little helpers for section-level states.
// ---------------------------------------------------------------
function SectionError({ error, onRetry, label }) {
  return (
    <div className="empty">
      <Icon name="alert" size={20} />
      <div className="ttl">Failed to load {label}</div>
      <div className="sub">
        {ApiError.is(error)
          ? `${error.code} — ${error.message}`
          : "Unexpected error. Please try again."}
      </div>
      {onRetry && (
        <button
          className="btn sm"
          style={{ marginTop: 10 }}
          onClick={() => onRetry()}
        >
          <Icon name="refresh" size={12} /> Retry
        </button>
      )}
    </div>
  );
}

function SectionLoading({ rows = 6 }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ height: 36, marginBottom: 6 }} />
      ))}
    </div>
  );
}

function SectionEmpty({ message }) {
  return (
    <div className="empty">
      <Icon name="info" size={20} />
      <div className="ttl">{message}</div>
    </div>
  );
}

// ===============================================================
// Tab bodies — each owns its sub-resource hook + states.
// ===============================================================
function OverviewTab({ marketId, interval, onInterval }) {
  const { data, isLoading, isError, error, refetch } = useMarketPrices(
    marketId,
    { interval }
  );

  if (isError) {
    return (
      <div style={{ padding: 16 }}>
        <SectionError error={error} onRetry={refetch} label="price history" />
      </div>
    );
  }

  const priceHistory = data;
  const noData =
    !isLoading && (!priceHistory || (priceHistory.series_yes ?? []).length === 0);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <PriceChart
        priceHistory={priceHistory}
        interval={interval}
        onInterval={onInterval}
        loading={isLoading}
        empty={noData}
      />
      <VolumeBars
        volumeSeries={priceHistory?.volume_series}
        loading={isLoading}
        empty={noData}
      />
    </div>
  );
}

function OrderbookTab({ marketId }) {
  const [outcome, setOutcome] = useState("yes");
  const { data, isLoading, isError, error, refetch } = useOrderbook(marketId, {
    outcome,
  });

  return (
    <div style={{ padding: 16 }}>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {["yes", "no"].map((o) => (
          <button
            key={o}
            className={"chip " + (outcome === o ? "active" : "")}
            onClick={() => setOutcome(o)}
          >
            {o.toUpperCase()}
          </button>
        ))}
      </div>
      {isError ? (
        <SectionError error={error} onRetry={refetch} label="orderbook" />
      ) : (
        <OrderbookDepth
          orderbook={data}
          loading={isLoading}
          empty={
            !isLoading &&
            !!data &&
            (data.bids ?? []).length === 0 &&
            (data.asks ?? []).length === 0
          }
        />
      )}
    </div>
  );
}

function HoldersTab({ marketId }) {
  const { data, isLoading, isError, error, refetch } = useHolders(marketId, {
    limit: 50,
  });
  const items = data?.items ?? [];

  if (isError) {
    return (
      <div style={{ padding: 16 }}>
        <SectionError error={error} onRetry={refetch} label="holders" />
      </div>
    );
  }
  if (isLoading) return <SectionLoading rows={8} />;
  if (items.length === 0)
    return <SectionEmpty message="No holders for this market" />;

  const columns = [
    { key: "rank", label: "#", mono: true, width: 50 },
    {
      key: "address",
      label: "Wallet",
      render: (r) => <AddressPill address={r.address} label={r.address_label} />,
    },
    { key: "side", label: "Side", render: (r) => <StatusPill status={r.side} /> },
    {
      key: "shares",
      label: "Shares",
      align: "right",
      mono: true,
      render: (r) => fmtNum(Number(r.shares)),
    },
    {
      key: "avg_buy_price",
      label: "Avg Buy",
      align: "right",
      mono: true,
      render: (r) => fmtPrice(r.avg_buy_price),
    },
    {
      key: "value_usd",
      label: "Value",
      align: "right",
      mono: true,
      render: (r) => fmtUSD(r.value_usd),
    },
    {
      key: "realized_pnl_usd",
      label: "Realized PnL",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.realized_pnl_usd >= 0 ? "t-pos" : "t-neg"}>
          {fmtUSD(r.realized_pnl_usd)}
        </span>
      ),
    },
    {
      key: "unrealized_pnl_usd",
      label: "Unrealized PnL",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.unrealized_pnl_usd >= 0 ? "t-pos" : "t-neg"}>
          {fmtUSD(r.unrealized_pnl_usd)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={items}
      pageSize={10}
      defaultSort={{ key: "value_usd", dir: "desc" }}
    />
  );
}

function TradesTab({ marketId }) {
  const [page, setPage] = useState(1);
  const params = useMemo(
    () => ({
      limit: TRADES_PAGE_SIZE,
      offset: (page - 1) * TRADES_PAGE_SIZE,
      order: "desc",
    }),
    [page]
  );
  const { data, isLoading, isError, error, refetch } = useTrades(
    marketId,
    params
  );
  const items = data?.items ?? [];

  if (isError) {
    return (
      <div style={{ padding: 16 }}>
        <SectionError error={error} onRetry={refetch} label="trades" />
      </div>
    );
  }
  if (isLoading) return <SectionLoading rows={8} />;
  if (items.length === 0 && page === 1)
    return <SectionEmpty message="No trades for this market" />;

  const columns = [
    {
      key: "time",
      label: "Time",
      mono: true,
      sortable: false,
      render: (r) => fmtRelTime(r.time),
    },
    {
      key: "side",
      label: "Side",
      sortable: false,
      render: (r) => (
        <span
          className={r.side === "buy" ? "t-pos" : "t-neg"}
          style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
        >
          {r.side.toUpperCase()}
        </span>
      ),
    },
    {
      key: "outcome",
      label: "Outcome",
      sortable: false,
      render: (r) => <StatusPill status={r.outcome} />,
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      mono: true,
      sortable: false,
      render: (r) => fmtPrice(r.price),
    },
    {
      key: "size",
      label: "Size",
      align: "right",
      mono: true,
      sortable: false,
      render: (r) => fmtNum(r.size),
    },
    {
      key: "value_usd",
      label: "Total",
      align: "right",
      mono: true,
      sortable: false,
      render: (r) => fmtUSD(r.value_usd),
    },
    {
      key: "trader_address",
      label: "Trader",
      sortable: false,
      render: (r) => <AddressPill address={r.trader_address} />,
    },
    {
      key: "tx_hash",
      label: "Tx",
      sortable: false,
      render: (r) => (
        <a
          href={"https://polygonscan.com/tx/" + r.tx_hash}
          target="_blank"
          rel="noreferrer"
          className="mono"
          style={{ fontSize: 11, color: "var(--accent)" }}
        >
          {truncAddr(r.tx_hash, 6)}
        </a>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={items}
      serverPaginated
      page={page}
      onPageChange={setPage}
      hasMore={data?.has_more ?? false}
      total={data?.total ?? null}
      pageSize={TRADES_PAGE_SIZE}
    />
  );
}

function SignalsTab({ marketId }) {
  const { data, isLoading, isError, error, refetch } = useMarketNews(marketId, {
    limit: 20,
    min_relevance: 0,
  });
  const items = data?.items ?? [];

  if (isError) {
    return (
      <div style={{ padding: 16 }}>
        <SectionError error={error} onRetry={refetch} label="external signals" />
      </div>
    );
  }
  if (isLoading) return <SectionLoading rows={5} />;
  if (items.length === 0)
    return (
      <SectionEmpty message="No external signals matched to this market yet" />
    );

  return (
    <div style={{ padding: 16 }}>
      {items.map((it) => {
        const xParsed = it.news.source?.startsWith("x_")
          ? splitSignalHeadline(it.news.summary || it.news.title)
          : null;
        return (
        <div
          key={it.news.id}
          style={{
            padding: 12,
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <StatusPill status={sourcePillKey(it.news.source)} />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {fmtRelTime(it.news.published_at)}
            </span>
          </div>
          {xParsed ? (
            <>
              <a
                href={it.news.url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}
              >
                {xParsed.headline}
              </a>
              <ExternalSignalBody
                raw={xParsed.body || ""}
                imageUrl={xParsed.imageUrl}
                style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}
              />
            </>
          ) : (
            <>
              <a
                href={it.news.url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: "var(--text-primary)" }}
              >
                {it.news.title}
              </a>
              {it.news.summary && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {it.news.summary}
                </div>
              )}
            </>
          )}
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 6,
              display: "flex",
              gap: 10,
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>{sourceLabel(it.news.source)}</span>
            <span>·</span>
            <span>
              Relevance {(it.signal.relevance_score * 100).toFixed(0)}%
            </span>
            <span>·</span>
            <span>{it.signal.method}</span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ===============================================================
// Screen
// ===============================================================
export default function MarketDetailScreen({ slug }) {
  const [interval, setInterval] = useState("1d");
  const [tab, setTab] = useState("overview");

  const { data, isLoading, isError, error, refetch } = useMarket(slug);

  // ---- Whole-screen states -------------------------------------------------
  if (isLoading || !slug) {
    return (
      <div>
        <div className="back-link">
          <Icon name="arrow-left" size={12} /> Back to markets
        </div>
        <div className="skel" style={{ height: 48, margin: "12px 0", width: 360 }} />
        <div className="skel" style={{ height: 80, marginBottom: 16 }} />
        <div className="skel" style={{ height: 380 }} />
      </div>
    );
  }

  if (isError) {
    const is404 = ApiError.is(error) && error.code === "MARKET_NOT_FOUND";
    return (
      <div>
        <Link href="/markets" className="back-link">
          <Icon name="arrow-left" size={12} /> Back to markets
        </Link>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <div className="empty">
              <Icon
                name={is404 ? "search" : "alert"}
                size={24}
              />
              <div className="ttl">
                {is404 ? "Market not found" : "Failed to load market"}
              </div>
              <div className="sub">
                {is404
                  ? `No market matches the slug "${slug}".`
                  : ApiError.is(error)
                    ? `${error.code} — ${error.message}`
                    : "Unexpected error. Please try again."}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                {!is404 && (
                  <button className="btn sm" onClick={() => refetch()}>
                    <Icon name="refresh" size={12} /> Retry
                  </button>
                )}
                <Link href="/markets" className="btn sm">
                  Back to markets
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Loaded --------------------------------------------------------------
  const { market, stats, current_prices, linked_contracts } = data;
  const marketId = market.id;
  const yes = current_prices?.yes;
  const no = current_prices?.no;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "orderbook", label: "Orderbook" },
    { id: "holders", label: "Holders" },
    { id: "trades", label: "Trades" },
    { id: "signals", label: "External Signals" },
  ];

  return (
    <div>
      <Link href="/markets" className="back-link">
        <Icon name="arrow-left" size={12} /> Back to markets
      </Link>

      <div
        className="page-header"
        style={{ marginTop: 8, alignItems: "flex-start" }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <CatPill cat={market.category} />
            <StatusPill
              status={
                market.resolved ? "resolved" : market.active ? "active" : "closed"
              }
            />
          </div>
          <h1 className="detail-title">{market.question}</h1>
          <div className="meta-row">
            <span>
              Ends{" "}
              {market.end_date
                ? new Date(market.end_date).toLocaleDateString()
                : "—"}
            </span>
            <span className="sep">·</span>
            <span>
              Vol{" "}
              <b className="mono" style={{ color: "var(--text-primary)" }}>
                {fmtUSD(market.volume_total)}
              </b>
            </span>
            <span className="sep">·</span>
            <span>
              Liquidity{" "}
              <b className="mono" style={{ color: "var(--text-primary)" }}>
                {fmtUSD(market.liquidity)}
              </b>
            </span>
            <span className="sep">·</span>
            <span>
              Holders{" "}
              <b className="mono" style={{ color: "var(--text-primary)" }}>
                {fmtNum(stats?.holder_count ?? 0)}
              </b>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn">
            <Icon name="star" size={14} /> Watch
          </button>
          {market.market_address && (
            <a
              className="btn primary"
              href={"https://polygonscan.com/address/" + market.market_address}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="external-link" size={14} /> View on Polygonscan
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-12">
        <div className="col-8">
          {/* Live price ribbon — sourced from the heavy endpoint's
              current_prices, not a simulated ticker. */}
          <div className="card" style={{ marginBottom: 16, padding: 0 }}>
            <div style={{ display: "flex", gap: 0 }}>
              <div
                className="flex-cell"
                style={{
                  flex: 1,
                  padding: 16,
                  borderRight: "1px solid var(--border-subtle)",
                }}
              >
                <div className="kpi-label">YES</div>
                <div className="kpi-row" style={{ marginBottom: 0 }}>
                  <div
                    className="kpi-value"
                    style={{ color: "var(--success)" }}
                  >
                    {yes ? fmtPrice(yes.price) : "—"}
                  </div>
                </div>
                {yes && (
                  <div
                    className="t-mut"
                    style={{ fontSize: 11, marginTop: 4 }}
                  >
                    bid {fmtPrice(yes.bid)} · ask {fmtPrice(yes.ask)} · spread{" "}
                    {fmtPrice(yes.spread)}
                  </div>
                )}
              </div>
              <div
                style={{
                  flex: 1,
                  padding: 16,
                  borderRight: "1px solid var(--border-subtle)",
                }}
              >
                <div className="kpi-label">NO</div>
                <div className="kpi-row" style={{ marginBottom: 0 }}>
                  <div
                    className="kpi-value"
                    style={{ color: "var(--danger)" }}
                  >
                    {no ? fmtPrice(no.price) : "—"}
                  </div>
                </div>
                {no && (
                  <div
                    className="t-mut"
                    style={{ fontSize: 11, marginTop: 4 }}
                  >
                    bid {fmtPrice(no.bid)} · ask {fmtPrice(no.ask)} · spread{" "}
                    {fmtPrice(no.spread)}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, padding: 16 }}>
                <div className="kpi-label">Volume 24h</div>
                <div className="kpi-row" style={{ marginBottom: 0 }}>
                  <div className="kpi-value">
                    {fmtUSD(stats?.volume_24h_usd ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <TabBar tabs={tabs} active={tab} onChange={setTab} />
            <div style={{ padding: 0 }}>
              {tab === "overview" && (
                <OverviewTab
                  marketId={marketId}
                  interval={interval}
                  onInterval={setInterval}
                />
              )}
              {tab === "orderbook" && <OrderbookTab marketId={marketId} />}
              {tab === "holders" && <HoldersTab marketId={marketId} />}
              {tab === "trades" && <TradesTab marketId={marketId} />}
              {tab === "signals" && <SignalsTab marketId={marketId} />}
            </div>
          </div>
        </div>

        <div className="col-4">
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Stats</h3>
            </div>
            <div className="card-body">
              <div className="stats-list">
                <div>
                  <div className="stat-k">Volume 24h</div>
                  <div className="stat-v">{fmtUSD(stats?.volume_24h_usd ?? 0)}</div>
                </div>
                <div>
                  <div className="stat-k">Volume 7d</div>
                  <div className="stat-v">{fmtUSD(stats?.volume_7d_usd ?? 0)}</div>
                </div>
                <div>
                  <div className="stat-k">Volume total</div>
                  <div className="stat-v">{fmtUSD(market.volume_total)}</div>
                </div>
                <div>
                  <div className="stat-k">Liquidity</div>
                  <div className="stat-v">{fmtUSD(market.liquidity)}</div>
                </div>
                <div>
                  <div className="stat-k">Open Interest</div>
                  <div className="stat-v">
                    {fmtUSD(stats?.open_interest_usd ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="stat-k">Traders</div>
                  <div className="stat-v">{fmtNum(stats?.trader_count ?? 0)}</div>
                </div>
              </div>
            </div>
          </div>

          {market.description && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3 className="card-title">Resolution Rules</h3>
              </div>
              <div
                className="card-body"
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {market.description}
                {market.uma_adapter_address && (
                  <div style={{ marginTop: 12 }}>
                    <span className="stat-k">UMA adapter ({market.uma_adapter_version})</span>
                    <AddressPill address={market.uma_adapter_address} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Linked Contracts</h3>
            </div>
            <div
              className="card-body"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div>
                <div className="stat-k" style={{ marginBottom: 4 }}>
                  Condition ID
                </div>
                <AddressPill address={market.condition_id} withLink={false} />
              </div>
              {(market.outcome_token_ids ?? []).map((tid, i) => (
                <div key={i}>
                  <div className="stat-k" style={{ marginBottom: 4 }}>
                    Token {market.outcomes?.[i] ?? `#${i + 1}`}
                  </div>
                  <AddressPill address={tid} withLink={false} />
                </div>
              ))}
              {(linked_contracts ?? []).map((lc) => (
                <div key={lc.address}>
                  <div className="stat-k" style={{ marginBottom: 4 }}>
                    {lc.name} ({lc.type})
                  </div>
                  <AddressPill address={lc.address} />
                </div>
              ))}
              {(linked_contracts ?? []).length === 0 &&
                (market.outcome_token_ids ?? []).length === 0 && (
                  <div
                    className="t-mut"
                    style={{ fontSize: 12 }}
                  >
                    No linked contracts.
                  </div>
                )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Top Holders</h3>
              <button
                className="btn ghost sm"
                onClick={() => setTab("holders")}
              >
                View all
              </button>
            </div>
            <div className="card-body">
              <TopHoldersCard marketId={marketId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sidebar G7 — its own `useHolders` hook (compact variant, top 5). */
function TopHoldersCard({ marketId }) {
  const { data, isLoading, isError } = useHolders(marketId, { limit: 5 });
  const items = data?.items ?? [];
  if (isError) {
    return (
      <div className="t-mut" style={{ fontSize: 12 }}>
        Failed to load holders.
      </div>
    );
  }
  return (
    <HoldersBar
      holders={items}
      compact
      loading={isLoading}
      empty={!isLoading && items.length === 0}
    />
  );
}
