/* GSR Market Intelligence — shared UI components + helpers
   Exposes globals on `window` for cross-file consumption. */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Formatters ----------
function fmtUSD(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}
function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}
function fmtPct(n, digits = 1) {
  if (n == null) return "—";
  const s = n.toFixed(digits) + "%";
  return n > 0 ? "+" + s : s;
}
function fmtPrice(n) {
  return "$" + Number(n).toFixed(4);
}
function fmtRelTime(t) {
  const diff = Math.abs(Date.now() - t);
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400_000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}
function fmtTime(t) {
  const d = new Date(t);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${h}:${m} UTC`;
}
function fmtDay(t) {
  const d = new Date(t);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}
function truncAddr(a, l = 4) {
  if (!a) return "—";
  return a.slice(0, 6) + "..." + a.slice(-l);
}
function fmtCountdown(ms) {
  if (ms <= 0) return "Passed";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ---------- Lucide icon (svg) ----------
function Icon({ name, size = 16, color = "currentColor", className = "", strokeWidth = 1.75 }) {
  // tiny inline set used across the app
  const paths = {
    "layout-dashboard": <><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>,
    "trending-up": <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,
    "scale": <><path d="M16 16.5 19 9l3 7.5"/><path d="M2 16.5 5 9l3 7.5"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></>,
    "git-branch": <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    "globe": <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    "search": <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    "settings": <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    "bell": <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
    "copy": <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    "check": <><polyline points="20 6 9 17 4 12"/></>,
    "external-link": <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    "arrow-up": <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    "arrow-down": <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    "arrow-right": <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    "arrow-left": <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    "filter": <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    "more": <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
    "alert": <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    "clock": <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    "check-circle": <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    "x-circle": <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    "user": <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    "star": <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    "key": <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></>,
    "moon": <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    "info": <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
    "refresh": <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    "download": <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    "chevron-down": <><polyline points="6 9 12 15 18 9"/></>,
    "chevron-right": <><polyline points="9 6 15 12 9 18"/></>,
    "sparkles": <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>,
    "wallet": <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></>,
    "file": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
  };
  const p = paths[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className}>{p}</svg>
  );
}

// ---------- Status pill ----------
function StatusPill({ status }) {
  const map = {
    active:        { label: "Active",       cls: "info" },
    resolved:      { label: "Resolved",     cls: "success" },
    disputed:      { label: "Disputed",     cls: "warning" },
    closed:        { label: "Closed",       cls: "neutral" },
    pending_uma:   { label: "Pending UMA",  cls: "warning pulse" },
    proposed:      { label: "Proposed",     cls: "info" },
    price_gap:     { label: "Price Gap",    cls: "warning" },
    news:          { label: "News not reflected", cls: "info" },
    sudden:        { label: "Sudden Move",  cls: "danger" },
    yes:           { label: "YES",          cls: "success" },
    no:            { label: "NO",           cls: "danger" },
  };
  const m = map[status] || { label: status, cls: "neutral" };
  return <span className={"pill " + m.cls}><span className="dot"/>{m.label}</span>;
}

// ---------- Address pill ----------
function AddressPill({ address, label, withLink = true }) {
  const [copied, setCopied] = useState(false);
  const display = label || truncAddr(address);
  const onCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(address);
    setCopied(true);
    window.dispatchEvent(new CustomEvent("toast", { detail: "Address copied to clipboard" }));
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="addr-pill" title={address}>
      <span className="addr-label mono">{display}</span>
      <span className="icon-mini" onClick={onCopy}>
        {copied ? <Icon name="check" size={13} color="var(--success)"/> : <Icon name="copy" size={13}/>}
      </span>
      {withLink && (
        <a className="icon-mini" href={`https://polygonscan.com/address/${address}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          <Icon name="external-link" size={13}/>
        </a>
      )}
    </span>
  );
}

// ---------- Category pill ----------
function CatPill({ cat }) {
  const c = (GSR_MOCKS.categories[cat] || { name: cat, color: "#8A92A6" });
  return <span className="pill" style={{ background: c.color + "1A", color: c.color, borderColor: c.color + "40" }}>
    <span className="dot" style={{ background: c.color }}/>{c.name}
  </span>;
}

