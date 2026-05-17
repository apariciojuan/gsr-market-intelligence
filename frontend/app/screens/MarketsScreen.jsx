/* GSR Market Intelligence — Markets list screen (route `/markets`).
 *
 * Ported from `web-example/nextjs/screens/index.jsx` (`MarketsScreen`), rewired
 * from the `GSR_MOCKS` global onto the `useMarkets` React Query hook.
 *
 * Wiring vs. the example:
 *   - Data comes only from `useMarkets(params)` → `api.markets.list`. No JSON,
 *     no `fetch`, no `GSR_MOCKS`.
 *   - Server-side pagination: `DataTable` runs in `serverPaginated` mode, so it
 *     renders exactly the page the API returns and drives navigation off
 *     `has_more` — which means `total: null` (massive-table case) is supported
 *     out of the box (the footer just omits the count).
 *   - Filters map to the contract query params: `category`, `active`,
 *     `resolved`, plus `order_by` / `order`. Changing any filter resets to
 *     page 1.
 *   - Sorting: the API owns ordering, so the table's client sort is off; the
 *     "Sort by" chips drive `order_by` and an asc/desc toggle drives `order`.
 *   - States: loading (skeleton rows), error (ApiError-aware message + retry),
 *     empty (handled by `DataTable`'s built-in "No results").
 *
 * Per-row sparkline (G2): the list endpoint (`MarketListItem`) does not carry a
 * sparkline, and firing one `useMarketSparkline` per visible row would mean a
 * variable number of hooks (illegal). The catalog's G2 lives in a dedicated
 * `MarketRowSpark` component that owns exactly one hook for one market id — a
 * stable hook count per mounted row.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useMarkets, useMarketSparkline } from "../lib/hooks/useMarkets";
import {
  CatPill,
  DataTable,
  Icon,
  MiniSpark,
  fmtNum,
  fmtUSD,
} from "../lib/components";
import { ApiError } from "../lib/api";

const PAGE_SIZE = 20;

// Category filter chips. `all` clears the `category` param entirely.
const CATEGORIES = [
  ["all", "All"],
  ["Politics", "Politics"],
  ["Sports", "Sports"],
  ["Crypto", "Crypto"],
  ["Economics", "Economics"],
  ["Pop Culture", "Pop Culture"],
  ["Science", "Science"],
];

// `order_by` chips — values are exactly the contract's allowed fields.
const ORDER_BY = [
  ["volume_total", "Volume"],
  ["liquidity", "Liquidity"],
  ["end_date", "End date"],
  ["created_at", "Created"],
];

// Active / resolved present as one tri-state "status" chip-row in the example.
// We map each chip to the pair of contract params it implies.
const STATUS_FILTERS = [
  ["active", "Active", { active: "true", resolved: "false" }],
  ["resolved", "Resolved", { active: "all", resolved: "true" }],
  ["all", "All", { active: "all", resolved: "all" }],
];

/** One table row's G2 sparkline. Owns a single `useMarketSparkline` hook so the
 *  hook count per mounted row stays constant regardless of API state. */
function MarketRowSpark({ marketId }) {
  const { data } = useMarketSparkline(marketId, { points: 30 });
  const values = data?.values ?? [];
  if (values.length === 0) {
    return <span className="t-mut" style={{ fontSize: 12 }}>—</span>;
  }
  // Direction → delta sign so MiniSpark picks the right colour.
  return <MiniSpark data={values} delta={data?.direction === "down" ? -1 : 1} />;
}

