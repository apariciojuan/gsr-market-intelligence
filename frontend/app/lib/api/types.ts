/* GSR Market Intelligence — API types
 *
 * Derived literally from API_CONTRACT.md. This is the single source of truth
 * for every data shape that crosses the frontend/backend boundary.
 *
 * Conventions (API_CONTRACT.md §"Convenciones generales"):
 *  - Timestamps: ISO 8601 strings with UTC tz ("2026-05-11T14:32:00Z").
 *  - Ethereum addresses: lowercase strings.
 *  - Large (wei-like) amounts: strings (JS loses precision > 2^53).
 *  - USD amounts: numbers. Prices (0..1): numbers.
 */

// ============================================================
// §13 — Shared types
// ============================================================

/** Standard error body — always this shape (API_CONTRACT.md §"Errores estándar"). */
export interface ApiErrorBody {
  detail: string;
  code: string;
  /** Present only on validation errors. */
  field?: string | null;
}

/** Paginated list wrapper. `total` may be null for massive tables (hypertables). */
export interface Paginated<T> {
  items: T[];
  total: number | null;
  limit: number;
  offset: number;
  has_more: boolean;
}

export type SortOrder = "asc" | "desc";

/** Standard pagination query params accepted by list endpoints. */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  order?: SortOrder;
  order_by?: string;
}

/** Generic time-series point. */
export interface PricePoint {
  /** ISO timestamp. */
  t: string;
  v: number;
}

export type PriceSeries = PricePoint[];

export type DeltaDirection = "up" | "down" | "neutral";

// ============================================================
// Auth
// ============================================================

/** POST /auth/jwt/login */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /auth/jwt/login → 200 */
export interface LoginResponse {
  access_token: string;
  token_type: string;
}

/** GET /users/me → 200 */
export interface UserRead {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  created_at: string;
}

// ============================================================
// Health
// ============================================================

export type HealthComponentStatus = "ok" | "degraded" | "down";

/** GET /health → 200 / 503 */
export interface HealthStatus {
  status: HealthComponentStatus;
  database: HealthComponentStatus;
  redis: HealthComponentStatus;
  polygon_rpc: HealthComponentStatus;
  version: string;
  uptime_seconds: number;
}

// ============================================================
// Dashboard
// ============================================================

/** A single KPI tile. Shared by dashboard + ecosystem KPI strips. */
export interface KpiItem {
  key: string;
  label: string;
  value: number;
  value_formatted: string;
  delta_pct: number | null;
  delta_direction: DeltaDirection;
}

/** Active resolution teaser inside the dashboard summary. */
export interface DashboardActiveResolution {
  question_id: string;
  market_question: string;
  status: ResolutionStatus;
  bond_usd: number;
  ends_in_seconds: number;
  challenge_deadline: string;
}

/** GET /dashboard/summary → 200 */
export interface DashboardSummary {
  kpis: KpiItem[];
  active_resolutions: DashboardActiveResolution[];
}

/** Item of GET /dashboard/top-markets. */
export interface TopMarketItem {
  id: number;
  slug: string;
  question: string;
  category: string;
  price_yes: number;
  price_no: number;
  delta_pct_24h: number;
  volume_24h_usd: number;
  end_date: string;
  sparkline: number[];
}

/** GET /dashboard/top-markets → 200 */
export interface TopMarketsResponse {
  items: TopMarketItem[];
  total: number;
}

export type TopMarketsWindow = "1h" | "24h" | "7d";

export interface TopMarketsParams {
  limit?: number;
  window?: TopMarketsWindow;
}

// ============================================================
// Signals / Divergences (defined before Dashboard usage of DivergenceCard)
// ============================================================

export type DivergenceType =
  | "price_gap_vs_chainlink"
  | "news_not_reflected"
  | "sudden_move_no_signal"
  | "chainlink_move_no_market";

export type DivergenceDirection = "market_below" | "market_above";

export type DivergenceStatus = "active" | "closed";

/** Core divergence record. */
export interface DivergenceRead {
  id: number;
  market_id: number;
  divergence_type: DivergenceType;
  detected_at: string;
  last_updated_at: string;
  /** 1..5 */
  severity: number;
  magnitude_pct: number;
  direction: DivergenceDirection;
  market_value: number;
  external_value: number;
  external_source: string;
  time_window_minutes: number;
  status: DivergenceStatus;
}