// ---------- KPI Card ----------
function KpiCard({ k }) {
  const trend = k.delta >= 0 ? "up" : "down";
  const data = k.spark.map((v, i) => ({ i, v }));
  const color = trend === "up" ? "#22C55E" : "#EF4444";
  return (
    <div className="card kpi-card">
      <div className="kpi-label">{k.label}</div>
      <div className="kpi-row">
        <div className="kpi-value">{k.value}</div>
        <div className={"kpi-delta " + trend}>
          <Icon name={trend === "up" ? "arrow-up" : "arrow-down"} size={12}/>
          {Math.abs(k.delta).toFixed(1)}%
        </div>
      </div>
      <div className="kpi-spark">
        <Recharts.ResponsiveContainer width="100%" height="100%">
          <Recharts.AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={"spark-"+k.key} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.45}/>
                <stop offset="100%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Recharts.Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#spark-${k.key})`} dot={false} isAnimationActive={false}/>
          </Recharts.AreaChart>
        </Recharts.ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Mini sparkline (G2) ----------
function MiniSpark({ data, delta }) {
  const color = delta >= 0 ? "#22C55E" : "#EF4444";
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 120, height: 32 }}>
      <Recharts.ResponsiveContainer width="100%" height="100%">
        <Recharts.LineChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Recharts.Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.4} dot={false} isAnimationActive={false}/>
        </Recharts.LineChart>
      </Recharts.ResponsiveContainer>
    </div>
  );
}

