/* React Query hooks — Markets domain (`GET /markets/*`).
 *
 * Wraps `api.markets.*`. Detail/sub-resource hooks accept the market id (or
 * slug for the heavy detail endpoint) and are `enabled`-gated so they don't
 * fire with an empty identifier during routing.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  HoldersParams,
  MarketNewsParams,
  MarketPricesParams,
  MarketSearchParams,
  MarketsParams,
  OrderbookParams,
  SparklineParams,
  TradesParams,
} from "../api/types";
import { queryKeys } from "./queryKeys";

/** GET /markets — paginated list with category/active/resolved filters. */
export function useMarkets(params?: MarketsParams) {
  return useQuery({
    queryKey: queryKeys.markets.list(params),
    queryFn: () => api.markets.list(params),
  });
}

/** GET /markets/search — keyword search (min 2 chars). */
export function useMarketSearch(params: MarketSearchParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.markets.search(params),
    queryFn: () => api.markets.search(params),
    enabled: enabled && params.q.trim().length >= 2,
  });
}

/** GET /markets/{slug} — heavy market detail (one call per screen). */
export function useMarket(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.markets.detail(slug ?? ""),
    queryFn: () => api.markets.detail(slug as string),
    enabled: !!slug,
  });
}

/** GET /markets/{id}/prices — price/volume/chainlink series for G3/G4/G5. */
export function useMarketPrices(
  id: number | undefined,
  params: MarketPricesParams
) {
  return useQuery({
    queryKey: queryKeys.markets.prices(id ?? 0, params),
    queryFn: () => api.markets.prices(id as number, params),
    enabled: !!id,
  });
}

/** GET /markets/{id}/sparkline — mini chart for tables (G2). */
export function useMarketSparkline(
  id: number | undefined,
  params?: SparklineParams
) {
  return useQuery({
    queryKey: queryKeys.markets.sparkline(id ?? 0, params),
    queryFn: () => api.markets.sparkline(id as number, params),
    enabled: !!id,
  });
}

/** GET /markets/{id}/orderbook — depth chart (G6). Live data, short stale. */
export function useOrderbook(
  id: number | undefined,
  params?: OrderbookParams
) {
  return useQuery({
    queryKey: queryKeys.markets.orderbook(id ?? 0, params),
    queryFn: () => api.markets.orderbook(id as number, params),
    enabled: !!id,
    staleTime: 0,
  });
}

/** GET /markets/{id}/holders — top holders (G7 + Holders tab). */
export function useHolders(id: number | undefined, params?: HoldersParams) {
  return useQuery({
    queryKey: queryKeys.markets.holders(id ?? 0, params),
    queryFn: () => api.markets.holders(id as number, params),
    enabled: !!id,
  });
}

/** GET /markets/{id}/trades — trade history (Trades tab). */
export function useTrades(id: number | undefined, params?: TradesParams) {
  return useQuery({
    queryKey: queryKeys.markets.trades(id ?? 0, params),
    queryFn: () => api.markets.trades(id as number, params),
    enabled: !!id,
  });
}

/** GET /markets/{id}/news — associated news (Signals tab). */
export function useMarketNews(
  id: number | undefined,
  params?: MarketNewsParams
) {
  return useQuery({
    queryKey: queryKeys.markets.news(id ?? 0, params),
    queryFn: () => api.markets.news(id as number, params),
    enabled: !!id,
  });
}
