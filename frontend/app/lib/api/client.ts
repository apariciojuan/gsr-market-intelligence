/* GSR Market Intelligence — httpApi: the real HTTP implementation of GsrApi.
 *
 * fetch wrapper that:
 *  - prefixes every path with NEXT_PUBLIC_API_URL
 *  - attaches `Authorization: Bearer <token>` when a token is stored
 *  - serializes query params (skipping undefined / null)
 *  - parses the standard error body and throws a typed `ApiError`
 *  - tolerates `total: null` in paginated responses (massive tables)
 *
 * This file knows nothing about mocks. The switch in `index.ts` decides
 * whether this or `mockApi` is used.
 */

import { ApiError } from "./error";
import type { GsrApi, TopMarketsNews } from "./interface";
import { getToken } from "./token";
import type {
  ActivityHeatmap,
  ApiErrorBody,
  Calibration,
  CalibrationParams,
  ContractActivity,
  ContractActivityParams,
  ContractRead,
  ContractSummary,
  ContractTransaction,
  ContractTransactionsParams,
  DashboardSummary,
  DivergenceCard,
  EcoActiveMarkets,
  EcoByCategory,
  EcoIntervalParams,
  EcoSparkline,
  EcoSparklineParams,
  EcoVolume,
  EcosystemKpis,
  EcosystemWindowParams,
  ExploreRequest,
  ExploreResponse,
  HealthStatus,
  Holder,
  HoldersParams,
  LoginRequest,
  LoginResponse,
  MarketDetail,
  MarketListItem,
  MarketNewsParams,
  MarketPricesParams,
  MarketSearchParams,
  MarketsParams,
  Orderbook,
  OrderbookParams,
  Paginated,
  PriceHistory,
  ResolutionDetail,
  ResolutionListItem,
  ResolutionStats,
  ResolutionStatsParams,
  ResolutionsParams,
  SearchParams,
  SearchResults,
  SignalDetail,
  SignalListItem,
  SignalsParams,
  Sparkline,
  SparklineParams,
  SyncStatus,
  TopMarketsParams,
  TopMarketsResponse,
  TopWallet,
  TopWalletsParams,
  Trade,
  TradesParams,
  UserRead,
} from "./types";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue>;

/** Build a `?a=1&b=2` string, skipping undefined/null values. */
function buildQuery(params?: Query): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    usp.append(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Query;
  /** JSON body. */
  json?: unknown;
  /** form-urlencoded body (fastapi-users login requires this). */
  form?: Record<string, string>;
}

/** Core request: assembles URL/headers, parses errors into ApiError. */
async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, json, form } = opts;
  const url = `${BASE_URL}${path}${buildQuery(query)}`;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body });
  } catch (networkErr) {
    // DNS/refused/offline — surface as a typed error so callers can handle it.
    throw new ApiError(0, {
      detail:
        networkErr instanceof Error
          ? `Network error: ${networkErr.message}`
          : "Network error",
      code: "NETWORK_ERROR",
    });
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const parsed: unknown = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, toErrorBody(parsed, res.status));
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Coerce whatever the server returned into the standard error body shape. */
function toErrorBody(parsed: unknown, status: number): ApiErrorBody {
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    return {
      detail:
        typeof obj.detail === "string"
          ? obj.detail
          : `Request failed with status ${status}`,
      code: typeof obj.code === "string" ? obj.code : `HTTP_${status}`,
      field: typeof obj.field === "string" ? obj.field : null,
    };
  }
  return {
    detail:
      typeof parsed === "string" && parsed
        ? parsed
        : `Request failed with status ${status}`,
    code: `HTTP_${status}`,
  };
}

/**
 * Normalize a paginated response: if the server omits `total` (massive tables),
 * the contract permits `total: null`. We make sure the field is always present
 * so the UI can rely on it.
 */
function normalizePaginated<T>(raw: Paginated<T>): Paginated<T> {
  return {
    items: raw.items ?? [],
    total: raw.total ?? null,
    limit: raw.limit,
    offset: raw.offset,
    has_more: raw.has_more,
  };
}