// ---------- Chart Container ----------
function ChartContainer({ title, subtitle, intervals, currentInterval, onInterval, legend, footer, children, fullscreenable = false }) {
  return (
    <div className="card chart-container">
      <div className="chart-toolbar">
        <div>
          <h3>{title}</h3>
          {subtitle ? <div className="sub">{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {legend}
          {intervals && (
            <div className="interval-group">
              {intervals.map(iv => (
                <button key={iv} className={"interval-btn " + (iv === currentInterval ? "active" : "")} onClick={() => onInterval && onInterval(iv)}>{iv}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="chart-body">{children}</div>
      {footer ? <div className="chart-footer">{footer}</div> : null}
    </div>
  );
}

// ---------- Tabs ----------
function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tabbar">
      {tabs.map(t => (
        <button key={t.id} className={"tab " + (active === t.id ? "active" : "")} onClick={() => onChange(t.id)}>
          {t.label}{t.count != null ? <span style={{ marginLeft: 6, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ---------- DataTable ----------
function DataTable({ columns, data, sortable = true, defaultSort, onRowClick, pageSize = 10, paginate = true, flagRow }) {
  const [sort, setSort] = useState(defaultSort || { key: null, dir: "desc" });
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort.key) return data;
    const c = columns.find(c => c.key === sort.key);
    if (!c) return data;
    const arr = [...data];
    arr.sort((a, b) => {
      const av = c.value ? c.value(a) : a[sort.key];
      const bv = c.value ? c.value(b) : b[sort.key];
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [data, sort, columns]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const slice = paginate ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;

  function clickSort(key) {
    if (!sortable) return;
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>{columns.map(c => (
              <th key={c.key} className={(c.sortable !== false && sortable ? "sortable " : "") + (c.align === "right" ? "t-right" : "")}
                  onClick={() => c.sortable !== false && clickSort(c.key)}
                  style={c.width ? { width: c.width } : undefined}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {c.label}
                  {sort.key === c.key && <Icon name={sort.dir === "asc" ? "arrow-up" : "arrow-down"} size={11}/>}
                </span>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={columns.length}><div className="empty"><Icon name="search" size={20}/><div className="ttl">No results</div></div></td></tr>
            )}
            {slice.map((row, i) => {
              const flag = flagRow ? flagRow(row) : null;
              return (
                <tr key={i} className={flag ? "row-flag-" + flag : ""} onClick={() => onRowClick && onRowClick(row)}>
                  {columns.map(c => (
                    <td key={c.key} className={(c.align === "right" ? "t-right " : "") + (c.mono ? "t-mono " : "") + (c.truncate ? "t-truncate " : "") + (c.className || "")}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paginate && total > pageSize && (
        <div className="pagination">
          <div>Showing {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}</div>
          <div className="pg-btns">
            <button className="pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
            <button className="pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <span className="pg-btn active">{page} / {pages}</span>
            <button className="pg-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="pg-btn" disabled={page === pages} onClick={() => setPage(pages)}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Live flash hook (numbers blink up/down on change) ----------
function useFlash(value) {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (prev.current !== value) {
      const dir = value > prev.current ? "flash-up" : "flash-down";
      setCls(dir);
      const t = setTimeout(() => setCls(""), 600);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);
  return cls;
}

// ---------- Toast manager ----------
function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    function onToast(e) {
      const id = Math.random().toString(36).slice(2);
      setItems(s => [...s, { id, text: e.detail }]);
      setTimeout(() => setItems(s => s.filter(x => x.id !== id)), 3500);
    }
    window.addEventListener("toast", onToast);
    return () => window.removeEventListener("toast", onToast);
  }, []);
  return (
    <div className="toast-wrap">
      {items.map(t => <div key={t.id} className="toast"><Icon name="check-circle" size={16} color="var(--success)"/>{t.text}</div>)}
    </div>
  );
}

// ---------- Router (hash-based) ----------
function useRoute() {
  const [hash, setHash] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const h = () => setHash(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const nav = useCallback((to) => { location.hash = to; }, []);
  return { hash, nav };
}

// ---------- Sidebar ----------
function Sidebar({ route, nav }) {
  const items = [
    { id: "/",           label: "Dashboard",    icon: "layout-dashboard" },
    { id: "/markets",    label: "Markets",      icon: "trending-up" },
    { id: "/resolutions",label: "Resolutions",  icon: "scale" },
    { id: "/signals",    label: "Signals",      icon: "git-branch" },
    { id: "/ecosystem",  label: "Ecosystem",    icon: "globe" },
    { id: "/contracts",  label: "Explorer",     icon: "search" },
  ];
  function isActive(id) {
    if (id === "/") return route === "/";
    return route.startsWith(id);
  }
  return (
    <aside className="sidebar">
      {items.map(it => (
        <a key={it.id} href={"#" + it.id} className={"nav-item " + (isActive(it.id) ? "active" : "")}>
          <Icon name={it.icon} size={18}/>
          <span className="nav-label">{it.label}</span>
        </a>
      ))}
      <div className="nav-spacer"/>
      <div className="nav-divider"/>
      <a href="#/settings" className={"nav-item " + (isActive("/settings") ? "active" : "")}>
        <Icon name="settings" size={18}/>
        <span className="nav-label">Settings</span>
      </a>
    </aside>
  );
}

// ---------- TopBar / Global Search ----------
function TopBar({ nav }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const idx = GSR_MOCKS.searchIndex;
  const inputRef = useRef();
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); }
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function filter(arr, fields) {
    if (!q) return arr.slice(0, 3);
    return arr.filter(it => fields.some(f => String(it[f] || "").toLowerCase().includes(q.toLowerCase()))).slice(0, 3);
  }
  const markets = filter(idx.markets, ["title", "slug"]);
  const wallets = filter(idx.wallets, ["title", "address"]);
  const contracts = filter(idx.contracts, ["title", "address"]);
  const tags = filter(idx.tags, ["title"]);
  return (
    <header className="topbar">
      <a href="#/" className="brand">
        <div className="brand-mark">G</div>
        <div>
          <div className="brand-name">GSR</div>
          <div className="brand-sub">Market Intel</div>
        </div>
      </a>
      <div className="search-wrap">
        <span className="search-icon"><Icon name="search" size={14}/></span>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Buscar mercado, address, wallet o tag..."
          value={q}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => setQ(e.target.value)}
        />
        <span className="kbd">⌘ K</span>
        {open && (
          <div className="search-dropdown">
            {[
              { head: "Markets", items: markets, fmt: it => ({ icon: "trending-up", text: it.title, sub: it.sub, href: `#/markets/${it.slug}` }) },
              { head: "Wallets", items: wallets, fmt: it => ({ icon: "wallet", text: it.title, sub: truncAddr(it.address), href: `#/contracts/${it.address}` }) },
              { head: "Contracts", items: contracts, fmt: it => ({ icon: "file", text: it.title, sub: truncAddr(it.address), href: `#/contracts/${it.address}` }) },
              { head: "Tags", items: tags, fmt: it => ({ icon: "sparkles", text: it.title, sub: it.sub, href: "#/markets" }) },
            ].map((g, i) => g.items.length > 0 && (
              <div key={i} className="search-section">
                <div className="search-section-head">{g.head}</div>
                {g.items.map((it, j) => {
                  const v = g.fmt(it);
                  return (
                    <a key={j} href={v.href} className="search-item" onMouseDown={e => e.preventDefault()}>
                      <Icon name={v.icon} size={14} className="icon"/>
                      <span>{v.text}</span>
                      <span className="sub">{v.sub}</span>
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="topbar-right">
        <button className="icon-btn notif-dot" title="Notifications"><Icon name="bell" size={16}/></button>
        <button className="icon-btn" title="Refresh"><Icon name="refresh" size={16}/></button>
        <a href="#/settings" className="user-chip" title="Account">
          <span className="avatar">M</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>m.ortiz</span>
        </a>
      </div>
    </header>
  );
}

// Expose
Object.assign(window, {
  fmtUSD, fmtNum, fmtPct, fmtPrice, fmtRelTime, fmtTime, fmtDay, truncAddr, fmtCountdown,
  Icon, StatusPill, AddressPill, CatPill, KpiCard, MiniSpark, ChartContainer, TabBar, DataTable,
  useFlash, ToastHost, useRoute, Sidebar, TopBar,
});
