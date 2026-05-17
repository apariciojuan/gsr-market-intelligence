/* React Query hooks — Contracts domain (`/contracts/*`).
 *
 * `useExploreContract` is a mutation (POST /contracts/explore). `useSyncStatus`
 * supports polling via `pollWhileSyncing` so the contract screen can watch an
 * indexing job complete (API_CONTRACT.md: "polling tras explore").
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContractActivityParams,
  ContractTransactionsParams,
  ExploreRequest,
} from "../api/types";
import { queryKeys } from "./queryKeys";

/** POST /contracts/explore — kick off (or short-circuit) contract indexing. */
export function useExploreContract() {
  return useMutation({
    mutationFn: (body: ExploreRequest) => api.contracts.explore(body),
  });
}

/** GET /contracts/{address} — detected contract info. */
export function useContract(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.detail(address ?? ""),
    queryFn: () => api.contracts.detail(address as string),
    enabled: !!address,
  });
}

/**
 * GET /contracts/{address}/sync-status — indexing progress.
 * When `pollWhileSyncing` is true, refetches every 3s until the job is
 * `completed` or `error`.
 */
export function useSyncStatus(
  address: string | undefined,
  pollWhileSyncing = false
) {
  return useQuery({
    queryKey: queryKeys.contracts.syncStatus(address ?? ""),
    queryFn: () => api.contracts.syncStatus(address as string),
    enabled: !!address,
    staleTime: 0,
    refetchInterval: (query) => {
      if (!pollWhileSyncing) return false;
      const status = query.state.data?.sync_status;
      return status === "syncing" || status === "idle" ? 3000 : false;
    },
  });
}

/** GET /contracts/{address}/summary — aggregated header stats. */
export function useContractSummary(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contracts.summary(address ?? ""),
    queryFn: () => api.contracts.summary(address as string),
    enabled: !!address,
  });
}

/** GET /contracts/{address}/activity — buckets for G8/G9. */
export function useContractActivity(
  address: string | undefined,
  params?: ContractActivityParams
) {
  return useQuery({
    queryKey: queryKeys.contracts.activity(address ?? "", params),
    queryFn: () => api.contracts.activity(address as string, params),
    enabled: !!address,
  });
}

/** GET /contracts/{address}/transactions — paginated transaction table. */
export function useContractTransactions(
  address: string | undefined,
  params?: ContractTransactionsParams
) {
  return useQuery({
    queryKey: queryKeys.contracts.transactions(address ?? "", params),
    queryFn: () => api.contracts.transactions(address as string, params),
    enabled: !!address,
  });
}
