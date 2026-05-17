/* GSR Market Intelligence — THE SWITCH.
 *
 * One env var decides the data source for the entire app:
 *   NEXT_PUBLIC_DATA_SOURCE=mock  → mockApi (JSON fixtures)   [default]
 *   NEXT_PUBLIC_DATA_SOURCE=api   → httpApi (real backend)
 *
 * Everything downstream (hooks → screens) imports `api` from here and is
 * completely agnostic to which implementation is live. Going to production
 * is a single env change — zero code changes in components or hooks.
 */

import { httpApi } from "./client";
import type { GsrApi } from "./interface";
import { mockApi } from "./mock";

/** True unless NEXT_PUBLIC_DATA_SOURCE is explicitly "api". */
export const USE_MOCK = process.env.NEXT_PUBLIC_DATA_SOURCE !== "api";

/** The single API surface the rest of the app talks to. */
export const api: GsrApi = USE_MOCK ? mockApi : httpApi;

export { ApiError } from "./error";
export type { GsrApi } from "./interface";
export * from "./types";
