/* GSR Market Intelligence — the GsrApi interface.
 *
 * This is the contract that BOTH implementations (httpApi, mockApi) must satisfy
 * exactly. Hooks call `api.<domain>.<method>(...)` and never know which
 * implementation is behind it. One method per REST endpoint (35 total),
 * grouped by domain.
 */

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
  ExternalSignalRead,
  ExternalSignalsParams,
  DashboardSummary,
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
  NewsWithSignal,
  Orderbook,
  OrderbookParams,
  Paginated,
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

export interface GsrApi {
  // --- Auth (3 endpoints + health) ---
  auth: {
    /** POST /auth/jwt/login */
    login(body: LoginRequest): Promise<LoginResponse>;
    /** POST /auth/jwt/logout */
    logout(): Promise<void>;
    /** GET /users/me */
    me(): Promise<UserRead>;
  };

  /** GET /health */
  health(): Promise<HealthStatus>;

  // --- Dashboard (3 endpoints) ---
  dashboard: {
    /** GET /dashboard/summary */
    summary(): Promise<DashboardSummary>;
    /** GET /dashboard/top-markets */
    topMarkets(params?: TopMarketsParams): Promise<TopMarketsResponse>;
    /** GET /dashboard/notable-divergences */
    notableDivergences(params?: { limit?: number }): Promise<DivergenceCard[]>;
  };

  // --- Markets (9 endpoints) ---
  markets: {
    /** GET /markets */
    list(params?: MarketsParams): Promise<Paginated<MarketListItem>>;
    /** GET /markets/search */
    search(params: MarketSearchParams): Promise<Paginated<MarketListItem>>;
    /** GET /markets/{slug} */
    detail(slug: string): Promise<MarketDetail>;
    /** GET /markets/{id}/prices */
    prices(id: number, params: MarketPricesParams): Promise<PriceHistory>;
    /** GET /markets/{id}/sparkline */
    sparkline(id: number, params?: SparklineParams): Promise<Sparkline>;
    /** GET /markets/{id}/orderbook */
    orderbook(id: number, params?: OrderbookParams): Promise<Orderbook>;
    /** GET /markets/{id}/holders */
    holders(id: number, params?: HoldersParams): Promise<Paginated<Holder>>;
    /** GET /markets/{id}/trades */
    trades(id: number, params?: TradesParams): Promise<Paginated<Trade>>;
    /** GET /markets/{id}/news */
    news(id: number, params?: MarketNewsParams): Promise<TopMarketsNews>;
  };

  // --- Contracts (6 endpoints) ---
  contracts: {
    /** POST /contracts/explore */
    explore(body: ExploreRequest): Promise<ExploreResponse>;
    /** GET /contracts/{address} */
    detail(address: string): Promise<ContractRead>;
    /** GET /contracts/{address}/sync-status */
    syncStatus(address: string): Promise<SyncStatus>;
    /** GET /contracts/{address}/summary */
    summary(address: string): Promise<ContractSummary>;
    /** GET /contracts/{address}/activity */
    activity(
      address: string,
      params?: ContractActivityParams
    ): Promise<ContractActivity>;
    /** GET /contracts/{address}/transactions */
    transactions(
      address: string,
      params?: ContractTransactionsParams
    ): Promise<Paginated<ContractTransaction>>;
  };

  // --- Resolutions (3 endpoints) ---
  resolutions: {
    /** GET /resolutions */
    list(params?: ResolutionsParams): Promise<Paginated<ResolutionListItem>>;
    /** GET /resolutions/{questionId} */
    detail(questionId: string): Promise<ResolutionDetail>;
    /** GET /resolutions/stats */
    stats(params?: ResolutionStatsParams): Promise<ResolutionStats>;
  };

  // --- Signals (2 endpoints) ---
  signals: {
    /** GET /signals */
    list(params?: SignalsParams): Promise<Paginated<SignalListItem>>;
    /** GET /signals/{id} */
    detail(id: number): Promise<SignalDetail>;
  };

  // --- External signals (2 endpoints) ---
  externalSignals: {
    /** GET /external-signals */
    list(params?: ExternalSignalsParams): Promise<Paginated<ExternalSignalRead>>;
    /** GET /external-signals/{id} */
    detail(id: number): Promise<ExternalSignalRead>;
  };

  // --- Ecosystem (8 endpoints) ---
  ecosystem: {
    /** GET /ecosystem/kpis */
    kpis(params?: EcosystemWindowParams): Promise<EcosystemKpis>;
    /** GET /ecosystem/kpi/{key}/sparkline */
    kpiSparkline(key: string, params?: EcoSparklineParams): Promise<EcoSparkline>;
    /** GET /ecosystem/volume */
    volume(params?: EcoIntervalParams): Promise<EcoVolume>;
    /** GET /ecosystem/active-markets */
    activeMarkets(params?: EcoIntervalParams): Promise<EcoActiveMarkets>;
    /** GET /ecosystem/by-category */
    byCategory(params?: EcosystemWindowParams): Promise<EcoByCategory>;
    /** GET /ecosystem/calibration */
    calibration(params?: CalibrationParams): Promise<Calibration>;
    /** GET /ecosystem/activity-heatmap */
    activityHeatmap(params?: EcosystemWindowParams): Promise<ActivityHeatmap>;
    /** GET /ecosystem/top-wallets */
    topWallets(params?: TopWalletsParams): Promise<Paginated<TopWallet>>;
  };

  /** GET /search */
  search(params: SearchParams): Promise<SearchResults>;
}

/**
 * GET /markets/{id}/news returns `{ items, total }` (no offset/limit/has_more
 * in the contract example) — a lighter wrapper than `Paginated<T>`.
 */
export interface TopMarketsNews {
  items: NewsWithSignal[];
  total: number;
}
