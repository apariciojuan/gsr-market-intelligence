/* React Query hooks — Signals / Divergences domain (`/signals/*`). */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SignalsParams } from "../api/types";
import { queryKeys } from "./queryKeys";

/** GET /signals — active divergences (type/severity/status filters). */
export function useSignals(params?: SignalsParams) {
  return useQuery({
    queryKey: queryKeys.signals.list(params),
    queryFn: () => api.signals.list(params),
  });
}

/** GET /signals/{id} — divergence detail (G13 Market vs Chainlink). */
export function useSignal(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.signals.detail(id ?? 0),
    queryFn: () => api.signals.detail(id as number),
    enabled: !!id,
  });
}
