/* GSR Market Intelligence — React Query client.
 *
 * Single shared QueryClient instance, wired into `_app.jsx` via
 * <QueryClientProvider>. Defaults chosen for a data terminal that polls a
 * REST API (see API_CONTRACT.md §"Caching recomendado"):
 *   - staleTime 30s: most endpoints are Redis-cached 30-60s server-side.
 *   - retry once: a transient failure retries, but a real 404 (ApiError)
 *     is not worth retrying.
 *   - no refetch on window focus: avoids hammering the backend on tab
 *     switches; screens that need live data opt into `refetchInterval`.
 */

import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/error";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry deterministic client errors (404/400/401/403).
        if (ApiError.is(error) && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
