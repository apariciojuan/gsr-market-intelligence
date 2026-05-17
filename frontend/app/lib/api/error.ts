/* GSR Market Intelligence — typed API error.
 *
 * Both httpApi and mockApi throw this so callers (hooks, screens) can branch
 * on a stable shape regardless of the data source. Mirrors the standard error
 * body from API_CONTRACT.md §"Errores estándar".
 */

import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  /** HTTP status code (e.g. 404). */
  readonly status: number;
  /** Stable machine code (e.g. "MARKET_NOT_FOUND"). */
  readonly code: string;
  /** Field name for validation errors, if any. */
  readonly field: string | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.detail);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.field = body.field ?? null;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static is(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }
}
