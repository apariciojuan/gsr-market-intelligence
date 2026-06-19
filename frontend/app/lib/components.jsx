/* GSR Market Intelligence — shared UI components + helpers.
 *
 * Ported from `web-example/nextjs/lib/components.jsx`. Differences from the
 * example:
 *   - `Recharts` is imported locally (the example relied on a global).
 *   - The `GSR_MOCKS` import is dropped. `CatPill` uses an inline category
 *     color map — that's a pure UI presentation concern (label + color),
 *     not a data shape, so it does not belong in the data layer.
 *   - The hash-router bits (`useRoute`, `Sidebar`, `TopBar`) are NOT ported
 *     here — the Pages Router layout lives in `components/Shell.jsx`.
 *   - `DataTable` supports server-side pagination with `total: null`
 *     (paginate purely on `has_more`), as required by API_CONTRACT.md.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import * as Recharts from "recharts";

// ---------- Formatters ----------
export function fmtUSD(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}
export function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}
export function fmtPct(n, digits = 1) {
  if (n == null) return "—";
  const s = n.toFixed(digits) + "%";
  return n > 0 ? "+" + s : s;
}
export function fmtPrice(n) {
  return "$" + Number(n).toFixed(4);
}
export function fmtRelTime(t) {
  // The API contract sends timestamps as ISO 8601 strings; coerce to epoch ms.
  const ms = typeof t === "number" ? t : new Date(t).getTime();
  if (Number.isNaN(ms)) return "—";
  const diff = Math.abs(Date.now() - ms);
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400_000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}
export function fmtTime(t) {
  const d = new Date(t);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${h}:${m} UTC`;
}
export function fmtDay(t) {
  const d = new Date(t);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}
export function truncAddr(a, l = 4) {
  if (!a) return "—";
  return a.slice(0, 6) + "..." + a.slice(-l);
}
export function fmtCountdown(ms) {
  if (ms <= 0) return "Passed";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ---------- Category presentation map (UI only) ----------
// Label + color for a market category. Not a data shape — the API returns
// the raw category key; this map only decides how to render it.
const CATEGORY_STYLES = {
  politics: { name: "Politics", color: "#A855F7" },
  crypto: { name: "Crypto", color: "#F59E0B" },
  sports: { name: "Sports", color: "#22C55E" },
  economics: { name: "Economics", color: "#06B6D4" },
  pop: { name: "Pop Culture", color: "#EC4899" },
  science: { name: "Science", color: "#14B8A6" },
};

// ---------- Lucide icon (svg) ----------
export function Icon({ name, size = 16, color = "currentColor", className = "", strokeWidth = 1.75 }) {
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
    "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    "menu": <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    "message-circle": <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    "x": <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
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
export function StatusPill({ status }) {
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
    x:             { label: "X",            cls: "info" },
    telegram:      { label: "Telegram",     cls: "info" },
    rss:           { label: "RSS",          cls: "neutral" },
    resolution:    { label: "Resolution",   cls: "neutral" },
    yes:           { label: "YES",          cls: "success" },
    no:            { label: "NO",           cls: "danger" },
  };
  const m = map[status] || { label: status, cls: "neutral" };
  return <span className={"pill " + m.cls}><span className="dot"/>{m.label}</span>;
}

// ---------- Address pill ----------
export function AddressPill({ address, label, withLink = true }) {
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
export function CatPill({ cat }) {
  const c = CATEGORY_STYLES[cat] || { name: cat, color: "#8A92A6" };
  return <span className="pill" style={{ background: c.color + "1A", color: c.color, borderColor: c.color + "40" }}>
    <span className="dot" style={{ background: c.color }}/>{c.name}
  </span>;
}

// ---------- KPI Card ----------
export function KpiCard({ k }) {
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
export function MiniSpark({ data, delta }) {
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
export function ChartContainer({ title, subtitle, intervals, currentInterval, onInterval, legend, footer, children, fullscreenable = false }) {
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
export function TabBar({ tabs, active, onChange }) {
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
/**
 * Two pagination modes:
 *
 *  - **Client-side** (default): pass the full `data` array. The table sorts
 *    and slices it locally. `total` is derived from `data.length`.
 *
 *  - **Server-side**: pass `serverPaginated` props. The table renders exactly
 *    the `data` it's given (one page) and delegates page changes to the
 *    parent via `onPageChange`. This is the mode required by API_CONTRACT.md
 *    for large tables, where the API may return `total: null` and only
 *    `has_more` — so the footer must work off `has_more`, never a page count.
 *
 * Server-side props:
 *   serverPaginated  boolean  — switch into server mode
 *   page             number   — current 1-based page (controlled by parent)
 *   onPageChange     fn(page) — request a different page
 *   hasMore          boolean  — there is at least one more page
 *   total            number|null — total rows, or null if the API omits it
 */
