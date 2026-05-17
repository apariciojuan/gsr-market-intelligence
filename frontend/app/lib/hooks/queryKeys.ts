/* GSR Market Intelligence — centralized React Query keys.
 *
 * One place to define every queryKey so they stay structured and consistent
 * (and so invalidation from mutations can target them precisely). Keys are
 * arrays: [domain, resource, ...identifiers, params?].
 */

import type {
  CalibrationParams,
  ContractActivityParams,
  ContractTransactionsParams,
  EcoIntervalParams,
  EcoSparklineParams,
  EcosystemWindowParams,
  HoldersParams,
  MarketNewsParams,
  MarketPricesParams,
  MarketSearchParams,
  MarketsParams,
  OrderbookParams,
  ResolutionStatsParams,
  ResolutionsParams,
  SearchParams,
  SignalsParams,
  SparklineParams,
  TopMarketsParams,
  TopWalletsParams,
  TradesParams,
} from "../api/types";

export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  health: () => ["health"] as const,
  dashboard: {
    summary: () => ["dashboard", "summary"] as const,
    topMarkets: (params?: TopMarketsParams) =>
      ["dashboard", "top-markets", params ?? {}] as const,
    notableDivergences: (limit?: number) =>
      ["dashboard", "notable-divergences", { limit }] as const,
  },
  markets: {
    list: (params?: MarketsParams) => ["markets", "list", params ?? {}] as const,
    search: (params: MarketSearchParams) =>
      ["markets", "search", params] as const,
    detail: (slug: string) => ["markets", "detail", slug] as const,
    prices: (id: number, params: MarketPricesParams) =>
      ["markets", "prices", id, params] as const,
    sparkline: (id: number, params?: SparklineParams) =>
      ["markets", "sparkline", id, params ?? {}] as const,
    orderbook: (id: number, params?: OrderbookParams) =>
      ["markets", "orderbook", id, params ?? {}] as const,
    holders: (id: number, params?: HoldersParams) =>
      ["markets", "holders", id, params ?? {}] as const,
    trades: (id: number, params?: TradesParams) =>
      ["markets", "trades", id, params ?? {}] as const,
    news: (id: number, params?: MarketNewsParams) =>
      ["markets", "news", id, params ?? {}] as const,
  },
  contracts: {
    detail: (address: string) => ["contracts", "detail", address] as const,
    syncStatus: (address: string) =>
      ["contracts", "sync-status", address] as const,
    summary: (address: string) => ["contracts", "summary", address] as const,
    activity: (address: string, params?: ContractActivityParams) =>
      ["contracts", "activity", address, params ?? {}] as const,
    transactions: (address: string, params?: ContractTransactionsParams) =>
      ["contracts", "transactions", address, params ?? {}] as const,
  },
  resolutions: {
    list: (params?: ResolutionsParams) =>
      ["resolutions", "list", params ?? {}] as const,
    detail: (questionId: string) =>
      ["resolutions", "detail", questionId] as const,
    stats: (params?: ResolutionStatsParams) =>
      ["resolutions", "stats", params ?? {}] as const,
  },
  signals: {
    list: (params?: SignalsParams) => ["signals", "list", params ?? {}] as const,
    detail: (id: number) => ["signals", "detail", id] as const,
  },
  ecosystem: {
    kpis: (params?: EcosystemWindowParams) =>
      ["ecosystem", "kpis", params ?? {}] as const,
    kpiSparkline: (key: string, params?: EcoSparklineParams) =>
      ["ecosystem", "kpi-sparkline", key, params ?? {}] as const,
    volume: (params?: EcoIntervalParams) =>
      ["ecosystem", "volume", params ?? {}] as const,
    activeMarkets: (params?: EcoIntervalParams) =>
      ["ecosystem", "active-markets", params ?? {}] as const,
    byCategory: (params?: EcosystemWindowParams) =>
      ["ecosystem", "by-category", params ?? {}] as const,
    calibration: (params?: CalibrationParams) =>
      ["ecosystem", "calibration", params ?? {}] as const,
    activityHeatmap: (params?: EcosystemWindowParams) =>
      ["ecosystem", "activity-heatmap", params ?? {}] as const,
    topWallets: (params?: TopWalletsParams) =>
      ["ecosystem", "top-wallets", params ?? {}] as const,
  },
  search: (params: SearchParams) => ["search", params] as const,
};
