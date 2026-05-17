/* React Query hooks — current user (`GET /users/me`).
 *
 * Wraps `api.auth.me()` so the Settings screen reads the profile through the
 * same mock/http switch as everything else — it never touches JSON or fetch.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./queryKeys";

/** GET /users/me — own profile (sidebar chip, settings screen). */
export function useUser() {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => api.auth.me(),
  });
}
