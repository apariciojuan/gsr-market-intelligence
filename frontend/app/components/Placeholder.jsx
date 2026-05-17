/* PLACEHOLDER page body — Fase 2 only.
 *
 * Fase 4 replaces each route's body with the real screen wired to React
 * Query hooks. For now this renders a labelled card inside <Shell> so the
 * navigation, the active-state highlighting and the route guard are all
 * verifiable end to end.
 */

import Shell from "./Shell";

export default function Placeholder({ title, sub, route }) {
  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <div className="page-sub">{sub}</div>}
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Placeholder route <span className="mono" style={{ color: "var(--text-primary)" }}>{route}</span>.
            The real screen lands in Fase 4.
          </div>
        </div>
      </div>
    </Shell>
  );
}
