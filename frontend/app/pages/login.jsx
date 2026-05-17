/* /login — Fase 4, task 4.1.
 *
 * Renders the full LoginScreen. The screen handles the form, the mock login
 * via `useAuth().login()`, the `LOGIN_BAD_CREDENTIALS` error, the demo
 * credentials hint, and the inverse route guard (redirect to `/` if already
 * authenticated). This page intentionally has no layout: /login lives outside
 * the authenticated <Shell>.
 */

import LoginScreen from "../screens/LoginScreen";

export default function LoginPage() {
  return <LoginScreen />;
}
