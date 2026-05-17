/* React Query hooks — Dashboard domain (`GET /dashboard/*`).
 *
 * Each hook wraps a single `api.dashboard.*` method. Hooks never touch JSON
 * or fetch directly — they go through `api`, so the mock/http switch is
 * transparent.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { TopMarketsParams } from "../api/types";
import { queryKeys } from "./queryKeys";

/** GET /dashboard/summary — full dashboard payload in one call. */
export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: () => api.dashboard.summary(),
  });
}

/** GET /dashboard/top-markets — "Top Markets — Last 24h" table. */
export function useTopMarkets(params?: TopMarketsParams) {
  return useQuery({
    queryKey: queryKeys.dashboard.topMarkets(params),
    queryFn: () => api.dashboard.topMarkets(params),
  });
}

/** GET /dashboard/notable-divergences — "Notable Divergences" cards. */
export function useNotableDivergences(limit?: number) {
  return useQuery({
    queryKey: queryKeys.dashboard.notableDivergences(limit),
    queryFn: () => api.dashboard.notableDivergences({ limit }),
  });
}
