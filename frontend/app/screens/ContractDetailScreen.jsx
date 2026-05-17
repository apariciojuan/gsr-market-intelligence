/* GSR Market Intelligence — Contract Detail screen (Fase 4, task 4.6).
 *
 * Ported from `web-example/nextjs/screens/index.jsx` (`ContractDetailScreen`).
 *
 * Receives `address` as a prop (the page reads it from the router). Wires up:
 *   - useContractSummary      → GET /contracts/{address}/summary  (header)
 *   - useContractActivity     → GET /contracts/{address}/activity (G8 + G9)
 *   - useContractTransactions → GET /contracts/{address}/transactions (table)
 *
 * The transactions table is server-paginated: `total` may be `null` for a
 * massive hypertable, so the DataTable footer works off `has_more` only.
 *
 * Every section has explicit loading / empty / error states. Data access is
 * exclusively through the React Query hooks — never JSON or fetch directly.
 */
import React, { useState } from "react";
import Link from "next/link";
import * as C from "../lib/components";
import * as G from "../lib/charts";
import {
  useContractSummary,
  useContractActivity,
  useContractTransactions,
} from "../lib/hooks/useContracts";
import { ApiError } from "../lib/api/error";

const {
  Icon,
  StatusPill,
  AddressPill,
  DataTable,
  fmtNum,
  fmtUSD,
  fmtRelTime,
  fmtTime,
  truncAddr,
} = C;
const { ContractActivity, WalletsDaily } = G;

const TX_PAGE_SIZE = 10;

/** Small inline error card used per-section. */
function SectionError({ error, label }) {
  const msg =
    error instanceof Error ? error.message : `Could not load ${label}.`;
  return (
    <div
      className="card"
      style={{ borderColor: "rgba(239,68,68,0.3)", background: "var(--bg-base)" }}
    >
      <div
        className="card-body"
        style={{ display: "flex", alignItems: "center", gap: 10 }}
      >
        <Icon name="x-circle" size={18} color="var(--danger)" />
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{msg}</div>
      </div>
    </div>
  );
}