export function DataTable({
  columns,
  data,
  sortable = true,
  defaultSort,
  onRowClick,
  pageSize = 10,
  paginate = true,
  flagRow,
  // server-side pagination
  serverPaginated = false,
  page: serverPage,
  onPageChange,
  hasMore = false,
  total: serverTotal,
}) {
  const [sort, setSort] = useState(defaultSort || { key: null, dir: "desc" });
  const [clientPage, setClientPage] = useState(1);

  // In server mode the parent owns sorting+paging: render rows as given.
  const sorted = useMemo(() => {
    if (serverPaginated) return data;
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
  }, [data, sort, columns, serverPaginated]);

  const page = serverPaginated ? (serverPage || 1) : clientPage;

  // Client mode: total/pages from the local array.
  const clientTotal = sorted.length;
  const clientPages = Math.max(1, Math.ceil(clientTotal / pageSize));
  const slice = serverPaginated
    ? sorted
    : paginate
      ? sorted.slice((page - 1) * pageSize, page * pageSize)
      : sorted;

  // `total` may legitimately be null in server mode — never derive a page
  // count from it. Navigation in server mode is driven purely by `hasMore`.
  const knownTotal = serverPaginated ? serverTotal : clientTotal;
  const lastPage = serverPaginated ? null : clientPages;

  function clickSort(key) {
    if (!sortable || serverPaginated) return;
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  function goTo(p) {
    if (serverPaginated) {
      onPageChange && onPageChange(p);
    } else {
      setClientPage(p);
    }
  }

  const showFooter = serverPaginated
    ? (page > 1 || hasMore)
    : (paginate && clientTotal > pageSize);

  // Footer label: "Showing X–Y of Z" — but Z is hidden when total is null.
  const fromRow = (page - 1) * pageSize + 1;
  const toRow = serverPaginated
    ? (page - 1) * pageSize + slice.length
    : Math.min(clientTotal, page * pageSize);

  const atLastPage = serverPaginated ? !hasMore : page === lastPage;

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>{columns.map(c => (
              <th key={c.key} className={(c.sortable !== false && sortable && !serverPaginated ? "sortable " : "") + (c.align === "right" ? "t-right" : "")}
                  onClick={() => c.sortable !== false && clickSort(c.key)}
                  style={c.width ? { width: c.width } : undefined}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {c.label}
                  {!serverPaginated && sort.key === c.key && <Icon name={sort.dir === "asc" ? "arrow-up" : "arrow-down"} size={11}/>}
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
      {showFooter && (
        <div className="pagination">
          <div>
            Showing {slice.length === 0 ? 0 : fromRow}–{toRow}
            {knownTotal != null ? ` of ${knownTotal}` : ""}
          </div>
          <div className="pg-btns">
            <button className="pg-btn" disabled={page === 1} onClick={() => goTo(1)}>«</button>
            <button className="pg-btn" disabled={page === 1} onClick={() => goTo(page - 1)}>‹</button>
            <span className="pg-btn active">
              {page}{lastPage != null ? ` / ${lastPage}` : ""}
            </span>
            <button className="pg-btn" disabled={atLastPage} onClick={() => goTo(page + 1)}>›</button>
            {lastPage != null && (
              <button className="pg-btn" disabled={atLastPage} onClick={() => goTo(lastPage)}>»</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Live flash hook (numbers blink up/down on change) ----------
export function useFlash(value) {
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
export function ToastHost() {
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