export default function MarketsScreen() {
  const router = useRouter();
  const [category, setCategory] = useState("all");
  const [statusKey, setStatusKey] = useState("active");
  const [orderBy, setOrderBy] = useState("volume_total");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);

  const status = STATUS_FILTERS.find((s) => s[0] === statusKey)[2];

  const params = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      order,
      order_by: orderBy,
      active: status.active,
      resolved: status.resolved,
      ...(category !== "all" ? { category } : {}),
    }),
    [page, order, orderBy, status.active, status.resolved, category]
  );

  const { data, isLoading, isError, error, refetch, isFetching } =
    useMarkets(params);

  const items = data?.items ?? [];
  const total = data?.total ?? null; // may legitimately be null
  const hasMore = data?.has_more ?? false;

  // Any filter change resets pagination to page 1.
  function applyCategory(c) {
    setCategory(c);
    setPage(1);
  }
  function applyStatus(s) {
    setStatusKey(s);
    setPage(1);
  }
  function applyOrderBy(o) {
    setOrderBy(o);
    setPage(1);
  }
  function toggleOrder() {
    setOrder((o) => (o === "desc" ? "asc" : "desc"));
    setPage(1);
  }

  const columns = [
    {
      key: "question",
      label: "Question",
      truncate: true,
      render: (r) => <span>{r.question}</span>,
    },
    {
      key: "category",
      label: "Category",
      render: (r) => <CatPill cat={r.category} />,
    },
    {
      key: "volume_total",
      label: "Vol Total",
      align: "right",
      mono: true,
      render: (r) => fmtUSD(r.volume_total),
    },
    {
      key: "liquidity",
      label: "Liquidity",
      align: "right",
      mono: true,
      render: (r) => fmtUSD(r.liquidity),
    },
    {
      key: "outcomes",
      label: "Outcomes",
      sortable: false,
      render: (r) => (
        <span className="t-mut" style={{ fontSize: 12 }}>
          {(r.outcomes || []).join(" / ") || "—"}
        </span>
      ),
    },
    {
      key: "tags",
      label: "Tags",
      sortable: false,
      render: (r) => (
        <span className="t-mut" style={{ fontSize: 12 }}>
          {(r.tags || []).slice(0, 2).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "spark",
      label: "Trend",
      sortable: false,
      render: (r) => <MarketRowSpark marketId={r.id} />,
    },
    {
      key: "end_date",
      label: "Ends",
      sortable: false,
      render: (r) => (
        <span className="t-mut" style={{ fontSize: 12 }}>
          {r.end_date ? new Date(r.end_date).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "active",
      label: "Status",
      sortable: false,
      render: (r) => (
        <span
          className={r.resolved ? "t-mut" : r.active ? "t-pos" : "t-neg"}
          style={{ fontSize: 12 }}
        >
          {r.resolved ? "Resolved" : r.active ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  const subline = isLoading
    ? "Loading…"
    : total != null
      ? `${fmtNum(total)} markets · live tracking`
      : "live tracking";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Markets</h1>
          <div className="page-sub">{subline}</div>
        </div>
        {isFetching && !isLoading && (
          <div className="t-mut" style={{ fontSize: 12 }}>
            Updating…
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div
          className="card-body"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div className="chip-row">
            {CATEGORIES.map(([k, l]) => (
              <button
                key={k}
                className={"chip " + (category === k ? "active" : "")}
                onClick={() => applyCategory(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div className="chip-row">
            {STATUS_FILTERS.map(([k, l]) => (
              <button
                key={k}
                className={"chip " + (statusKey === k ? "active" : "")}
                onClick={() => applyStatus(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div
          className="card-body"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <span className="t-mut" style={{ fontSize: 12 }}>
            Sort by
          </span>
          <div className="chip-row">
            {ORDER_BY.map(([k, l]) => (
              <button
                key={k}
                className={"chip " + (orderBy === k ? "active" : "")}
                onClick={() => applyOrderBy(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <button className="chip" onClick={toggleOrder} title="Toggle order">
            <Icon name={order === "desc" ? "arrow-down" : "arrow-up"} size={12} />
            {order === "desc" ? "Desc" : "Asc"}
          </button>
        </div>
      </div>

      <div className="card">
        {isError ? (
          <div className="card-body">
            <div className="empty">
              <Icon name="alert" size={20} />
              <div className="ttl">Failed to load markets</div>
              <div className="sub">
                {ApiError.is(error)
                  ? `${error.code} — ${error.message}`
                  : "Unexpected error. Please try again."}
              </div>
              <button
                className="btn sm"
                style={{ marginTop: 10 }}
                onClick={() => refetch()}
              >
                <Icon name="refresh" size={12} /> Retry
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="card-body">
            <div className="skel" style={{ height: 32, marginBottom: 8 }} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="skel"
                style={{ height: 40, marginBottom: 6 }}
              />
            ))}
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            serverPaginated
            page={page}
            onPageChange={setPage}
            hasMore={hasMore}
            total={total}
            pageSize={PAGE_SIZE}
            onRowClick={(r) => router.push("/markets/" + r.slug)}
          />
        )}
      </div>
    </div>
  );
}