/** Compact market reference embedded in signal/divergence payloads. */
export interface MarketRef {
  id: number;
  slug: string;
  question: string;
  category: string;
}

/** Mini chart data for a signal card. */
export interface SignalMiniChart {
  market_series: PriceSeries;
  external_series: PriceSeries;
}

/**
 * GET /dashboard/notable-divergences → 200 (array).
 * Contract describes it as "array of DivergenceCard"; shape mirrors a signal list item.
 */
export interface DivergenceCard {
  divergence: DivergenceRead;
  market: MarketRef;
  mini_chart_data: SignalMiniChart;
}

/** Item of GET /signals. */
export interface SignalListItem {
  divergence: DivergenceRead;
  market: MarketRef;
  mini_chart_data: SignalMiniChart;
}

export interface SignalsParams extends PaginationParams {
  divergence_type?: DivergenceType | "all";
  /** 1..5, default 1. */
  min_severity?: number;
  status?: DivergenceStatus | "all";
}

/** GET /signals/{id} → 200 */
export interface SignalDetail {
  divergence: DivergenceRead;
  market: MarketRead;
  market_series: PriceSeries;
  external_series: PriceSeries;
  detection_point: {
    t: string;
    market_value: number;
    external_value: number;
    magnitude_pct: number;
  };
  related_news: NewsItemRead[];
}

// ============================================================
// Markets
// ============================================================

/** Item of GET /markets and GET /markets/search. */
export interface MarketListItem {
  id: number;
  condition_id: string;
  slug: string;
  question: string;
  category: string;
  tags: string[];
  outcomes: string[];
  end_date: string;
  volume_total: number;
  liquidity: number;
  active: boolean;
  resolved: boolean;
}

/** Full market record (the embedded `market` in MarketDetail / referenced as MarketRead). */
export interface MarketRead {
  id: number;
  condition_id: string;
  question_id: string;
  slug: string;
  question: string;
  description: string;
  category: string;
  tags: string[];
  outcomes: string[];
  outcome_token_ids: string[];
  market_address: string;
  image_url: string;
  start_date: string;
  end_date: string;
  resolved: boolean;
  active: boolean;
  volume_total: number;
  liquidity: number;
  uma_adapter_version: string;
  uma_adapter_address: string;
  last_synced_at: string;
}

export interface MarketStats {
  volume_24h_usd: number;
  volume_7d_usd: number;
  trader_count: number;
  holder_count: number;
  open_interest_usd: number;
}

export interface MarketOutcomePrice {
  price: number;
  bid: number;
  ask: number;
  midpoint: number;
  spread: number;
}

export interface MarketCurrentPrices {
  yes: MarketOutcomePrice;
  no: MarketOutcomePrice;
}

export interface LinkedContract {
  address: string;
  type: string;
  name: string;
}

/** GET /markets/{slug} → 200 */
export interface MarketDetail {
  market: MarketRead;
  stats: MarketStats;
  current_prices: MarketCurrentPrices;
  linked_contracts: LinkedContract[];
  has_chainlink_overlay: boolean;
  chainlink_asset_pair: string | null;
}

export type MarketOrderBy =
  | "volume_total"
  | "liquidity"
  | "end_date"
  | "created_at";

export type TriState = "true" | "false" | "all";

export interface MarketsParams extends PaginationParams {
  order_by?: MarketOrderBy;
  category?: string;
  active?: TriState;
  resolved?: TriState;
}

export interface MarketSearchParams {
  q: string;
  limit?: number;
}

export type PriceInterval = "1m" | "1h" | "4h" | "1d" | "1w" | "max";

export interface MarketPricesParams {
  interval: PriceInterval;
  from?: string;
  to?: string;
  include_markers?: boolean;
  include_chainlink?: boolean;
  include_volume?: boolean;
}

export type VolumeDirection = "up" | "down";

export interface VolumePoint {
  t: string;
  v: number;
  direction: VolumeDirection;
}

