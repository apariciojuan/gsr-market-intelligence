/* App root: global styles + the two providers that wrap the whole tree.
 *
 *   - QueryClientProvider: shared React Query client (the mock→API switch
 *     lives entirely below this, in `lib/api`).
 *   - AuthProvider: session/token state, consumed by the route guard.
 *   - ToastHost: listens for `window` "toast" events; mounted once here so
 *     any component (e.g. AddressPill) can fire a toast.
 */

import "../styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { AuthProvider } from "../lib/auth";
import { ToastHost } from "../lib/components";

export default function App({ Component, pageProps }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Component {...pageProps} />
        <ToastHost />
      </AuthProvider>
    </QueryClientProvider>
  );
}
