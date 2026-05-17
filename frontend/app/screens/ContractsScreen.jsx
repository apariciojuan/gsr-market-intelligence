/* GSR Market Intelligence — Contracts Explorer screen (Fase 4, task 4.5).
 *
 * Ported from `web-example/nextjs/screens/index.jsx` (`ContractsScreen`).
 *
 * The example was a dumb search box that just rewrote `location.hash`. The
 * real screen drives the explore → poll flow from API_CONTRACT.md §5:
 *
 *   POST /contracts/explore
 *     → 200 "ready"  : contract already indexed → go straight to the detail.
 *     → 202 "queued" : indexing job enqueued → poll GET /contracts/{address}
 *                      /sync-status until `completed` (then navigate) or
 *                      `error` (surface the message).
 *
 * Errors: `INVALID_ADDRESS` (400) is shown inline under the input; any other
 * `ApiError` (e.g. `RPC_UNAVAILABLE`) is shown as a generic error banner.
 *
 * Data access: only `useExploreContract` + `useSyncStatus` hooks — never JSON
 * or fetch directly.
 */
import React, { useState } from "react";
import { useRouter } from "next/router";
import * as C from "../lib/components";
import { useExploreContract, useSyncStatus } from "../lib/hooks/useContracts";
import { ApiError } from "../lib/api/error";

const { Icon } = C;

export default function ContractsScreen() {
  const router = useRouter();
  const [value, setValue] = useState("");
  // The address that has an in-flight indexing job (drives the polling query).
  const [jobAddress, setJobAddress] = useState(null);

  const explore = useExploreContract();
  // Poll sync-status only while a job is queued. The hook stops polling on
  // its own once `sync_status` is `completed` or `error`.
  const sync = useSyncStatus(jobAddress ?? undefined, true);

  // ---- derived error state -------------------------------------------------
  const exploreError = explore.error;
  const isInvalidAddress =
    ApiError.is(exploreError) && exploreError.code === "INVALID_ADDRESS";
  const genericError =
    exploreError && !isInvalidAddress
      ? exploreError instanceof Error
        ? exploreError.message
        : "Something went wrong while exploring this address."
      : null;

  const syncErrored =
    sync.data?.sync_status === "error" || ApiError.is(sync.error);
  const syncErrorMessage = sync.data?.error_message
    ? sync.data.error_message
    : ApiError.is(sync.error)
      ? sync.error.message
      : "Indexing failed for this address.";

  // ---- submit --------------------------------------------------------------
  function onSubmit(e) {
    e.preventDefault();
    const address = value.trim();
    if (!address || explore.isPending) return;
    setJobAddress(null);
    explore.mutate(
      { address },
      {
        onSuccess: (res) => {
          if (res.status === "ready") {
            // Already indexed → straight to the detail page.
            router.push(`/contracts/${res.contract.address}`);
          } else {
            // Job queued → start polling sync-status for this address.
            setJobAddress(res.address);
          }
        },
      }
    );
  }

  // When a polled job finishes, navigate to the detail page.
  const polledAddress = jobAddress;
  React.useEffect(() => {
    if (polledAddress && sync.data?.sync_status === "completed") {
      router.push(`/contracts/${polledAddress}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledAddress, sync.data?.sync_status]);

  const isQueued = !!jobAddress && !syncErrored;
  const isBusy = explore.isPending || isQueued;
  const progress = sync.data?.progress_pct ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Explorer</h1>
          <div className="page-sub">
            Paste any Polygon address to inspect on-chain activity
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 32,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Icon name="search" size={28} color="var(--text-muted)" />

        <form
          onSubmit={onSubmit}
          style={{ width: "100%", maxWidth: 640, display: "flex", gap: 8 }}
        >
          <input
            className="form-input"
            style={{ flex: 1, height: 42, fontFamily: "var(--font-mono)" }}
            placeholder="0x…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isBusy}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button
            type="submit"
            className="btn primary lg"
            disabled={isBusy || !value.trim()}
          >
            {explore.isPending ? "Exploring…" : "Inspect"}{" "}
            <Icon name="arrow-right" size={14} />
          </button>
        </form>

        {/* INVALID_ADDRESS — inline validation message under the input. */}
        {isInvalidAddress && (
          <div
            style={{
              width: "100%",
              maxWidth: 640,
              fontSize: 12,
              color: "var(--danger)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="alert" size={13} color="var(--danger)" />
            {exploreError.message ||
              "That doesn't look like a valid Polygon address."}
          </div>
        )}

        {/* Generic explore error (e.g. RPC_UNAVAILABLE). */}
        {genericError && (
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 640,
              background: "var(--bg-base)",
              borderColor: "rgba(239,68,68,0.3)",
            }}
          >
            <div
              className="card-body"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <Icon name="x-circle" size={18} color="var(--danger)" />
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {genericError}
              </div>
            </div>
          </div>
        )}

        {/* Queued job → polling progress. */}
        {isQueued && (
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 640,
              background: "var(--accent-subtle)",
              borderColor: "rgba(79,140,255,0.3)",
            }}
          >
            <div
              className="card-body"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Icon name="clock" size={18} color="var(--accent)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>
                    Indexing on-chain activity…
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {jobAddress}
                  </div>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 13, color: "var(--text-primary)" }}
                >
                  {progress.toFixed(0)}%
                </div>
              </div>

              {/* Progress bar — reuses the holder-bar styling. */}
              <div className="holder-bar-wrap">
                <div
                  className="holder-bar-fill"
                  style={{
                    width: `${Math.max(2, Math.min(100, progress))}%`,
                    background: "var(--accent)",
                    transition: "width 400ms",
                  }}
                />
              </div>

              {sync.data && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    display: "flex",
                    gap: 14,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <span>
                    {C.fmtNum(sync.data.blocks_remaining)} blocks left
                  </span>
                  <span>·</span>
                  <span>
                    {C.fmtNum(sync.data.events_found)} events found
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sync job failed. */}
        {syncErrored && (
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 640,
              background: "var(--bg-base)",
              borderColor: "rgba(239,68,68,0.3)",
            }}
          >
            <div
              className="card-body"
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <Icon name="x-circle" size={18} color="var(--danger)" />
              <div style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)" }}>
                {syncErrorMessage}
              </div>
              <button
                className="btn sm"
                onClick={() => {
                  setJobAddress(null);
                  explore.reset();
                }}
              >
                <Icon name="refresh" size={12} /> Retry
              </button>
            </div>
          </div>
        )}

        {!isBusy && !genericError && !isInvalidAddress && !syncErrored && (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Enter a contract address to detect its type and on-chain history.
          </div>
        )}
      </div>
    </div>
  );
}