export interface ChainlinkOverlay {
  asset_pair: string;
  feed_address: string;
  series: PriceSeries;
}

export type PriceMarkerType = "news" | "oracle_proposal";

export interface PriceMarkerNews {
  t: string;
  type: "news";
  title: string;
  url: string;
  source: string;
}

export interface PriceMarkerOracle {
  t: string;
  type: "oracle_proposal";
  proposer_address: string;
  bond_usd: number;
  outcome: string;
}

export type PriceMarker = PriceMarkerNews | PriceMarkerOracle;

export interface PriceHistoryStats {
  min_yes: number;
  max_yes: number;
  avg_yes: number;
  total_volume_usd: number;
}

/** GET /markets/{id}/prices → 200 */
export interface PriceHistory {
  market_id: number;
  interval: PriceInterval;
  from_time: string;
  to_time: string;
  series_yes: PriceSeries;
  series_no: PriceSeries;
  volume_series: VolumePoint[];
  chainlink_overlay: ChainlinkOverlay | null;
  markers: PriceMarker[];
  stats: PriceHistoryStats;
}

export interface SparklineParams {
  points?: number;
  window?: string;
}

/** GET /markets/{id}/sparkline → 200 */
export interface Sparkline {
  values: number[];
  direction: VolumeDirection;
}

export type OutcomeSide = "yes" | "no";

export interface OrderbookParams {
  outcome?: OutcomeSide;
  depth?: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
  cumulative_size: number;
}

/** GET /markets/{id}/orderbook → 200 */
export interface Orderbook {
  market_id: number;
  outcome: OutcomeSide;
  token_id: string;
  midpoint: number;
  spread: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  last_updated_at: string;
}

export interface HoldersParams {
  limit?: number;
  outcome?: OutcomeSide;
}

/** Item of GET /markets/{id}/holders. */
export interface Holder {
  rank: number;
  address: string;
  address_label: string | null;
  shares: string;
  side: OutcomeSide;
  avg_buy_price: number;
  value_usd: number;
  realized_pnl_usd: number;
  unrealized_pnl_usd: number;
  first_buy_at: string;
}

export type TradeSide = "buy" | "sell";

export interface TradesParams extends PaginationParams {
  from?: string;
  to?: string;
  side?: TradeSide;
}

/** Item of GET /markets/{id}/trades. */
export interface Trade {
  tx_hash: string;
  time: string;
  side: TradeSide;
  outcome: OutcomeSide;
  price: number;
  size: number;
  value_usd: number;
  trader_address: string;
  block_number: number;
}

export interface MarketNewsParams {
  limit?: number;
  min_relevance?: number;
  from?: string;
  to?: string;
}

export interface NewsItemRead {
  id: number;
  source: string;
  url: string;
  title: string;
  summary: string;
  published_at: string;
  language: string;
}

export interface NewsSignalRead {
  relevance_score: number;
  method: string;
}

/** Item of GET /markets/{id}/news. */
export interface NewsWithSignal {
  news: NewsItemRead;
  signal: NewsSignalRead;
}

// ============================================================
// Contracts
// ============================================================

export interface ContractLinkedMarket {
  id: number;
  slug: string;
  question: string;
}

/** GET /contracts/{address} → 200 (also embedded as ContractRead elsewhere). */
export interface ContractRead {
  id: number;
  address: string;
  chain_id: number;
  contract_type: string;
  name: string;
  symbol: string | null;
  decimals: number | null;
  abi_key: string;
  first_seen_block: number;
  metadata_json: Record<string, unknown>;
  polygonscan_url: string;
  linked_market: ContractLinkedMarket | null;
  created_at: string;
}

export interface ExploreRequest {
  address: string;
  from_block?: number | null;
  to_block?: number | null;
}

/** POST /contracts/explore → 200 (already cached). */
export interface ExploreReadyResponse {
  status: "ready";
  address: string;
  contract: ContractRead;
}

/** POST /contracts/explore → 202 (job queued). */
export interface ExploreQueuedResponse {
  status: "queued";
  job_id: string;
  address: string;
  estimated_seconds: number;
}

export type ExploreResponse = ExploreReadyResponse | ExploreQueuedResponse;

