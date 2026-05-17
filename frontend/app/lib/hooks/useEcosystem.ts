/* React Query hooks — Ecosystem domain (`/ecosystem/*`).
 *
 * Ecosystem endpoints are heavily cached server-side (5 min, per
 * API_CONTRACT.md) — the default `staleTime` is fine for all of them.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CalibrationParams,
  EcoIntervalParams,
  EcoSparklineParams,
  EcosystemWindowParams,
  TopWalletsParams,
} from "../api/types";
import { queryKeys } from "./queryKeys";

/** GET /ecosystem/kpis — KPI strip. */
export function useEcosystemKpis(params?: EcosystemWindowParams) {
  return useQuery({
    queryKey: queryKeys.ecosystem.kpis(params),
    queryFn: () => api.ecosystem.kpis(params),
  });
}

/** GET /ecosystem/kpi/{key}/sparkline — sparkline for one KPI card (G1). */
export function useEcoKpiSparkline(
  key: string | undefined,
  params?: EcoSparklineParams
) {
  return useQuery({
    queryKey: queryKeys.ecosystem.kpiSparkline(key ?? "", params),
    queryFn: () => api.ecosystem.kpiSparkline(key as string, params),
    enabled: !!key,
  });
}

/** GET /ecosystem/volume — total volume per interval (G14). */
export function useEcoVolume(params?: EcoIntervalParams) {
  return useQuery({
    queryKey: queryKeys.ecosystem.volume(params),
    queryFn: () => api.ecosystem.volume(params),
  });
}

/** GET /ecosystem/active-markets — active markets over time (G15). */
export function useEcoActiveMarkets(params?: EcoIntervalParams) {
  return useQuery({
    queryKey: queryKeys.ecosystem.activeMarkets(params),
    queryFn: () => api.ecosystem.activeMarkets(params),
  });
}

/** GET /ecosystem/by-category — volume breakdown by category (G16). */
export function useEcoByCategory(params?: EcosystemWindowParams) {
  return useQuery({
    queryKey: queryKeys.ecosystem.byCategory(params),
    queryFn: () => api.ecosystem.byCategory(params),
  });
}

/** GET /ecosystem/calibration — calibration scatter (G17). */
export function useCalibration(params?: CalibrationParams) {
  return useQuery({
    queryKey: queryKeys.ecosystem.calibration(params),
    queryFn: () => api.ecosystem.calibration(params),
  });
}

/** GET /ecosystem/activity-heatmap — hour x day heatmap (G18). */
export function useActivityHeatmap(params?: EcosystemWindowParams) {
  return useQuery({
    queryKey: queryKeys.ecosystem.activityHeatmap(params),
    queryFn: () => api.ecosystem.activityHeatmap(params),
  });
}

/** GET /ecosystem/top-wallets — most active wallets table. */
export function useTopWallets(params?: TopWalletsParams) {
  return useQuery({
    queryKey: queryKeys.ecosystem.topWallets(params),
    queryFn: () => api.ecosystem.topWallets(params),
  });
}
