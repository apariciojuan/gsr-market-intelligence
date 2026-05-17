/* /settings — Settings. Fase 4, task 4.12.
 *
 * Renders SettingsScreen inside the authenticated <Shell>. The screen reads
 * the profile via `useUser()` → GET /users/me.
 */

import Shell from "../components/Shell";
import SettingsScreen from "../screens/SettingsScreen";

export default function SettingsPage() {
  return (
    <Shell>
      <SettingsScreen />
    </Shell>
  );
}
