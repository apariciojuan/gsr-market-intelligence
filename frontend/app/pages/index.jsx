/* / — Dashboard. Fase 4, task 4.2.
 *
 * Renders DashboardScreen inside the authenticated <Shell> (sidebar + topbar +
 * route guard). The screen is wired to React Query hooks; this page is just
 * the route entry point.
 */

import Shell from "../components/Shell";
import DashboardScreen from "../screens/DashboardScreen";

export default function DashboardPage() {
  return (
    <Shell>
      <DashboardScreen />
    </Shell>
  );
}
