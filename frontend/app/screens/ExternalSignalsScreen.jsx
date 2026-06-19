/* /external-signals — Global feed of textual external signals (X, Telegram, RSS). */

import { useState } from "react";
import Link from "next/link";
import { useExternalSignals } from "../lib/hooks/useExternalSignals";
import { StatusPill, Icon, fmtRelTime } from "../lib/components";
import { SOURCE_FILTERS, sourceFilterParam, sourceLabel, sourcePillKey } from "../lib/externalSignals";
import { ExternalSignalBody, splitSignalHeadline } from "../lib/externalSignalContent";
import { ApiError } from "../lib/api";

const PAGE_SIZE = 30;

function isHtmlSignal(source) {
  return source?.startsWith("x_");
}

function ExternalSignalCard({ item }) {
  const html = isHtmlSignal(item.source);
  const parsed = html
    ? splitSignalHeadline(item.text || item.title)
    : {
        headline: item.title || item.text?.slice(0, 160) || "",
        body:
          item.title && item.text && item.text.length > item.title.length
            ? item.text.slice(item.title.length).trim()
            : null,
        imageUrl: null,
      };

  const headline = parsed.headline || item.title || item.text?.slice(0, 160) || "";
  const body = parsed.body;

  return (
    <div
      style={{
        padding: 14,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusPill status={sourcePillKey(item.source)} />
          <Link
            href={"/markets/" + item.slug}
            style={{ fontSize: 12, color: "var(--accent)" }}
          >
            {item.slug}
          </Link>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {fmtRelTime(item.timestamp)}
        </span>
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-primary)",
          display: "block",
          lineHeight: 1.45,
        }}
      >
        {headline}
      </a>

      {(body || parsed.imageUrl) && (
        <ExternalSignalBody
          raw={body || ""}
          imageUrl={parsed.imageUrl}
          style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}
        />
      )}

      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 8,
          fontFamily: "var(--font-mono)",
        }}
      >
        {sourceLabel(item.source)} · {item.language}
      </div>
    </div>
  );
}

export default function ExternalSignalsScreen() {
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useExternalSignals({
      source: sourceFilterParam(source),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });

  const items = data?.items ?? [];
  const total = data?.total ?? null;
  const hasMore = data?.has_more ?? false;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">External Signals</h1>
          <div className="page-sub">
            X, Telegram and RSS messages matched to Polymarket markets
          </div>
        </div>
        {total != null && (
          <div className="t-mut" style={{ fontSize: 12 }}>
            {total.toLocaleString()} signal{total === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div
          className="card-body"
          style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
        >
          <div className="chip-row">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.value}
                className={"chip " + (source === f.value ? "active" : "")}
                onClick={() => {
                  setSource(f.value);
                  setPage(0);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button
            className="btn ghost sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <Icon name="refresh" size={12} /> Refresh
          </button>
        </div>
      </div>

      <div className="card">
        {isError && (
          <div className="empty" style={{ padding: 32 }}>
            <Icon name="alert" size={24} />
            <div className="ttl">Failed to load external signals</div>
            <div className="sub">
              {ApiError.is(error)
                ? `${error.code} — ${error.message}`
                : "Unexpected error. Please try again."}
            </div>
            <button className="btn sm" style={{ marginTop: 12 }} onClick={() => refetch()}>
              <Icon name="refresh" size={12} /> Retry
            </button>
          </div>
        )}

        {isLoading && (
          <div style={{ padding: 16 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 88, marginBottom: 8 }} />
            ))}
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="empty" style={{ padding: 40 }}>
            <Icon name="info" size={28} color="var(--text-secondary)" />
            <div className="ttl">No external signals yet</div>
            <div className="sub">
              Run the external signals collector or wait for the next scheduled
              ingestion cycle.
            </div>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <>
            {items.map((item) => (
              <ExternalSignalCard key={item.id} item={item} />
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 12,
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <button
                className="btn ghost sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Page {page + 1}
                {total != null ? ` · ${total} total` : ""}
              </span>
              <button
                className="btn ghost sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