export const httpApi: GsrApi = {
  auth: {
    login(body: LoginRequest): Promise<LoginResponse> {
      // fastapi-users expects form-urlencoded.
      return request<LoginResponse>("/auth/jwt/login", {
        method: "POST",
        form: { username: body.username, password: body.password },
      });
    },
    logout(): Promise<void> {
      return request<void>("/auth/jwt/logout", { method: "POST" });
    },
    me(): Promise<UserRead> {
      return request<UserRead>("/users/me");
    },
  },

  health(): Promise<HealthStatus> {
    return request<HealthStatus>("/health");
  },

  dashboard: {
    summary(): Promise<DashboardSummary> {
      return request<DashboardSummary>("/dashboard/summary");
    },
    topMarkets(params?: TopMarketsParams): Promise<TopMarketsResponse> {
      return request<TopMarketsResponse>("/dashboard/top-markets", {
        query: params as Query,
      });
    },
    notableDivergences(params?: { limit?: number }): Promise<DivergenceCard[]> {
      return request<DivergenceCard[]>("/dashboard/notable-divergences", {
        query: params as Query,
      });
    },
  },

  markets: {
    async list(params?: MarketsParams): Promise<Paginated<MarketListItem>> {
      return normalizePaginated(
        await request<Paginated<MarketListItem>>("/markets", {
          query: params as Query,
        })
      );
    },
    async search(
      params: MarketSearchParams
    ): Promise<Paginated<MarketListItem>> {
      return normalizePaginated(
        await request<Paginated<MarketListItem>>("/markets/search", {
          query: params as unknown as Query,
        })
      );
    },
    detail(slug: string): Promise<MarketDetail> {
      return request<MarketDetail>(`/markets/${encodeURIComponent(slug)}`);
    },
    prices(id: number, params: MarketPricesParams): Promise<PriceHistory> {
      return request<PriceHistory>(`/markets/${id}/prices`, {
        query: params as unknown as Query,
      });
    },
    sparkline(id: number, params?: SparklineParams): Promise<Sparkline> {
      return request<Sparkline>(`/markets/${id}/sparkline`, {
        query: params as Query,
      });
    },
    orderbook(id: number, params?: OrderbookParams): Promise<Orderbook> {
      return request<Orderbook>(`/markets/${id}/orderbook`, {
        query: params as Query,
      });
    },
    async holders(
      id: number,
      params?: HoldersParams
    ): Promise<Paginated<Holder>> {
      return normalizePaginated(
        await request<Paginated<Holder>>(`/markets/${id}/holders`, {
          query: params as Query,
        })
      );
    },
    async trades(id: number, params?: TradesParams): Promise<Paginated<Trade>> {
      return normalizePaginated(
        await request<Paginated<Trade>>(`/markets/${id}/trades`, {
          query: params as Query,
        })
      );
    },
    news(id: number, params?: MarketNewsParams): Promise<TopMarketsNews> {
      return request<TopMarketsNews>(`/markets/${id}/news`, {
        query: params as Query,
      });
    },
  },

  contracts: {
    explore(body: ExploreRequest): Promise<ExploreResponse> {
      return request<ExploreResponse>("/contracts/explore", {
        method: "POST",
        json: body,
      });
    },
    detail(address: string): Promise<ContractRead> {
      return request<ContractRead>(
        `/contracts/${encodeURIComponent(address)}`
      );
    },
    syncStatus(address: string): Promise<SyncStatus> {
      return request<SyncStatus>(
        `/contracts/${encodeURIComponent(address)}/sync-status`
      );
    },
    summary(address: string): Promise<ContractSummary> {
      return request<ContractSummary>(
        `/contracts/${encodeURIComponent(address)}/summary`
      );
    },
    activity(
      address: string,
      params?: ContractActivityParams
    ): Promise<ContractActivity> {
      return request<ContractActivity>(
        `/contracts/${encodeURIComponent(address)}/activity`,
        { query: params as Query }
      );
    },
    async transactions(
      address: string,
      params?: ContractTransactionsParams
    ): Promise<Paginated<ContractTransaction>> {
      return normalizePaginated(
        await request<Paginated<ContractTransaction>>(
          `/contracts/${encodeURIComponent(address)}/transactions`,
          { query: params as Query }
        )
      );
    },
  },

  resolutions: {
    async list(
      params?: ResolutionsParams
    ): Promise<Paginated<ResolutionListItem>> {
      return normalizePaginated(
        await request<Paginated<ResolutionListItem>>("/resolutions", {
          query: params as Query,
        })
      );
    },
    detail(questionId: string): Promise<ResolutionDetail> {
      return request<ResolutionDetail>(
        `/resolutions/${encodeURIComponent(questionId)}`
      );
    },
    stats(params?: ResolutionStatsParams): Promise<ResolutionStats> {
      return request<ResolutionStats>("/resolutions/stats", {
        query: params as Query,
      });
    },
  },

  signals: {
    async list(params?: SignalsParams): Promise<Paginated<SignalListItem>> {
      return normalizePaginated(
        await request<Paginated<SignalListItem>>("/signals", {
          query: params as Query,
        })
      );
    },
    detail(id: number): Promise<SignalDetail> {
      return request<SignalDetail>(`/signals/${id}`);
    },
  },

  ecosystem: {
    kpis(params?: EcosystemWindowParams): Promise<EcosystemKpis> {
      return request<EcosystemKpis>("/ecosystem/kpis", {
        query: params as Query,
      });
    },
    kpiSparkline(
      key: string,
      params?: EcoSparklineParams
    ): Promise<EcoSparkline> {
      return request<EcoSparkline>(
        `/ecosystem/kpi/${encodeURIComponent(key)}/sparkline`,
        { query: params as Query }
      );
    },
    volume(params?: EcoIntervalParams): Promise<EcoVolume> {
      return request<EcoVolume>("/ecosystem/volume", {
        query: params as Query,
      });
    },
    activeMarkets(params?: EcoIntervalParams): Promise<EcoActiveMarkets> {
      return request<EcoActiveMarkets>("/ecosystem/active-markets", {
        query: params as Query,
      });
    },
    byCategory(params?: EcosystemWindowParams): Promise<EcoByCategory> {
      return request<EcoByCategory>("/ecosystem/by-category", {
        query: params as Query,
      });
    },
    calibration(params?: CalibrationParams): Promise<Calibration> {
      return request<Calibration>("/ecosystem/calibration", {
        query: params as Query,
      });
    },
    activityHeatmap(
      params?: EcosystemWindowParams
    ): Promise<ActivityHeatmap> {
      return request<ActivityHeatmap>("/ecosystem/activity-heatmap", {
        query: params as Query,
      });
    },
    async topWallets(
      params?: TopWalletsParams
    ): Promise<Paginated<TopWallet>> {
      return normalizePaginated(
        await request<Paginated<TopWallet>>("/ecosystem/top-wallets", {
          query: params as Query,
        })
      );
    },
  },

  search(params: SearchParams): Promise<SearchResults> {
    return request<SearchResults>("/search", {
      query: params as unknown as Query,
    });
  },
};
