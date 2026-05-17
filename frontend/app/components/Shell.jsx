/* GSR Market Intelligence — app shell (sidebar + topbar) + route guard.
 *
 * Ported from `web-example/nextjs/components/Shell.jsx`, but adapted to:
 *   - the CSS that was actually ported into `styles/globals.css`, which is
 *     the hash-router layout (`.app`, `.sidebar` + `.nav-item`, `.topbar`,
 *     `.main`, `.brand`). The example's Shell used a different class set
 *     (`.app-shell`, `.side-nav`, `.main-col`…) that has no CSS here, so we
 *     follow the example's `lib/components.jsx` Sidebar/TopBar markup, which
 *     matches the CSS that exists.
 *   - the Pages Router: navigation via `next/link` + active detection via
 *     `next/router`, instead of the example's hash router.
 *   - the final route table (see checklist Fase 4): `/`, `/markets`,
 *     `/contracts`, `/resolutions`, `/signals`, `/ecosystem`, `/settings`.
 *
 * Route guard:
 *   Every authenticated page renders inside <Shell>. While auth is still
 *   resolving we render nothing; once resolved, no token → redirect to
 *   `/login`. The `/login` page does the inverse (redirect to `/` if a
 *   session already exists) — that lives in `pages/login.jsx` / LoginScreen.
 *
 * Global search (Fase 4, task 4.13):
 *   The topbar input is wired to `useSearch` (→ `api.search` → GET /search).
 *   ⌘K / Ctrl-K focuses it; typing ≥ 2 chars fires the query (the hook gates
 *   on the contract's min-2-chars rule); results are shown grouped
 *   (markets / wallets / contracts / tags) in a dropdown with keyboard +
 *   click navigation. It goes through the `useSearch` hook only — never JSON
 *   or fetch — so the mock→API switch is respected.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Icon, fmtUSD, fmtNum, truncAddr } from "../lib/components";
import { useAuth } from "../lib/auth";
import { useSearch } from "../lib/hooks";

// Final route table. `match` decides the active item for any pathname,
// including nested dynamic routes like `/markets/[slug]`.
const NAV = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: "layout-dashboard", match: (p) => p === "/" },
  { id: "markets", href: "/markets", label: "Markets", icon: "trending-up", match: (p) => p === "/markets" || p.startsWith("/markets/") },
  { id: "contracts", href: "/contracts", label: "Explorer", icon: "search", match: (p) => p === "/contracts" || p.startsWith("/contracts/") },
  { id: "resolutions", href: "/resolutions", label: "Resolutions", icon: "scale", match: (p) => p === "/resolutions" || p.startsWith("/resolutions/") },
  { id: "signals", href: "/signals", label: "Signals", icon: "git-branch", match: (p) => p === "/signals" || p.startsWith("/signals/") },
  { id: "ecosystem", href: "/ecosystem", label: "Ecosystem", icon: "globe", match: (p) => p === "/ecosystem" },
];

const SETTINGS = { id: "settings", href: "/settings", label: "Settings", icon: "settings", match: (p) => p === "/settings" };

function initialsOf(user) {
  const name = (user && (user.email || user.username)) || "";
  if (!name) return "?";
  const local = name.split("@")[0];
  const parts = local.split(/[.\-_ ]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export default function Shell({ children }) {
  const router = useRouter();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const pathname = router.pathname;

  // On mobile the sidebar is an off-canvas drawer; on desktop it's always
  // visible and CSS ignores this state entirely.
  const [menuOpen, setMenuOpen] = useState(false);

  // --- Route guard: bounce to /login once we know there's no session. ---
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  // Close the mobile drawer whenever the route changes (e.g. after tapping a
  // nav item or navigating from global search).
  useEffect(() => {
    const close = () => setMenuOpen(false);
    router.events.on("routeChangeComplete", close);
    return () => router.events.off("routeChangeComplete", close);
  }, [router.events]);

  // While the session is resolving, or while the redirect is in flight,
  // render nothing — avoids a flash of the authenticated layout.
  if (loading || !isAuthenticated) {
    return null;
  }

  async function onSignOut(e) {
    e.preventDefault();
    setMenuOpen(false);
    await logout();
    router.replace("/login");
  }

  return (
    <div className="app">
      {/* Backdrop — only visible/clickable on mobile when the drawer is open. */}
      {menuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <aside className={"sidebar " + (menuOpen ? "open" : "")}>
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <Link
              key={n.id}
              href={n.href}
              className={"nav-item " + (active ? "active" : "")}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={n.icon} size={18} />
              <span className="nav-label">{n.label}</span>
            </Link>
          );
        })}
        <div className="nav-spacer" />
        <div className="nav-divider" />
        <Link
          href={SETTINGS.href}
          className={"nav-item " + (SETTINGS.match(pathname) ? "active" : "")}
          onClick={() => setMenuOpen(false)}
        >
          <Icon name={SETTINGS.icon} size={18} />
          <span className="nav-label">{SETTINGS.label}</span>
        </Link>
        <button
          type="button"
          className="nav-item"
          onClick={onSignOut}
          title="Sign out"
          style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left", width: "100%" }}
        >
          <Icon name="log-out" size={18} />
          <span className="nav-label">Sign out</span>
        </button>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar user={user} menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((v) => !v)} />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