export default function ContractDetailScreen({ address }) {
  const [txPage, setTxPage] = useState(1);

  const summaryQ = useContractSummary(address);
  const activityQ = useContractActivity(address);
  const txQ = useContractTransactions(address, {
    limit: TX_PAGE_SIZE,
    offset: (txPage - 1) * TX_PAGE_SIZE,
  });

  const summary = summaryQ.data;
  const buckets = activityQ.data?.buckets ?? [];

  // 404 on the summary → the address simply isn't a known/indexed contract.
  const notFound =
    ApiError.is(summaryQ.error) && summaryQ.error.status === 404;

  // ---- transactions table columns -----------------------------------------
  const txColumns = [
    {
      key: "time",
      label: "Time",
      mono: true,
      render: (r) => (
        <span title={fmtTime(r.time)}>{fmtRelTime(new Date(r.time).getTime())}</span>
      ),
    },
    {
      key: "event_name",
      label: "Event",
      render: (r) => (
        <span className="pill neutral">
          <span className="dot" />
          {r.event_name}
        </span>
      ),
    },
    {
      key: "from_address",
      label: "From",
      render: (r) => <AddressPill address={r.from_address} />,
    },
    {
      key: "to_address",
      label: "To",
      render: (r) => <AddressPill address={r.to_address} />,
    },
    {
      key: "value_usd",
      label: "Value",
      align: "right",
      mono: true,
      render: (r) => fmtUSD(r.value_usd),
    },
    {
      key: "block_number",
      label: "Block",
      align: "right",
      mono: true,
      render: (r) => fmtNum(r.block_number),
    },
    {
      key: "tx_hash",
      label: "Tx Hash",
      sortable: false,
      render: (r) => (
        <a
          href={r.polygonscan_url}
          target="_blank"
          rel="noreferrer"
          className="mono"
          style={{ fontSize: 11, color: "var(--accent)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {truncAddr(r.tx_hash, 6)}
        </a>
      ),
    },
  ];

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <div>
      <Link href="/contracts" className="back-link">
        <Icon name="arrow-left" size={12} /> Explorer
      </Link>

      {/* ---- HEADER ---------------------------------------------------- */}
      {summaryQ.isLoading && (
        <div className="page-header" style={{ marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ width: 120, height: 20, marginBottom: 10 }} />
            <div className="skel" style={{ width: 420, height: 26, marginBottom: 10 }} />
            <div className="skel" style={{ width: 320, height: 14 }} />
          </div>
        </div>
      )}

      {notFound && (
        <div className="card" style={{ marginTop: 8 }}>
          <div
            className="card-body"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: 40,
              textAlign: "center",
            }}
          >
            <Icon name="search" size={28} color="var(--text-muted)" />
            <div style={{ fontSize: 15, fontWeight: 500 }}>Contract not found</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              No indexed contract at{" "}
              <span className="mono" style={{ color: "var(--text-primary)" }}>
                {address}
              </span>
              .
            </div>
            <Link href="/contracts" className="btn" style={{ marginTop: 6 }}>
              <Icon name="arrow-left" size={13} /> Back to Explorer
            </Link>
          </div>
        </div>
      )}

      {summaryQ.isError && !notFound && (
        <div style={{ marginTop: 8 }}>
          <SectionError error={summaryQ.error} label="contract summary" />
        </div>
      )}

      {summary && (
        <>
          <div
            className="page-header"
            style={{ marginTop: 8, alignItems: "flex-start" }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <StatusPill status="active" />
                <span className="pill purple">
                  <span className="dot" />
                  {summary.contract.contract_type}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  color: "var(--text-primary)",
                  wordBreak: "break-all",
                }}
              >
                {summary.contract.address}
              </div>
              <div className="meta-row" style={{ marginTop: 8 }}>
                <span>
                  Name{" "}
                  <b className="mono" style={{ color: "var(--text-primary)" }}>
                    {summary.contract.name}
                  </b>
                </span>
                <span className="sep">·</span>
                <span>
                  First activity{" "}
                  <b className="mono" style={{ color: "var(--text-primary)" }}>
                    {fmtTime(summary.first_activity).slice(0, 10)}
                  </b>
                </span>
                <span className="sep">·</span>
                <span>
                  Total txs{" "}
                  <b className="mono" style={{ color: "var(--text-primary)" }}>
                    {fmtNum(summary.total_transactions)}
                  </b>
                </span>
                <span className="sep">·</span>
                <span>
                  Unique wallets{" "}
                  <b className="mono" style={{ color: "var(--text-primary)" }}>
                    {fmtNum(summary.unique_wallets)}
                  </b>
                </span>
                <span className="sep">·</span>
                <span>
                  Total volume{" "}
                  <b className="mono" style={{ color: "var(--text-primary)" }}>
                    {fmtUSD(summary.total_volume_usd)}
                  </b>
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <AddressPill address={summary.contract.address} />
            </div>
          </div>

          {/* Linked-market banner — only when this contract maps to a market. */}
          {summary.linked_market && (
            <div
              className="card"
              style={{
                marginBottom: 16,
                background: "var(--accent-subtle)",
                borderColor: "rgba(79,140,255,0.3)",
              }}
            >
              <div
                className="card-body"
                style={{ display: "flex", alignItems: "center", gap: 16 }}
              >
                <Icon name="sparkles" size={20} color="var(--accent)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>
                    This contract is linked to a market
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    &ldquo;{summary.linked_market.question}&rdquo;
                  </div>
                </div>
                <Link
                  href={`/markets/${summary.linked_market.slug}`}
                  className="btn primary"
                >
                  View market <Icon name="arrow-right" size={14} />
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- ACTIVITY CHARTS (G8 + G9) --------------------------------- */}
      {activityQ.isError ? (
        <SectionError error={activityQ.error} label="activity" />
      ) : (
        <div className="grid grid-2">
          <ContractActivity
            buckets={buckets}
            interval={activityQ.data?.interval ?? "1d"}
            loading={activityQ.isLoading}
            empty={!activityQ.isLoading && buckets.length === 0}
          />
          <WalletsDaily
            buckets={buckets}
            loading={activityQ.isLoading}
            empty={!activityQ.isLoading && buckets.length === 0}
          />
        </div>
      )}

      {/* ---- TRANSACTIONS TABLE ---------------------------------------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Recent Transactions</h3>
          <div className="card-sub">Decoded events</div>
        </div>

        {txQ.isLoading && (
          <div className="card-body">
            <div className="skel" style={{ width: "100%", height: 220 }} />
          </div>
        )}

        {txQ.isError && (
          <div className="card-body">
            <SectionError error={txQ.error} label="transactions" />
          </div>
        )}

        {txQ.data &&
          (txQ.data.items.length === 0 && txPage === 1 ? (
            <div className="card-body">
              <div
                className="empty"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: 32,
                }}
              >
                <Icon name="info" size={20} color="var(--text-muted)" />
                <div className="ttl">No transactions indexed yet</div>
              </div>
            </div>
          ) : (
            <DataTable
              columns={txColumns}
              data={txQ.data.items}
              serverPaginated
              page={txPage}
              onPageChange={setTxPage}
              hasMore={txQ.data.has_more}
              total={txQ.data.total}
              pageSize={TX_PAGE_SIZE}
            />
          ))}
      </div>
    </div>
  );
}