export type SyncStatusState = "idle" | "syncing" | "completed" | "error";

/** GET /contracts/{address}/sync-status → 200 */
export interface SyncStatus {
  address: string;
  sync_status: SyncStatusState;
  progress_pct: number;
  last_block_processed: number;
  current_polygon_block: number;
  blocks_remaining: number;
  events_found: number;
  started_at: string;
  estimated_completion_at: string | null;
  error_message: string | null;
}

/** GET /contracts/{address}/summary → 200 */
export interface ContractSummary {
  contract: ContractRead;
  total_transactions: number;
  unique_wallets: number;
  total_volume_usd: number;
  first_activity: string;
  last_activity: string;
  is_polymarket_market: boolean;
  linked_market: ContractLinkedMarket | null;
}

export type ContractActivityInterval = "1h" | "1d" | "1w" | "1m";

export interface ContractActivityParams {
  interval?: ContractActivityInterval;
  from?: string;
  to?: string;
}

export interface ContractActivityBucket {
  t: string;
  tx_count: number;
  unique_senders: number;
  volume_usd: number;
}

/** GET /contracts/{address}/activity → 200 */
export interface ContractActivity {
  address: string;
  interval: ContractActivityInterval;
  from_time: string;
  to_time: string;
  buckets: ContractActivityBucket[];
}

export interface ContractTransactionsParams extends PaginationParams {
  event_name?: string;
  from_address?: string;
  to_address?: string;
  from?: string;
  to?: string;
}

/** Item of GET /contracts/{address}/transactions. */
export interface ContractTransaction {
  tx_hash: string;
  log_index: number;
  block_number: number;
  time: string;
  event_name: string;
  from_address: string;
  to_address: string;
  decoded_args: Record<string, unknown>;
  value_usd: number;
  polygonscan_url: string;
}

// ============================================================
// Resolutions
// ============================================================

export type ResolutionStatus =
  | "pending"
  | "proposed"
  | "disputed"
  | "resolved";

/** Item of GET /resolutions. */
export interface ResolutionListItem {
  id: number;
  question_id: string;
  market_id: number;
  market_question: string;
  market_slug: string;
  adapter_version: string;
  adapter_address: string;
  status: ResolutionStatus;
  proposer_address: string | null;
  disputer_address: string | null;
  proposed_outcome: string | null;
  /** Final settled outcome (from the UMA Settle price); null until resolved. */
  resolved_outcome: string | null;
  bond_usd: number;
  counter_bond_usd: number | null;
  request_timestamp: string;
  proposal_timestamp: string | null;
  challenge_deadline: string | null;
  seconds_remaining: number | null;
  uma_oracle_url: string;
  is_urgent: boolean;
}

export interface ResolutionsParams extends PaginationParams {
  status?: ResolutionStatus | "all";
  ends_within_hours?: number;
  min_bond_usd?: number;
  q?: string;
}

export type ResolutionPhase =
  | "initialized"
  | "proposed"
  | "challenge"
  | "dvm_vote"
  | "resolved";

export interface ResolutionTimelineEntry {
  phase: ResolutionPhase;
  timestamp: string | null;
  completed: boolean;
  data: Record<string, unknown> | null;
  tx_hash?: string;
}

export interface ResolutionDispute {
  disputer_address: string;
  counter_bond_usd: number;
  disputed_at: string;
  reason: string | null;
}

export interface ResolutionMarketImpactChart {
  from_time: string;
  to_time: string;
  price_series_yes: PriceSeries;
}

/** GET /resolutions/{questionId} → 200 */
export interface ResolutionDetail {
  question_id: string;
  market: MarketRead | null;
  current_phase: ResolutionPhase;
  is_disputed: boolean;
  is_resolved: boolean;
  /** Final settled outcome (from the UMA Settle price); null until resolved. */
  resolved_outcome: string | null;
  ancillary_data_decoded: string;
  timeline: ResolutionTimelineEntry[];
  dispute: ResolutionDispute | null;
  market_impact_chart: ResolutionMarketImpactChart;
  uma_oracle_url: string;
}

export type ResolutionStatsWindow = "7d" | "30d" | "90d" | "1y" | "all";

