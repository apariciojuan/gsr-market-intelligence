/* /signals/[id] — Signal (divergence) detail (Fase 4, task 4.10).
 *
 * NEW screen: the web-example has no standalone signal-detail page — it only
 * showed divergences embedded in the dashboard / signals list. This screen is
 * built from that embedded detail plus the `/signals/{id}` shape in
 * API_CONTRACT.md §7 (`SignalDetail`: divergence + market + market_series +
 * external_series + detection_point + related_news).
 *
 * Data comes exclusively from `useSignal(id)` (React Query → api.signals.detail).
 * Renders G13 `MarketVsChainlink` with the detection point marker, a divergence
 * summary panel, and the related-news list. Handles loading / empty / error,
 * including the 404 `DIVERGENCE_NOT_FOUND` case as a dedicated not-found state.
 */

import Link from "next/link";
import { useSignal } from "../lib/hooks/useSignals";
import { sourcePillKey } from "../lib/externalSignals";
import { ExternalSignalBody, splitSignalHeadline } from "../lib/externalSignalContent";
import {
  StatusPill,
  Icon,
  fmtPct,
  fmtTime,
  fmtRelTime,
} from "../lib/components";
import { MarketVsChainlink } from "../lib/charts";

/** Maps a contract `divergence_type` to a StatusPill status key. */
function typeToPill(type) {
  if (type === "price_gap_vs_chainlink" || type === "chainlink_move_no_market")
    return "price_gap";
  if (type === "sudden_move_no_signal") return "sudden";
  return "news";
}

/** Human label for a divergence type. */
const TYPE_LABELS = {
  price_gap_vs_chainlink: "Price gap vs Chainlink",
  news_not_reflected: "News not reflected",
  sudden_move_no_signal: "Sudden move, no signal",
  chainlink_move_no_market: "Chainlink move, no market reaction",
};

/** 1–5 severity meter. */
function SevMeter({ severity }) {
  return (
    <span className="sev-meter">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={"s " + (i <= severity ? "on" : "")} />
      ))}
    </span>
  );
}

/**
 * @param {object} props
 * @param {number|undefined} props.id  divergence id (parsed from the route by the page)
 */