// ---------- TopBar ----------
// Brand + global search + account chip. The hamburger button only shows on
// mobile (CSS) and toggles the off-canvas sidebar drawer.
function TopBar({ user, menuOpen, onMenuToggle }) {
  const label = (user && (user.email || user.username)) || "account";

  return (
    <header className="topbar">
      <button
        type="button"
        className="menu-toggle"
        onClick={onMenuToggle}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
      >
        <Icon name={menuOpen ? "x" : "menu"} size={18} />
      </button>

      <Link href="/" className="brand">
        <div className="brand-mark">G</div>
        <div>
          <div className="brand-name">GSR</div>
          <div className="brand-sub">Market Intel</div>
        </div>
      </Link>

      <GlobalSearch />

      <div className="topbar-right">
        <button className="icon-btn notif-dot" title="Notifications"><Icon name="bell" size={16} /></button>
        <button className="icon-btn" title="Refresh"><Icon name="refresh" size={16} /></button>
        <Link href="/settings" className="user-chip" title="Account">
          <span className="avatar">{initialsOf(user)}</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
        </Link>
      </div>
    </header>
  );
}

// ---------- Global search (⌘K) — task 4.13 ----------
//
// Builds a flat, ordered list of navigable items from the grouped
// SearchResults so arrow-key navigation is trivial. Each item carries the
// `href` it navigates to.
//
// Navigation targets (final route table):
//   markets   → /markets/[slug]
//   contracts → /contracts/[address]
//   wallets   → /contracts/[address]   (a wallet is just an address; the
//               Explorer accepts any Polygon address)
//   tags      → /markets               (markets list; tag filtering is a
//               later refinement, the route still resolves)
function flattenResults(results) {
  if (!results) return [];
  const out = [];
  for (const m of results.markets || []) {
    out.push({
      group: "markets",
      key: "m-" + m.id,
      icon: "trending-up",
      title: m.question,
      sub: m.category,
      href: "/markets/" + m.slug,
    });
  }
  for (const w of results.wallets || []) {
    out.push({
      group: "wallets",
      key: "w-" + w.address,
      icon: "wallet",
      title: w.label || truncAddr(w.address),
      sub: fmtUSD(w.total_volume_usd),
      href: "/contracts/" + w.address,
    });
  }
  for (const c of results.contracts || []) {
    out.push({
      group: "contracts",
      key: "c-" + c.address,
      icon: "file",
      title: c.name || truncAddr(c.address),
      sub: c.type,
      href: "/contracts/" + c.address,
    });
  }
  for (const t of results.tags || []) {
    out.push({
      group: "tags",
      key: "t-" + t.name,
      icon: "git-branch",
      title: t.name,
      sub: fmtNum(t.market_count) + " markets",
      href: "/markets",
    });
  }
  return out;
}

const GROUP_LABELS = {
  markets: "Markets",
  wallets: "Wallets",
  contracts: "Contracts",
  tags: "Tags",
};

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // index into the flat item list
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const query = { q: q.trim(), limit_per_group: 5 };
  // The hook gates internally on q.length >= 2; `enabled` also requires the
  // dropdown to be open so we don't query in the background after blur.
  const search = useSearch(query, open);

  const items = search.data ? flattenResults(search.data.results) : [];
  const showDropdown = open && q.trim().length >= 2;

  // ⌘K / Ctrl-K focuses the input from anywhere.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current && inputRef.current.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Keep the active index in range as results change.
  useEffect(() => {
    setActive(0);
  }, [q]);

  function go(item) {
    if (!item) return;
    setOpen(false);
    setQ("");
    router.push(item.href);
  }

  function onInputKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current && inputRef.current.blur();
      return;
    }
    if (!showDropdown || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  }

  // Group the flat list back into sections for rendering, preserving the
  // flat index so hover/active highlighting lines up with keyboard nav.
  const sections = [];
  for (const groupKey of ["markets", "wallets", "contracts", "tags"]) {
    const groupItems = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.group === groupKey);
    if (groupItems.length > 0) sections.push({ groupKey, groupItems });
  }

  return (
    <div className="search-wrap" ref={wrapRef}>
      <span className="search-icon"><Icon name="search" size={14} /></span>
      <input
        id="global-search"
        ref={inputRef}
        className="search-input"
        placeholder="Search markets, addresses, questions…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        autoComplete="off"
      />
      <span className="kbd">⌘ K</span>

      {showDropdown && (
        <div className="search-dropdown">
          {search.isLoading && (
            <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--text-secondary)" }}>
              Searching…
            </div>
          )}
          {search.isError && (
            <div
              style={{
                padding: "16px 12px",
                fontSize: 13,
                color: "var(--danger)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Icon name="alert" size={14} color="var(--danger)" />
              {(search.error && search.error.message) || "Search failed."}
            </div>
          )}
          {search.isSuccess && items.length === 0 && (
            <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--text-secondary)" }}>
              No results for “{search.data.query}”.
            </div>
          )}
          {search.isSuccess &&
            items.length > 0 &&
            sections.map(({ groupKey, groupItems }) => (
              <div className="search-section" key={groupKey}>
                <div className="search-section-head">{GROUP_LABELS[groupKey]}</div>
                {groupItems.map(({ it, i }) => (
                  <div
                    key={it.key}
                    className={"search-item " + (i === active ? "focused" : "")}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      // mousedown (not click) so it fires before the input blur
                      e.preventDefault();
                      go(it);
                    }}
                  >
                    <Icon name={it.icon} size={14} />
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {it.title}
                    </span>
                    {it.sub != null && <span className="sub">{it.sub}</span>}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
