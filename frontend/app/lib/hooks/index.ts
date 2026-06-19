/* React Query hooks — barrel export.
 *
 * Screens import hooks from `@/lib/hooks`. Every hook ultimately goes through
 * `api` (the mock/http switch), so screens never know the data source.
 */

export * from "./queryKeys";
export * from "./useDashboard";
export * from "./useMarkets";
export * from "./useContracts";
export * from "./useResolutions";
export * from "./useSignals";
export * from "./useExternalSignals";
export * from "./useEcosystem";
export * from "./useSearch";
export * from "./useUser";
