/* /markets/[slug] — Market detail (Fase 4, task 4.4).
 *
 * Pulls `slug` from the router query and hands it to the real
 * `MarketDetailScreen` (wired to `useMarket` + the market sub-resource hooks),
 * wrapped in the app Shell. On the very first client render `slug` is
 * `undefined` (router not ready) — the screen treats that as a loading state.
 */
import { useRouter } from "next/router";
import Shell from "../../components/Shell";
import MarketDetailScreen from "../../screens/MarketDetailScreen";

export default function MarketDetailPage() {
  const { slug } = useRouter().query;
  return (
    <Shell>
      <MarketDetailScreen slug={typeof slug === "string" ? slug : undefined} />
    </Shell>
  );
}
