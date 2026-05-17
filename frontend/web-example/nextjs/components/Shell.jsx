import Link from "next/link";
import { useRouter } from "next/router";
import { Icon } from "../lib/components";

const NAV = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: "grid" },
  { id: "markets", href: "/markets", label: "Markets", icon: "trending" },
  { id: "contracts", href: "/contracts", label: "Explorer", icon: "code" },
  { id: "resolutions", href: "/resolutions", label: "Resolutions", icon: "scale" },
  { id: "signals", href: "/signals", label: "Signals", icon: "alert" },
  { id: "ecosystem", href: "/ecosystem", label: "Ecosystem", icon: "globe" },
  { id: "settings", href: "/settings", label: "Settings", icon: "settings" },
];

export default function Shell({ children }) {
  const router = useRouter();
  const active = router.pathname === "/" ? "dashboard"
    : router.pathname.split("/")[1] || "dashboard";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">G</div>
          <div>
            <div className="brand-name">GSR · MI</div>
            <div className="brand-sub">Market Intelligence</div>
          </div>
        </div>
        <nav className="side-nav">
          {NAV.map(n => (
            <Link key={n.id} href={n.href} className={"side-link " + (active === n.id ? "active" : "")}>
              <Icon name={n.icon} size={16} />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">MO</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">M. Ortiz</div>
              <div className="user-role">Analyst · GSR</div>
            </div>
            <Link href="/login" title="Sign out"><Icon name="logout" size={14} /></Link>
          </div>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <div className="search-wrap">
            <Icon name="search" size={14} color="var(--text-muted)" />
            <input className="search-input" placeholder="Search markets, addresses, questions… (Cmd+K)" />
            <span className="kbd">⌘K</span>
          </div>
          <div className="topbar-right">
            <div className="live-pulse"><span className="dot" /> Live · Polygon</div>
            <button className="btn ghost sm"><Icon name="bell" size={14} /></button>
            <button className="btn ghost sm"><Icon name="moon" size={14} /></button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
