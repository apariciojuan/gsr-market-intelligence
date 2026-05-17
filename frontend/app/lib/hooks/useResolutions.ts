/* React Query hooks — Resolutions / Watchdog domain (`/resolutions/*`). */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ResolutionStatsParams,
  ResolutionsParams,
} from "../api/types";
import { queryKeys } from "./queryKeys";

/** GET /resolutions — Watchdog table (status/bond/deadline filters). */
export function useResolutions(params?: ResolutionsParams) {
  return useQuery({
    queryKey: queryKeys.resolutions.list(params),
    queryFn: () => api.resolutions.list(params),
  });
}

/** GET /resolutions/{questionId} — full resolution cycle (G10 timeline). */
export function useResolution(questionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.resolutions.detail(questionId ?? ""),
    queryFn: () => api.resolutions.detail(questionId as string),
    enabled: !!questionId,
  });
}

/** GET /resolutions/stats — aggregate stats banner + bond histogram (G11). */
export function useResolutionStats(params?: ResolutionStatsParams) {
  return useQuery({
    queryKey: queryKeys.resolutions.stats(params),
    queryFn: () => api.resolutions.stats(params),
  });
}
