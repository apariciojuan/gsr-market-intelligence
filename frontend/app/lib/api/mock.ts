/* GSR Market Intelligence — mockApi: the JSON-backed implementation of GsrApi.
 *
 * Implements EXACTLY the same `GsrApi` interface as `httpApi`. Reads the
 * fixtures in `lib/mocks/*.json` (shaped per API_CONTRACT.md) and reproduces
 * the contract's runtime semantics:
 *   - ~200ms simulated latency on every call
 *   - pagination: applies limit/offset/order/order_by, returns
 *     `{ items, total, limit, offset, has_more }`
 *   - errors: throws a typed `ApiError` for unknown slugs/ids/addresses
 *     (404 MARKET_NOT_FOUND, RESOLUTION_NOT_FOUND, etc.)
 *
 * Nothing here is imported by hooks/screens directly — the switch in
 * `index.ts` decides whether this or `httpApi` is live.
 */

import { ApiError } from "./error";
import type { GsrApi, TopMarketsNews } from "./interface";
import type {
  ActivityHeatmap,
  Calibration,
  CalibrationParams,
  ContractActivity,
  ContractActivityParams,
  ContractRead,
  ContractSummary,
  ContractTransaction,
  ContractTransactionsParams,
  DashboardSummary,
  DivergenceCard,
  EcoActiveMarkets,
  EcoByCategory,
  EcoIntervalParams,
  EcoSparkline,
  EcoSparklineParams,
  EcoVolume,
  EcosystemKpis,
  EcosystemWindowParams,
  ExploreRequest,
  ExploreResponse,
  HealthStatus,
  Holder,
  HoldersParams,
  LoginRequest,
  LoginResponse,
  MarketDetail,
  MarketListItem,
  MarketNewsParams,
  MarketPricesParams,
  MarketSearchParams,
  MarketsParams,
  Orderbook,
  OrderbookParams,
  Paginated,
  PaginationParams,
  PriceHistory,
  ResolutionDetail,
  ResolutionListItem,
  ResolutionStats,
  ResolutionStatsParams,
  ResolutionsParams,
  SearchParams,
  SearchResults,
  SignalDetail,
  SignalListItem,
  SignalsParams,
  Sparkline,
  SparklineParams,
  SyncStatus,
  TopMarketsParams,
  TopMarketsResponse,
  TopWallet,
  TopWalletsParams,
  Trade,
  TradesParams,
  UserRead,
} from "./types";

// --- fixtures ---
import authJson from "../mocks/auth.json";
import healthJson from "../mocks/health.json";
import marketsJson from "../mocks/markets.json";
import marketDetailJson from "../mocks/market-detail.json";
import marketPricesJson from "../mocks/market-prices.json";
import marketSparklineJson from "../mocks/market-sparkline.json";
import marketOrderbookJson from "../mocks/market-orderbook.json";
import marketHoldersJson from "../mocks/market-holders.json";
import marketTradesJson from "../mocks/market-trades.json";
import marketNewsJson from "../mocks/market-news.json";
import dashboardSummaryJson from "../mocks/dashboard-summary.json";
import dashboardTopMarketsJson from "../mocks/dashboard-top-markets.json";
import dashboardNotableDivergencesJson from "../mocks/dashboard-notable-divergences.json";
import contractsJson from "../mocks/contracts.json";
import contractSummaryJson from "../mocks/contract-summary.json";
import contractSyncStatusJson from "../mocks/contract-sync-status.json";
import contractActivityJson from "../mocks/contract-activity.json";
import contractTransactionsJson from "../mocks/contract-transactions.json";
import resolutionsJson from "../mocks/resolutions.json";
import resolutionDetailJson from "../mocks/resolution-detail.json";
import resolutionStatsJson from "../mocks/resolution-stats.json";
import signalsJson from "../mocks/signals.json";
import signalDetailJson from "../mocks/signal-detail.json";
import ecosystemKpisJson from "../mocks/ecosystem-kpis.json";
import ecosystemSparklineJson from "../mocks/ecosystem-sparkline.json";
import ecosystemVolumeJson from "../mocks/ecosystem-volume.json";
import ecosystemActiveMarketsJson from "../mocks/ecosystem-active-markets.json";
import ecosystemByCategoryJson from "../mocks/ecosystem-by-category.json";
import ecosystemCalibrationJson from "../mocks/ecosystem-calibration.json";
import ecosystemActivityHeatmapJson from "../mocks/ecosystem-activity-heatmap.json";
import ecosystemTopWalletsJson from "../mocks/ecosystem-top-wallets.json";
import searchJson from "../mocks/search.json";

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

