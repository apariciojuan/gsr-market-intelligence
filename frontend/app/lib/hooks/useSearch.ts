/* React Query hooks — global search + misc singletons. */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SearchParams } from "../api/types";
import { queryKeys } from "./queryKeys";

/**
 * GET /search — global grouped search (⌘K). Gated on a 2-char minimum so it
 * doesn't fire on every keystroke (matches the contract's `min 2 chars`).
 */
export function useSearch(params: SearchParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.search(params),
    queryFn: () => api.search(params),
    enabled: enabled && params.q.trim().length >= 2,
  });
}

/** GET /health — public healthcheck. */
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: () => api.health(),
  });
}
