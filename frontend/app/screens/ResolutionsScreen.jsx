/* /resolutions — Resolution Watchdog list (checklist task 4.7).
 *
 * Ported from `web-example/nextjs/screens/index.jsx` (`ResolutionsScreen`).
 * Differences from the example:
 *   - Data comes ONLY from React Query hooks (`useResolutions`,
 *     `useResolutionStats`) — no `GSR_MOCKS`, no JSON, no `fetch`.
 *   - Shapes follow `API_CONTRACT.md` / `lib/api/types.ts`: `seconds_remaining`,
 *     `is_urgent`, `market_question`, `market_slug`, `proposer_address`…
 *   - Filters (`status`, `ends_within_hours`, `min_bond_usd`, `q`) are passed
 *     to the API; the mock/http layer does the filtering + pagination.
 *   - Server-side pagination on the table (supports `total: null`).
 *   - loading / empty / error states.
 *   - Route is `/resolutions/[questionId]` (contract), not `[slug]`.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import Shell from "../components/Shell";
import {
  Icon,
  StatusPill,
  AddressPill,
  DataTable,
  fmtNum,
  fmtCountdown,
  fmtTime,
} from "../lib/components";
import { BondHistogram } from "../lib/charts";
import { useResolutions, useResolutionStats } from "../lib/hooks/useResolutions";

const PAGE_SIZE = 20;

// Status filter chips. `all` maps to no `status` param.
const STATUS_FILTERS = [
  ["all", "All"],
  ["pending", "Pending"],
  ["proposed", "Proposed"],
  ["disputed", "Disputed"],
  ["resolved", "Resolved"],
];

// Quick "ends within" presets (hours). `null` = no filter.
const ENDS_FILTERS = [
  [null, "Any window"],
  [1, "< 1h"],
  [6, "< 6h"],
  [24, "< 24h"],
];

function StatBox({ label, value }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div className="stat-k">{label}</div>
      <div className="stat-v" style={{ fontSize: 18 }}>{value}</div>
    </div>
  );
}

export default function ResolutionsScreen() {
  const router = useRouter();

  const [status, setStatus] = useState("all");
  const [endsWithin, setEndsWithin] = useState(null);
  const [minBond, setMinBond] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // `min_bond_usd` is a free-text number; only send it when it parses.
  const minBondNum = minBond.trim() === "" ? undefined : Number(minBond);

  const params = useMemo(
    () => ({
      status,
      ends_within_hours: endsWithin ?? undefined,
      min_bond_usd:
        minBondNum != null && !Number.isNaN(minBondNum) ? minBondNum : undefined,
      q: q.trim() || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      order_by: "request_timestamp",
      order: "desc",
    }),
    [status, endsWithin, minBondNum, q, page]
  );

  const listQuery = useResolutions(params);
  const statsQuery = useResolutionStats();

  const stats = statsQuery.data;
  const list = listQuery.data;
  const rows = list?.items ?? [];

  // Reset to page 1 whenever a filter changes.
  function applyFilter(fn) {
    setPage(1);
    fn();
  }

  const cols = [
    {
      key: "status",
      label: "Status",
      sortable: false,
      render: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "outcome",
      label: "Outcome",
      sortable: false,
      render: (r) => {
        // resolved_outcome is the final settled result; proposed_outcome is the
        // (not-yet-final) proposal shown with a "· prop." marker.
        const outcome = r.resolved_outcome ?? r.proposed_outcome;
        if (!outcome) return <span className="t-mut">—</span>;
        const cls = outcome === "Yes" ? "t-pos" : outcome === "No" ? "t-neg" : "";
        return (
          <span className={cls} style={{ fontWeight: 600 }}>
            {outcome}
            {r.resolved_outcome ? "" : " · prop."}
          </span>
        );
      },
    },
    {
      key: "market_question",
      label: "Question",
      sortable: false,
      truncate: true,
      render: (r) => <span>{r.market_question}</span>,
    },
    {
      key: "bond_usd",
      label: "Bond",
      align: "right",
      mono: true,
      sortable: false,
      render: (r) => "$" + fmtNum(r.bond_usd),
    },
    {
      key: "proposer_address",
      label: "Proposer",
      sortable: false,
      render: (r) =>
        r.proposer_address ? (
          <AddressPill address={r.proposer_address} />
        ) : (
          <span className="t-mut">—</span>
        ),
    },
    {
      key: "disputer_address",
      label: "Disputer",
      sortable: false,
      render: (r) =>
        r.disputer_address ? (
          <AddressPill address={r.disputer_address} />
        ) : (
          <span className="t-mut">—</span>
        ),
    },
    {
      key: "seconds_remaining",
      label: "Window",
      align: "right",
      mono: true,
      sortable: false,
      render: (r) => {
        if (r.status === "resolved" || r.seconds_remaining == null) {
          return <span className="t-mut">—</span>;
        }
        if (r.seconds_remaining <= 0) {
          return <span className="t-mut">✓ Passed</span>;
        }
        return (
          <span
            style={{
              color: r.is_urgent ? "var(--warning)" : "var(--text-primary)",
            }}
          >
            {fmtCountdown(r.seconds_remaining * 1000)}
          </span>
        );
      },
    },
    {
      key: "request_timestamp",
      label: "Requested",
      mono: true,
      sortable: false,
      render: (r) => fmtTime(r.request_timestamp).slice(0, 10),
    },
    {
      key: "_actions",
      label: "",
      sortable: false,
      render: (r) => (
        <a
          className="btn sm"
          href={r.uma_oracle_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          UMA <Icon name="external-link" size={11} />
        </a>
      ),
    },
  ];

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Resolution Watchdog</h1>
          <div className="page-sub">
            Monitor UMA Optimistic Oracle disputes in real-time
          </div>
        </div>
      </div>

      {/* Stats banner + G11 Bond Distribution */}
      {statsQuery.isError ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="empty">
              <Icon name="alert" size={20} />
              <div className="ttl">Couldn’t load resolution stats</div>
              <div className="sub">
                {statsQuery.error?.message || "Please try again."}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div
              className="card-body"
              style={{ display: "flex", gap: 28, flexWrap: "wrap" }}
            >
              <StatBox
                label="Total resolutions"
                value={
                  statsQuery.isLoading
                    ? "…"
                    : fmtNum(stats?.total_resolutions)
                }
              />
              <StatBox
                label="Disputed"
                value={
                  statsQuery.isLoading ? "…" : fmtNum(stats?.disputed_count)
                }
              />
              <StatBox
                label="Dispute rate"
                value={
                  statsQuery.isLoading
                    ? "…"
                    : (stats?.dispute_rate_pct ?? 0).toFixed(1) + "%"
                }
              />
              <StatBox
                label="Avg resolution time"
                value={
                  statsQuery.isLoading
                    ? "…"
                    : fmtCountdown((stats?.avg_resolution_seconds ?? 0) * 1000)
                }
              />
            </div>
          </div>

          <BondHistogram
            histogram={stats?.bond_histogram}
            windowLabel={
              stats?.window ? "Window: " + stats.window : "Last 30d"
            }
            loading={statsQuery.isLoading}
          />
        </>
      )}

      {/* Filters */}
      <div className="card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div
          className="card-body"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div className="chip-row">
            {STATUS_FILTERS.map(([k, l]) => (
              <button
                key={k}
                className={"chip " + (status === k ? "active" : "")}
                onClick={() => applyFilter(() => setStatus(k))}
              >
                {l}
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div className="chip-row">
              {ENDS_FILTERS.map(([k, l]) => (
                <button
                  key={l}
                  className={"chip " + (endsWithin === k ? "active" : "")}
                  onClick={() => applyFilter(() => setEndsWithin(k))}
                >
                  {l}
                </button>
              ))}
            </div>
            <input
              className="form-input"
              style={{ width: 130 }}
              type="number"
              min={0}
              placeholder="Min bond $"
              value={minBond}
              onChange={(e) => applyFilter(() => setMinBond(e.target.value))}
            />
            <input
              className="form-input"
              style={{ width: 200 }}
              placeholder="Search question…"
              value={q}
              onChange={(e) => applyFilter(() => setQ(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {listQuery.isError ? (
          <div className="card-body">
            <div className="empty">
              <Icon name="alert" size={20} />
              <div className="ttl">Couldn’t load resolutions</div>
              <div className="sub">
                {listQuery.error?.message || "Please try again."}
              </div>
            </div>
          </div>
        ) : listQuery.isLoading ? (
          <div className="card-body">
            <div className="empty">
              <Icon name="clock" size={20} />
              <div className="ttl">Loading resolutions…</div>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="card-body">
            <div className="empty">
              <Icon name="search" size={20} />
              <div className="ttl">No resolutions match these filters</div>
              <div className="sub">Try widening the status or bond filters.</div>
            </div>
          </div>
        ) : (
          <DataTable
            columns={cols}
            data={rows}
            serverPaginated
            page={page}
            onPageChange={setPage}
            hasMore={!!list?.has_more}
            total={list?.total ?? null}
            pageSize={PAGE_SIZE}
            onRowClick={(r) =>
              router.push("/resolutions/" + r.question_id)
            }
            flagRow={(r) =>
              r.status === "disputed"
                ? "warning"
                : r.is_urgent
                ? "danger"
                : null
            }
          />
        )}
      </div>
    </Shell>
  );
}
