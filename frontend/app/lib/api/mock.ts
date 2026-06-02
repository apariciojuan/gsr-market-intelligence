/* GSR Market Intelligence — mockApi: the JSON-backed implementation of GsrApi.
 *
 * Implements EXACTLY the same `GsrApi` interface as `httpApi`. Reads the
 * fixtures in `lib/mocks/*.json` (shaped per API_CONTRACT.md) and reproduces
 * the contract's runtime semantics:
 *   - ~200ms simulated latency on every call
 *   - pagination: applies limit/offset/order/order_by, returns
 *     `{ items, total, limit, offset, has_more }`
 *   - errors: throws a typed `ApiError` for unknown slugs/ids/addresses
 *     (404 MARKET_NOT_FOUND, RESOLUTION_NOT_FOUND, etc.)
 *
 * Nothing here is imported by hooks/screens directly — the switch in
 * `index.ts` decides whether this or `httpApi` is live.
 */

import { ApiError } from "./error";
import type { GsrApi } from "./interface";
import type { LoginRequest, LoginResponse, UserRead } from "./types";

// --- fixtures ---
import authJson from "../mocks/auth.json";

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

/** Domains migrated to the real backend: their mock is retired. Calling them is a bug. */
function retired(domain: string): never {
  throw new Error(`mock retired: "${domain}" is served by the real API now`);
}

const LATENCY_MS = 200;

/** Simulate network latency, then resolve with a structural clone of `data`. */
function respond<T>(data: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(clone(data)), LATENCY_MS);
  });
}

/** Reject after the simulated latency with a typed ApiError. */
function reject(status: number, code: string, detail: string): Promise<never> {
  return new Promise((_, rej) => {
    setTimeout(() => rej(new ApiError(status, { detail, code })), LATENCY_MS);
  });
}

/** Deep clone so callers can never mutate the shared fixture objects.
 *  `null`/`undefined` are passed through — `JSON.stringify(undefined)`
 *  returns `undefined`, which `JSON.parse` would choke on (e.g. the
 *  `void`-returning `auth.logout()` endpoint). */
function clone<T>(data: T): T {
  if (data == null) return data;
  return JSON.parse(JSON.stringify(data)) as T;
}

// ------------------------------------------------------------
// implementation
// ------------------------------------------------------------

export const mockApi: GsrApi = {
  auth: {
    login(body: LoginRequest): Promise<LoginResponse> {
      const { credentials, login_response } = authJson;
      if (
        body.username === credentials.username &&
        body.password === credentials.password
      ) {
        return respond(login_response as LoginResponse);
      }
      return reject(
        400,
        "LOGIN_BAD_CREDENTIALS",
        "Username or password is incorrect."
      );
    },
    logout(): Promise<void> {
      return respond(undefined as void);
    },
    me(): Promise<UserRead> {
      return respond(authJson.user as UserRead);
    },
  },

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  health: (() => retired("health")) as GsrApi["health"],

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  dashboard: new Proxy({} as GsrApi["dashboard"], {
    get: () => () => retired("dashboard"),
  }),

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  markets: new Proxy({} as GsrApi["markets"], {
    get: () => () => retired("markets"),
  }),

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  contracts: new Proxy({} as GsrApi["contracts"], {
    get: () => () => retired("contracts"),
  }),

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  resolutions: new Proxy({} as GsrApi["resolutions"], {
    get: () => () => retired("resolutions"),
  }),

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  signals: new Proxy({} as GsrApi["signals"], {
    get: () => () => retired("signals"),
  }),

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  ecosystem: new Proxy({} as GsrApi["ecosystem"], {
    get: () => () => retired("ecosystem"),
  }),

  // Retired: served by the real backend (see NEXT_PUBLIC_REAL_DOMAINS / index.ts).
  search: (() => retired("search")) as GsrApi["search"],
};
