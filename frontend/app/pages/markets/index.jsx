/* /markets — Markets list (Fase 4, task 4.3).
 *
 * Wraps the real `MarketsScreen` (wired to `useMarkets`) in the app Shell.
 */
import Shell from "../../components/Shell";
import MarketsScreen from "../../screens/MarketsScreen";

export default function MarketsPage() {
  return (
    <Shell>
      <MarketsScreen />
    </Shell>
  );
}