export interface ResolutionStatsParams {
  window?: ResolutionStatsWindow;
}

export interface BondHistogramBucket {
  bucket: string;
  count: number;
}

/** GET /resolutions/stats → 200 */
export interface ResolutionStats {
  window: ResolutionStatsWindow;
  total_resolutions: number;
  disputed_count: number;
  dispute_rate_pct: number;
  avg_resolution_seconds: number;
  bond_histogram: BondHistogramBucket[];
}

// ============================================================
// Ecosystem
// ============================================================

export interface EcosystemWindowParams {
  window?: string;
}

/** GET /ecosystem/kpis → 200 */
export interface EcosystemKpis {
  kpis: KpiItem[];
}

export interface EcoSparklineParams {
  points?: number;
}

/** GET /ecosystem/kpi/{key}/sparkline → 200 */
export interface EcoSparkline {
  key: string;
  values: number[];
  direction: VolumeDirection;
}

export type EcoInterval = "1d" | "1w" | "1m";

export interface EcoIntervalParams {
  interval?: EcoInterval;
  from?: string;
  to?: string;
}

export interface EcoVolumeBucket {
  t: string;
  volume_usd: number;
  new_markets: number;
}

/** GET /ecosystem/volume → 200 */
export interface EcoVolume {
  interval: EcoInterval;
  from_time: string;
  to_time: string;
  buckets: EcoVolumeBucket[];
}

export interface EcoActiveMarketsBucket {
  t: string;
  active_count: number;
}

/** GET /ecosystem/active-markets → 200 */
export interface EcoActiveMarkets {
  interval: EcoInterval;
  buckets: EcoActiveMarketsBucket[];
}

export interface EcoCategory {
  name: string;
  volume_usd: number;
  share_pct: number;
  color: string;
}

/** GET /ecosystem/by-category → 200 */
export interface EcoByCategory {
  window: string;
  total_volume_usd: number;
  categories: EcoCategory[];
}

export interface CalibrationParams {
  window?: "90d" | "1y" | "all";
  category?: string;
}

export interface CalibrationMarket {
  id: number;
  slug: string;
  question: string;
  implied_prob_avg: number;
  /** 0 or 1. */
  outcome: number;
  category: string;
  volume_usd: number;
}

export interface CalibrationBucket {
  range: string;
  predicted_avg: number;
  actual_rate: number;
  count: number;
}

/** GET /ecosystem/calibration → 200 */
export interface Calibration {
  window: string;
  category: string;
  markets_count: number;
  markets: CalibrationMarket[];
  buckets: CalibrationBucket[];
  overall_brier_score: number;
}

export interface ActivityHeatmapCell {
  /** 0..6 */
  day: number;
  /** 0..23 */
  hour: number;
  tx_count: number;
}

/** GET /ecosystem/activity-heatmap → 200 */
export interface ActivityHeatmap {
  window: string;
  matrix: ActivityHeatmapCell[];
}

export type TopWalletsOrderBy = "volume" | "pnl" | "trades" | "success_rate";

export interface TopWalletsParams {
  limit?: number;
  order_by?: TopWalletsOrderBy;
  window?: string;
}

/** Item of GET /ecosystem/top-wallets. */
export interface TopWallet {
  address: string;
  address_label: string | null;
  total_volume_usd: number;
  trade_count: number;
  market_count: number;
  realized_pnl_usd: number;
  success_rate_pct: number;
  first_seen_at: string;
}

// ============================================================
// Global search
// ============================================================

export interface SearchParams {
  q: string;
  limit_per_group?: number;
}

export interface SearchMarketResult {
  id: number;
  slug: string;
  question: string;
  category: string;
}

export interface SearchWalletResult {
  address: string;
  label: string | null;
  total_volume_usd: number;
}

export interface SearchContractResult {
  address: string;
  type: string;
  name: string;
}

export interface SearchTagResult {
  name: string;
  market_count: number;
}

/** GET /search → 200 */
export interface SearchResults {
  query: string;
  results: {
    markets: SearchMarketResult[];
    wallets: SearchWalletResult[];
    contracts: SearchContractResult[];
    tags: SearchTagResult[];
  };
}