export default function SignalDetailScreen({ id }) {
  const { data, isLoading, isError, error, refetch } = useSignal(id);

  // ---- Error: distinguish 404 (not found) from everything else ----
  if (isError) {
    const notFound = error?.status === 404 || error?.code === "DIVERGENCE_NOT_FOUND";
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Signal Detail</h1>
            <div className="page-sub">Divergence #{id ?? "—"}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 48 }}>
            <Icon
              name={notFound ? "x-circle" : "alert"}
              size={30}
              color="var(--danger)"
            />
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "var(--text-primary)",
                marginTop: 12,
              }}
            >
              {notFound ? "Divergence not found" : "Couldn't load this signal"}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                marginTop: 6,
                marginBottom: 18,
              }}
            >
              {notFound
                ? "This divergence doesn't exist or is no longer available."
                : error?.message || "Unexpected error."}
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "center" }}
            >
              {!notFound && (
                <button className="btn sm" onClick={() => refetch()}>
                  Retry
                </button>
              )}
              <Link className="btn ghost sm" href="/signals">
                <Icon name="arrow-left" size={12} /> Back to signals
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Loading ----
  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="skel" style={{ height: 24, width: 220, marginBottom: 8 }} />
            <div className="skel" style={{ height: 14, width: 320 }} />
          </div>
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="skel" style={{ height: 360, width: "100%" }} />
          </div>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <div className="card-body">
              <div className="skel" style={{ height: 120, width: "100%" }} />
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="skel" style={{ height: 120, width: "100%" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Empty (hook disabled / no payload) ----
  if (!data) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Signal Detail</h1>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 48 }}>
            <Icon name="info" size={28} color="var(--text-secondary)" />
            <div
              style={{ fontSize: 14, color: "var(--text-primary)", marginTop: 12 }}
            >
              No signal data available
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { divergence: d, market: m, market_series, external_series } = data;
  const detectionPoint = data.detection_point;
  const relatedNews = data.related_news ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{m.question}</h1>
          <div
            className="page-sub"
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <StatusPill status={typeToPill(d.divergence_type)} />
            <span>{TYPE_LABELS[d.divergence_type] || d.divergence_type}</span>
            <span>·</span>
            <span>Severity</span>
            <SevMeter severity={d.severity} />
            <span>·</span>
            <StatusPill status={d.status} />
          </div>
        </div>
        <Link className="btn ghost sm" href={"/markets/" + m.slug}>
          Open market <Icon name="arrow-right" size={12} />
        </Link>
      </div>

      {/* ---- G13 Market vs Chainlink ---- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <MarketVsChainlink
            marketSeries={market_series}
            externalSeries={external_series}
            detectionPoint={detectionPoint}
          />
        </div>
      </div>

      <div className="grid grid-2">
        {/* ---- Divergence summary + detection point ---- */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Divergence</h3>
              <div className="card-sub">
                Detected{" "}
                {detectionPoint
                  ? fmtTime(detectionPoint.t)
                  : fmtTime(d.detected_at)}
              </div>
            </div>
          </div>
          <div className="card-body">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <div className="stat-k">Polymarket implied prob</div>
                <div className="stat-v" style={{ fontSize: 18 }}>
                  {(d.market_value * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="stat-k">{d.external_source}</div>
                <div className="stat-v" style={{ fontSize: 18 }}>
                  {(d.external_value * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="stat-k">Magnitude</div>
                <div
                  className="stat-v"
                  style={{
                    fontSize: 18,
                    color:
                      d.direction === "market_below"
                        ? "var(--danger)"
                        : "var(--success)",
                  }}
                >
                  {d.direction === "market_below" ? "▼" : "▲"}{" "}
                  {fmtPct(d.magnitude_pct)}
                </div>
              </div>
              <div>
                <div className="stat-k">Direction</div>
                <div className="stat-v" style={{ fontSize: 18 }}>
                  {d.direction === "market_below"
                    ? "Market below"
                    : "Market above"}
                </div>
              </div>
              <div>
                <div className="stat-k">Time window</div>
                <div className="stat-v" style={{ fontSize: 18 }}>
                  {d.time_window_minutes}m
                </div>
              </div>
              <div>
                <div className="stat-k">Last updated</div>
                <div className="stat-v" style={{ fontSize: 18 }}>
                  {fmtRelTime(new Date(d.last_updated_at).getTime())}
                </div>
              </div>
            </div>

            {detectionPoint && (
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 12,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span style={{ color: "var(--warning)", fontWeight: 500 }}>
                  Detection point
                </span>{" "}
                — {fmtTime(detectionPoint.t)} · market{" "}
                {(detectionPoint.market_value * 100).toFixed(0)}% vs external{" "}
                {(detectionPoint.external_value * 100).toFixed(0)}% (
                {fmtPct(detectionPoint.magnitude_pct)} gap)
              </div>
            )}
          </div>
        </div>

        {/* ---- Related news ---- */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Related External Signals</h3>
              <div className="card-sub">
                {relatedNews.length} item{relatedNews.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="card-body">
            {relatedNews.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 24,
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                <Icon name="info" size={22} color="var(--text-secondary)" />
                <div style={{ marginTop: 8 }}>No related external signals for this divergence</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {relatedNews.map((n) => {
                  const xParsed = n.source?.startsWith("x_")
                    ? splitSignalHeadline(n.summary || n.title)
                    : null;
                  return (
                  <a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="card"
                    style={{
                      background: "var(--bg-base)",
                      padding: 12,
                      display: "block",
                      textDecoration: "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                        fontSize: 11,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <StatusPill status={sourcePillKey(n.source)} />
                      <span>{fmtTime(n.published_at)}</span>
                    </div>
                    {xParsed ? (
                      <>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            lineHeight: 1.45,
                          }}
                        >
                          {xParsed.headline}
                        </div>
                        <ExternalSignalBody
                          raw={xParsed.body || ""}
                          imageUrl={xParsed.imageUrl}
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            marginBottom: 4,
                            lineHeight: 1.45,
                          }}
                        >
                          {n.title}
                        </div>
                        {n.summary && n.summary !== n.title && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-secondary)",
                              lineHeight: 1.5,
                            }}
                          >
                            {n.summary}
                          </div>
                        )}
                      </>
                    )}
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: "var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      Read source <Icon name="external-link" size={11} />
                    </div>
                  </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