const LATENCY_MS = 200;

/** Simulate network latency, then resolve with a structural clone of `data`. */
function respond<T>(data: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(clone(data)), LATENCY_MS);
  });
}

/** Reject after the simulated latency with a typed ApiError. */
function reject(status: number, code: string, detail: string): Promise<never> {
  return new Promise((_, rej) => {
    setTimeout(() => rej(new ApiError(status, { detail, code })), LATENCY_MS);
  });
}

/** Deep clone so callers can never mutate the shared fixture objects.
 *  `null`/`undefined` are passed through — `JSON.stringify(undefined)`
 *  returns `undefined`, which `JSON.parse` would choke on (e.g. the
 *  `void`-returning `auth.logout()` endpoint). */
function clone<T>(data: T): T {
  if (data == null) return data;
  return JSON.parse(JSON.stringify(data)) as T;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Apply the contract's standard pagination semantics to an in-memory array.
 * Mirrors API_CONTRACT.md §"Paginación": limit (default 50, max 200),
 * offset, order (asc/desc), order_by.
 */
function paginate<T>(
  all: T[],
  params: PaginationParams | undefined,
  defaultOrderBy?: keyof T
): Paginated<T> {
  const limit = Math.min(params?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = params?.offset ?? 0;
  const order = params?.order ?? "desc";
  const orderBy = (params?.order_by as keyof T | undefined) ?? defaultOrderBy;

  let rows = all;
  if (orderBy) {
    rows = [...all].sort((a, b) => {
      const av = a[orderBy];
      const bv = b[orderBy];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return order === "asc" ? cmp : -cmp;
    });
  }

  const items = rows.slice(offset, offset + limit);
  return {
    items,
    total: rows.length,
    limit,
    offset,
    has_more: offset + items.length < rows.length,
  };
}

// Typed views over the fixtures (the JSON imports are `any`-ish without this).
const MARKETS = (marketsJson as { items: MarketListItem[] }).items;
const MARKET_DETAIL = marketDetailJson as Record<string, MarketDetail>;
const MARKET_PRICES = marketPricesJson as Record<string, PriceHistory>;
const MARKET_SPARKLINE = marketSparklineJson as Record<string, Sparkline>;
const MARKET_ORDERBOOK = marketOrderbookJson as Record<string, Orderbook>;
const MARKET_HOLDERS = marketHoldersJson as Record<string, Holder[]>;
const MARKET_TRADES = marketTradesJson as Record<string, Trade[]>;
const MARKET_NEWS = marketNewsJson as Record<
  string,
  TopMarketsNews["items"]
>;
const CONTRACTS = contractsJson as Record<string, ContractRead>;
const CONTRACT_SUMMARY = contractSummaryJson as Record<string, ContractSummary>;
const CONTRACT_SYNC = contractSyncStatusJson as Record<string, SyncStatus>;
const CONTRACT_ACTIVITY = contractActivityJson as Record<
  string,
  ContractActivity
>;
const CONTRACT_TXS = contractTransactionsJson as Record<
  string,
  ContractTransaction[]
>;
const RESOLUTIONS = (resolutionsJson as { items: ResolutionListItem[] }).items;
const RESOLUTION_DETAIL = resolutionDetailJson as Record<
  string,
  ResolutionDetail
>;
const SIGNALS = (signalsJson as { items: SignalListItem[] }).items;
const SIGNAL_DETAIL = signalDetailJson as Record<string, SignalDetail>;
const ECO_SPARKLINE = ecosystemSparklineJson as Record<string, EcoSparkline>;
const SEARCH = searchJson as SearchResults["results"];

/** Resolve a market by slug, throwing 404 MARKET_NOT_FOUND if absent. */
function findMarketBySlug(slug: string): MarketListItem | undefined {
  return MARKETS.find((m) => m.slug === slug);
}

// ------------------------------------------------------------
// implementation
// ------------------------------------------------------------

export const mockApi: GsrApi = {
  auth: {
    login(body: LoginRequest): Promise<LoginResponse> {
      const { credentials, login_response } = authJson;
      if (
        body.username === credentials.username &&
        body.password === credentials.password
      ) {
        return respond(login_response as LoginResponse);
      }
      return reject(
        400,
        "LOGIN_BAD_CREDENTIALS",
        "Username or password is incorrect."
      );
    },
    logout(): Promise<void> {
      return respond(undefined as void);
    },
    me(): Promise<UserRead> {
      return respond(authJson.user as UserRead);
    },
  },

  health(): Promise<HealthStatus> {
    return respond(healthJson as HealthStatus);
  },

  dashboard: {
    summary(): Promise<DashboardSummary> {
      return respond(dashboardSummaryJson as DashboardSummary);
    },
    topMarkets(params?: TopMarketsParams): Promise<TopMarketsResponse> {
      const all = (
        dashboardTopMarketsJson as { items: TopMarketsResponse["items"] }
      ).items;
      const limit = params?.limit ?? 10;
      const items = all.slice(0, limit);
      return respond({ items, total: items.length });
    },
    notableDivergences(params?: { limit?: number }): Promise<DivergenceCard[]> {
      const all = (
        dashboardNotableDivergencesJson as { items: DivergenceCard[] }
      ).items;
      const limit = params?.limit ?? 3;
      return respond(all.slice(0, limit));
    },
  },

  markets: {
    list(params?: MarketsParams): Promise<Paginated<MarketListItem>> {
      let rows = MARKETS;
      // Filters per API_CONTRACT.md GET /markets.
      if (params?.category) {
        rows = rows.filter(
          (m) => m.category.toLowerCase() === params.category!.toLowerCase()
        );
      }
      const active = params?.active ?? "true";
      if (active !== "all") {
        rows = rows.filter((m) => m.active === (active === "true"));
      }
      const resolved = params?.resolved ?? "false";
      if (resolved !== "all") {
        rows = rows.filter((m) => m.resolved === (resolved === "true"));
      }
      return respond(paginate(rows, params, "volume_total"));
    },
    search(params: MarketSearchParams): Promise<Paginated<MarketListItem>> {
      const q = params.q.toLowerCase();
      const rows = MARKETS.filter(
        (m) =>
          m.question.toLowerCase().includes(q) ||
          m.slug.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      );
      const limit = params.limit ?? 10;
      return respond(paginate(rows, { limit }, "volume_total"));
    },
    detail(slug: string): Promise<MarketDetail> {
      const detail = MARKET_DETAIL[slug];
      if (!detail) {
        return reject(
          404,
          "MARKET_NOT_FOUND",
          `Market "${slug}" does not exist.`
        );
      }
      return respond(detail);
    },
    prices(id: number, _params: MarketPricesParams): Promise<PriceHistory> {
      const prices = MARKET_PRICES[String(id)];
      if (!prices) {
        return reject(
          404,
          "MARKET_NOT_FOUND",
          `Market ${id} does not exist.`
        );
      }
      return respond(prices);
    },
    sparkline(id: number, _params?: SparklineParams): Promise<Sparkline> {
      const spark = MARKET_SPARKLINE[String(id)];
      if (!spark) {
        return reject(404, "MARKET_NOT_FOUND", `Market ${id} does not exist.`);
      }
      return respond(spark);
    },
    orderbook(id: number, params?: OrderbookParams): Promise<Orderbook> {
      const ob = MARKET_ORDERBOOK[String(id)];
      if (!ob) {
        return reject(404, "MARKET_NOT_FOUND", `Market ${id} does not exist.`);
      }
      const depth = params?.depth ?? 20;
      const result: Orderbook = {
        ...ob,
        outcome: params?.outcome ?? "yes",
        bids: ob.bids.slice(0, depth),
        asks: ob.asks.slice(0, depth),
      };
      return respond(result);
    },
    holders(id: number, params?: HoldersParams): Promise<Paginated<Holder>> {
      const rows = MARKET_HOLDERS[String(id)];
      if (!rows) {
        return reject(404, "MARKET_NOT_FOUND", `Market ${id} does not exist.`);
      }
      let filtered = rows;
      if (params?.outcome) {
        filtered = rows.filter((h) => h.side === params.outcome);
      }
      return respond(
        paginate(filtered, { limit: params?.limit ?? 50 }, "rank")
      );
    },
    trades(id: number, params?: TradesParams): Promise<Paginated<Trade>> {
      const rows = MARKET_TRADES[String(id)];
      if (!rows) {
        return reject(404, "MARKET_NOT_FOUND", `Market ${id} does not exist.`);
      }
      let filtered = rows;
      if (params?.side) {
        filtered = rows.filter((t) => t.side === params.side);
      }
      return respond(paginate(filtered, params, "time"));
    },
    news(id: number, params?: MarketNewsParams): Promise<TopMarketsNews> {
      const rows = MARKET_NEWS[String(id)];
      if (!rows) {
        return reject(404, "MARKET_NOT_FOUND", `Market ${id} does not exist.`);
      }
      const minRel = params?.min_relevance ?? 0.5;
      let filtered = rows.filter(
        (n) => n.signal.relevance_score >= minRel
      );
      const limit = params?.limit ?? 20;
      const total = filtered.length;
      filtered = filtered.slice(0, limit);
      return respond({ items: filtered, total });
    },
  },

  contracts: {
    explore(body: ExploreRequest): Promise<ExploreResponse> {
      const address = body.address.toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(address)) {
        return reject(
          400,
          "INVALID_ADDRESS",
          "The address is not a valid Polygon address."
        );
      }
      const contract = CONTRACTS[address];
      if (contract) {
        // Already indexed → return ready directly.
        return respond<ExploreResponse>({
          status: "ready",
          address,
          contract,
        });
      }
      // Unknown address → simulate a queued indexing job.
      return respond<ExploreResponse>({
        status: "queued",
        job_id: "550e8400-e29b-41d4-a716-446655440000",
        address,
        estimated_seconds: 45,
      });
    },
    detail(address: string): Promise<ContractRead> {
      const contract = CONTRACTS[address.toLowerCase()];
      if (!contract) {
        return reject(
          404,
          "CONTRACT_NOT_FOUND",
          `Contract ${address} not found.`
        );
      }
      return respond(contract);
    },
    syncStatus(address: string): Promise<SyncStatus> {
      const status = CONTRACT_SYNC[address.toLowerCase()];
      if (!status) {
        return reject(
          404,
          "CONTRACT_NOT_FOUND",
          `Contract ${address} not found.`
        );
      }
      return respond(status);
    },
    summary(address: string): Promise<ContractSummary> {
      const summary = CONTRACT_SUMMARY[address.toLowerCase()];
      if (!summary) {
        return reject(
          404,
          "CONTRACT_NOT_FOUND",
          `Contract ${address} not found.`
        );
      }
      return respond(summary);
    },
    activity(
      address: string,
      _params?: ContractActivityParams
    ): Promise<ContractActivity> {
      const activity = CONTRACT_ACTIVITY[address.toLowerCase()];
      if (!activity) {
        return reject(
          404,
          "CONTRACT_NOT_FOUND",
          `Contract ${address} not found.`
        );
      }
      return respond(activity);
    },
    transactions(
      address: string,
      params?: ContractTransactionsParams
    ): Promise<Paginated<ContractTransaction>> {
      const rows = CONTRACT_TXS[address.toLowerCase()];
      if (!rows) {
        return reject(
          404,
          "CONTRACT_NOT_FOUND",
          `Contract ${address} not found.`
        );
      }
      let filtered = rows;
      if (params?.event_name) {
        filtered = filtered.filter(
          (t) => t.event_name === params.event_name
        );
      }
      if (params?.from_address) {
        filtered = filtered.filter(
          (t) =>
            t.from_address.toLowerCase() ===
            params.from_address!.toLowerCase()
        );
      }
      if (params?.to_address) {
        filtered = filtered.filter(
          (t) =>
            t.to_address.toLowerCase() === params.to_address!.toLowerCase()
        );
      }
      return respond(paginate(filtered, params, "block_number"));
    },
  },

  resolutions: {
    list(params?: ResolutionsParams): Promise<Paginated<ResolutionListItem>> {
      let rows = RESOLUTIONS;
      const status = params?.status ?? "all";
      if (status !== "all") {
        rows = rows.filter((r) => r.status === status);
      }
      if (params?.ends_within_hours != null) {
        const cutoff = params.ends_within_hours * 3600;
        rows = rows.filter(
          (r) =>
            r.seconds_remaining != null &&
            r.seconds_remaining <= cutoff
        );
      }
      if (params?.min_bond_usd != null) {
        rows = rows.filter((r) => r.bond_usd >= params.min_bond_usd!);
      }
      if (params?.q) {
        const q = params.q.toLowerCase();
        rows = rows.filter((r) =>
          r.market_question.toLowerCase().includes(q)
        );
      }
      return respond(paginate(rows, params, "request_timestamp"));
    },
    detail(questionId: string): Promise<ResolutionDetail> {
      const detail = RESOLUTION_DETAIL[questionId];
      if (!detail) {
        return reject(
          404,
          "RESOLUTION_NOT_FOUND",
          `Resolution "${questionId}" not found.`
        );
      }
      return respond(detail);
    },
    stats(_params?: ResolutionStatsParams): Promise<ResolutionStats> {
      return respond(resolutionStatsJson as ResolutionStats);
    },
  },

  signals: {
    list(params?: SignalsParams): Promise<Paginated<SignalListItem>> {
      let rows = SIGNALS;
      const status = params?.status ?? "active";
      if (status !== "all") {
        rows = rows.filter((s) => s.divergence.status === status);
      }
      if (params?.divergence_type && params.divergence_type !== "all") {
        rows = rows.filter(
          (s) => s.divergence.divergence_type === params.divergence_type
        );
      }
      const minSeverity = params?.min_severity ?? 1;
      rows = rows.filter((s) => s.divergence.severity >= minSeverity);
      // order_by maps onto the nested divergence; default by detected_at desc.
      const sorted = [...rows].sort((a, b) => {
        const cmp =
          Date.parse(a.divergence.detected_at) -
          Date.parse(b.divergence.detected_at);
        return (params?.order ?? "desc") === "asc" ? cmp : -cmp;
      });
      const limit = Math.min(params?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = params?.offset ?? 0;
      const items = sorted.slice(offset, offset + limit);
      return respond({
        items,
        total: sorted.length,
        limit,
        offset,
        has_more: offset + items.length < sorted.length,
      });
    },
    detail(id: number): Promise<SignalDetail> {
      const detail = SIGNAL_DETAIL[String(id)];
      if (!detail) {
        return reject(
          404,
          "DIVERGENCE_NOT_FOUND",
          `Divergence ${id} not found.`
        );
      }
      return respond(detail);
    },
  },

  ecosystem: {
    kpis(_params?: EcosystemWindowParams): Promise<EcosystemKpis> {
      return respond(ecosystemKpisJson as EcosystemKpis);
    },
    kpiSparkline(
      key: string,
      _params?: EcoSparklineParams
    ): Promise<EcoSparkline> {
      const spark = ECO_SPARKLINE[key];
      if (!spark) {
        return reject(
          404,
          "MARKET_NOT_FOUND",
          `KPI "${key}" has no sparkline.`
        );
      }
      return respond(spark);
    },
    volume(_params?: EcoIntervalParams): Promise<EcoVolume> {
      return respond(ecosystemVolumeJson as EcoVolume);
    },
    activeMarkets(_params?: EcoIntervalParams): Promise<EcoActiveMarkets> {
      return respond(ecosystemActiveMarketsJson as EcoActiveMarkets);
    },
    byCategory(_params?: EcosystemWindowParams): Promise<EcoByCategory> {
      return respond(ecosystemByCategoryJson as EcoByCategory);
    },
    calibration(_params?: CalibrationParams): Promise<Calibration> {
      return respond(ecosystemCalibrationJson as Calibration);
    },
    activityHeatmap(
      _params?: EcosystemWindowParams
    ): Promise<ActivityHeatmap> {
      return respond(ecosystemActivityHeatmapJson as ActivityHeatmap);
    },
    topWallets(params?: TopWalletsParams): Promise<Paginated<TopWallet>> {
      const all = (
        ecosystemTopWalletsJson as { items: TopWallet[] }
      ).items;
      const orderByMap: Record<string, keyof TopWallet> = {
        volume: "total_volume_usd",
        pnl: "realized_pnl_usd",
        trades: "trade_count",
        success_rate: "success_rate_pct",
      };
      const orderBy = orderByMap[params?.order_by ?? "volume"];
      return respond(
        paginate(all, { limit: params?.limit ?? 20, order: "desc" }, orderBy)
      );
    },
  },

  search(params: SearchParams): Promise<SearchResults> {
    const q = params.q.toLowerCase();
    const perGroup = params.limit_per_group ?? 3;
    const results: SearchResults["results"] = {
      markets: SEARCH.markets
        .filter((m) => m.question.toLowerCase().includes(q))
        .slice(0, perGroup),
      wallets: SEARCH.wallets
        .filter(
          (w) =>
            w.address.toLowerCase().includes(q) ||
            (w.label?.toLowerCase().includes(q) ?? false)
        )
        .slice(0, perGroup),
      contracts: SEARCH.contracts
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.address.toLowerCase().includes(q)
        )
        .slice(0, perGroup),
      tags: SEARCH.tags
        .filter((t) => t.name.toLowerCase().includes(q))
        .slice(0, perGroup),
    };
    return respond({ query: params.q, results });
  },
};

// Touch unused fixture import to keep tree-shaking honest (search index also
// exports a flat structure; `findMarketBySlug` is exported intent).
void findMarketBySlug;
