/* React Query hooks — External signals domain (`/external-signals/*`). */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { ExternalSignalsParams } from "../api/types";
import { queryKeys } from "./queryKeys";

/** GET /external-signals — paginated feed of RSS / X / Telegram signals. */
export function useExternalSignals(params?: ExternalSignalsParams) {
  return useQuery({
    queryKey: queryKeys.externalSignals.list(params),
    queryFn: () => api.externalSignals.list(params),
  });
}

/** GET /external-signals/{id} — single external signal detail. */
export function useExternalSignal(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.externalSignals.detail(id ?? 0),
    queryFn: () => api.externalSignals.detail(id as number),
    enabled: !!id,
  });
}
