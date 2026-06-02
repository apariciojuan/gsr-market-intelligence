/* GSR Market Intelligence — THE SWITCH (granular, per-domain).
 *
 * Each domain of the API (`resolutions`, `markets`, `signals`, …) can be served
 * by the mock or the real HTTP backend INDEPENDENTLY, so we can migrate off the
 * fixtures one piece at a time as each backend endpoint goes live.
 *
 * Env vars:
 *   NEXT_PUBLIC_REAL_DOMAINS=resolutions,markets  → those domains hit the backend,
 *                                                   the rest stay on mock.
 *   NEXT_PUBLIC_DATA_SOURCE=api                    → back-compat: ALL domains real.
 *   (neither set)                                  → ALL mock (default).
 *
 * Hooks/screens import `api` from here and are agnostic to which implementation
 * is live for each domain — both satisfy the same `GsrApi` interface (LSP).
 */

import { httpApi } from "./client";
import type { GsrApi } from "./interface";
import { mockApi } from "./mock";

type ApiDomain = keyof GsrApi;

/** Domains the rest of the app talks to. Derived from the mock so it always
 *  matches the GsrApi surface. */
const ALL_DOMAINS = Object.keys(mockApi) as ApiDomain[];

/** Which domains should be served by the real HTTP backend. */
function realDomains(): Set<ApiDomain> {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "api") {
    return new Set(ALL_DOMAINS); // back-compat: everything real
  }
  const raw = process.env.NEXT_PUBLIC_REAL_DOMAINS ?? "";
  const requested = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ApiDomain[];
  return new Set(requested.filter((d) => (ALL_DOMAINS as string[]).includes(d)));
}

/** Compose one `GsrApi` whose each domain resolves to mock or http. */
function buildApi(mock: GsrApi, http: GsrApi, real: Set<ApiDomain>): GsrApi {
  const out = {} as GsrApi;
  for (const domain of ALL_DOMAINS) {
    out[domain] = (real.has(domain) ? http[domain] : mock[domain]) as never;
  }
  return out;
}

const REAL = realDomains();

/** The single API surface the rest of the app talks to. */
export const api: GsrApi = buildApi(mockApi, httpApi, REAL);

/** True only if EVERY domain is still on mock (handy for banners/debug). */
export const USE_MOCK = REAL.size === 0;

export { ApiError } from "./error";
export type { GsrApi } from "./interface";
export * from "./types";
