/* GSR — screens (Next.js) */
import React, { useState, useEffect } from "react";
import GSR_MOCKS from "../lib/mocks";
import * as C from "../lib/components";
import * as G from "../lib/charts";
const { Icon, KpiCard, CatPill, StatusPill, AddressPill, DataTable, TabBar, MiniSpark, fmtUSD, fmtNum, fmtPct, fmtPrice, fmtTime, fmtDay, fmtRelTime, truncAddr, fmtCountdown, useFlash } = C;
const { PriceChart, VolumeBars, OrderbookDepth, HoldersBar, BondHistogram, ResolutionTimeline, DivergenceMini, EcosystemVolume, ActiveMarkets, CategoryBars, CalibrationScatter, ActivityHeatmap, ContractActivity, WalletsDaily } = G;

/* GSR Market Intelligence — Screen components (10 screens).
   Each is a self-contained React function. Routed by app.jsx via hash. */

// =================================================================
// LOGIN
// =================================================================
function LoginScreen() {
  return (
    <div className="login-bg">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div className="brand-mark" style={{ width: 36, height: 36, fontSize: 16 }}>G</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>GSR Market Intelligence</div>
            <div className="brand-sub">Prediction markets terminal</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>Sign in to your account.</div>
        <div className="form-field">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" defaultValue="m.ortiz@gsr.io"/>
        </div>
        <div className="form-field">
          <label className="form-label">Password</label>
          <input className="form-input" type="password" defaultValue="••••••••••"/>
        </div>
        <a href="#/" className="btn primary btn-block lg" style={{ marginTop: 8 }}>Sign in</a>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 18 }}>
          Contact your admin for access · v1.0.0
        </div>
      </div>
    </div>
  );
}

// =================================================================
// DASHBOARD
// =================================================================
function DashboardScreen() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  // Live-ish ticking on first market price
  const markets = GSR_MOCKS.markets;

  const topColumns = [
    { key: "q", label: "Question", truncate: true, render: r => <span style={{ color: "var(--text-primary)" }}>{r.q}</span> },
    { key: "cat", label: "Cat", render: r => <CatPill cat={r.cat}/> },
    { key: "yes", label: "Yes", align: "right", mono: true, render: r => "$" + r.yes.toFixed(2) },
    { key: "d24", label: "Δ 24h", align: "right", mono: true, render: r => <span className={r.d24 >= 0 ? "t-pos" : "t-neg"}>{fmtPct(r.d24)}</span> },
    { key: "vol24", label: "Vol 24h", align: "right", mono: true, render: r => fmtUSD(r.vol24) },
    { key: "spark", label: "Trend", sortable: false, render: r => <MiniSpark data={r.spark} delta={r.d24}/> },
    { key: "endsIn", label: "Ends", render: r => <span className="t-mut" style={{ fontSize: 12 }}>{r.endsIn}</span> },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Live overview of the Polymarket ecosystem</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="filter" size={14}/> Last 24h</button>
          <button className="btn"><Icon name="download" size={14}/> Export</button>
        </div>
      </div>

      <div className="grid grid-5">
        {GSR_MOCKS.kpis.map(k => <KpiCard key={k.key} k={k}/>)}
      </div>

      <div className="grid grid-12" style={{ marginTop: 16 }}>
        <div className="col-8">
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Top Markets — Last 24h</h3>
                <div className="card-sub">Sorted by volume</div>
              </div>
              <a href="#/markets" className="btn ghost sm">View all <Icon name="arrow-right" size={12}/></a>
            </div>
            <div className="card-body flush">
              <DataTable
                columns={topColumns}
                data={markets}
                pageSize={10}
                paginate={false}
                onRowClick={r => location.hash = "#/markets/" + r.slug}
                defaultSort={{ key: "vol24", dir: "desc" }}
              />
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Active Resolutions</h3>
                <div className="card-sub">Awaiting outcome</div>
              </div>
              <a href="#/resolutions" className="btn ghost sm">View all <Icon name="arrow-right" size={12}/></a>
            </div>
            <div>
              {GSR_MOCKS.activeResolutions.map((r, i) => (
                <a href={"#/resolutions/" + r.slug} key={i} style={{ display: "block", padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)", transition: "background 150ms" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ marginBottom: 6 }}><StatusPill status={r.status}/></div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.question}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", display: "flex", gap: 10, fontFamily: "var(--font-mono)" }}>
                    <span>Bond ${r.bond}</span>
                    <span>·</span>
                    <span>Ends in {fmtCountdown(r.challengeEnds - Date.now())}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Notable Divergences — Last 24h</h3>
            <div className="card-sub">Markets out of sync with external signals</div>
          </div>
          <a href="#/signals" className="btn ghost sm">All signals <Icon name="arrow-right" size={12}/></a>
        </div>
        <div className="card-body">
          <div className="grid grid-3">
            {GSR_MOCKS.signals.slice(0, 3).map(s => (
              <div key={s.id} className="card" style={{ background: "var(--bg-base)" }}>
                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <StatusPill status={s.type === "Price Gap" ? "price_gap" : s.type === "Sudden Move" ? "sudden" : "news"}/>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                      <span>Severity</span>
                      <span className="sev-meter">
                        {[1,2,3,4,5].map(i => <span key={i} className={"s " + (i <= s.severity ? "on" : "")}/>)}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, minHeight: 36, lineHeight: 1.4 }}>{s.market}</div>
                  <DivergenceMini market={s.market_series} external={s.external_series}/>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 11, color: "var(--text-secondary)" }}>
                    <span>{s.detected}</span>
                    <a href={"#/markets/" + s.slug} className="btn sm">Investigate <Icon name="arrow-right" size={12}/></a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// MARKETS LIST
// =================================================================
function MarketsScreen() {
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  let data = GSR_MOCKS.markets;
  if (cat !== "all") data = data.filter(m => m.cat === cat);
  if (q) data = data.filter(m => m.q.toLowerCase().includes(q.toLowerCase()));
  const cats = [["all", "All"], ["politics", "Politics"], ["sports", "Sports"], ["crypto", "Crypto"], ["economics", "Economics"], ["pop", "Pop Culture"], ["science", "Science"]];
  const cols = [
    { key: "q", label: "Question", truncate: true, render: r => <span>{r.q}</span> },
    { key: "cat", label: "Category", render: r => <CatPill cat={r.cat}/> },
    { key: "yes", label: "Yes", align: "right", mono: true, render: r => "$" + r.yes.toFixed(2) },
    { key: "d24", label: "Δ 24h", align: "right", mono: true, render: r => <span className={r.d24 >= 0 ? "t-pos" : "t-neg"}>{fmtPct(r.d24)}</span> },
    { key: "vol24", label: "Vol 24h", align: "right", mono: true, render: r => fmtUSD(r.vol24) },
    { key: "vol", label: "Vol Total", align: "right", mono: true, render: r => fmtUSD(r.vol) },
    { key: "liq", label: "Liquidity", align: "right", mono: true, render: r => fmtUSD(r.liq) },
    { key: "holders", label: "Holders", align: "right", mono: true, render: r => fmtNum(r.holders) },
    { key: "spark", label: "Trend", sortable: false, render: r => <MiniSpark data={r.spark} delta={r.d24}/> },
    { key: "endsIn", label: "Ends", render: r => <span className="t-mut" style={{ fontSize: 12 }}>{r.endsIn}</span> },
  ];
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Markets</h1>
          <div className="page-sub">{data.length} markets · live tracking</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="chip-row">
            {cats.map(([k, l]) => <button key={k} className={"chip " + (cat === k ? "active" : "")} onClick={() => setCat(k)}>{l}</button>)}
          </div>
          <div style={{ flex: 1 }}/>
          <div className="chip-row">
            {["active", "resolved", "all"].map(s => <button key={s} className={"chip " + (status === s ? "active" : "")} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
          </div>
          <input className="form-input" style={{ width: 220, height: 30 }} placeholder="Filter table…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={cols}
          data={data}
          pageSize={20}
          onRowClick={r => location.hash = "#/markets/" + r.slug}
          defaultSort={{ key: "vol24", dir: "desc" }}
        />
      </div>
    </div>
  );
}

// =================================================================
// MARKET DETAIL
// =================================================================
function MarketDetailScreen({ slug }) {
  const m = GSR_MOCKS.markets.find(x => x.slug === slug) || GSR_MOCKS.markets[0];
  const [interval, setInterval] = useState("1D");
  const [tab, setTab] = useState("trades");

  // Live ticking price
  const [livePrice, setLivePrice] = useState(m.yes);
  useEffect(() => {
    const id = window.setInterval(() => {
      setLivePrice(p => Math.max(0.01, Math.min(0.99, p + (Math.random() - 0.5) * 0.005)));
    }, 2000);
    return () => clearInterval(id);
  }, []);
  const flashCls = useFlash(livePrice);

  return (
    <div>
      <a href="#/markets" className="back-link"><Icon name="arrow-left" size={12}/> Back to markets</a>
      <div className="page-header" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <CatPill cat={m.cat}/>
            <StatusPill status="active"/>
          </div>
          <h1 className="detail-title">{m.q}</h1>
          <div className="meta-row">
            <span>Ends {m.endsIn}</span><span className="sep">·</span>
            <span>Vol <b className="mono" style={{ color: "var(--text-primary)" }}>{fmtUSD(m.vol)}</b></span><span className="sep">·</span>
            <span>Liquidity <b className="mono" style={{ color: "var(--text-primary)" }}>{fmtUSD(m.liq)}</b></span><span className="sep">·</span>
            <span>Holders <b className="mono" style={{ color: "var(--text-primary)" }}>{fmtNum(m.holders)}</b></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="star" size={14}/> Watch</button>
          <button className="btn primary"><Icon name="external-link" size={14}/> Open in Polymarket</button>
        </div>
      </div>

      <div className="grid grid-12">
        <div className="col-8">
          {/* Live price ribbon */}
          <div className="card" style={{ marginBottom: 16, padding: 0 }}>
            <div style={{ display: "flex", gap: 0 }}>
              <div className={"flex-cell " + flashCls} style={{ flex: 1, padding: 16, borderRight: "1px solid var(--border-subtle)", transition: "background 600ms" }}>
                <div className="kpi-label">YES Live</div>
                <div className="kpi-row" style={{ marginBottom: 0 }}>
                  <div className="kpi-value" style={{ color: "var(--success)" }}>${livePrice.toFixed(4)}</div>
                  <div className="kpi-delta up"><Icon name="arrow-up" size={12}/>{(m.d24).toFixed(2)}%</div>
                </div>
              </div>
              <div style={{ flex: 1, padding: 16, borderRight: "1px solid var(--border-subtle)" }}>
                <div className="kpi-label">NO Live</div>
                <div className="kpi-row" style={{ marginBottom: 0 }}>
                  <div className="kpi-value" style={{ color: "var(--danger)" }}>${(1 - livePrice).toFixed(4)}</div>
                  <div className="kpi-delta down"><Icon name="arrow-down" size={12}/>{Math.abs(m.d24).toFixed(2)}%</div>
                </div>
              </div>
              <div style={{ flex: 1, padding: 16 }}>
                <div className="kpi-label">Volume 24h</div>
                <div className="kpi-row" style={{ marginBottom: 0 }}>
                  <div className="kpi-value">{fmtUSD(m.vol24)}</div>
                  <div className="kpi-delta flat">·</div>
                </div>
              </div>
            </div>
          </div>

          <PriceChart interval={interval} onInterval={setInterval} showChainlink={false}/>
          <VolumeBars interval={interval}/>

          <div className="card" style={{ marginTop: 16 }}>
            <TabBar tabs={[
              { id: "trades", label: "Trades", count: GSR_MOCKS.trades.length },
              { id: "orderbook", label: "Orderbook" },
              { id: "holders", label: "Holders", count: GSR_MOCKS.holders.length },
              { id: "resolution", label: "Resolution" },
              { id: "signals", label: "Signals", count: 3 },
            ]} active={tab} onChange={setTab}/>
            <div style={{ padding: 0 }}>
              {tab === "trades" && (
                <DataTable
                  columns={[
                    { key: "t", label: "Time", mono: true, render: r => fmtRelTime(r.t) },
                    { key: "action", label: "Action", render: r => <span className={r.action === "BUY" ? "t-pos" : "t-neg"} style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.action}</span> },
                    { key: "side", label: "Side", render: r => <StatusPill status={r.side}/> },
                    { key: "price", label: "Price", align: "right", mono: true, render: r => "$" + r.price.toFixed(4) },
                    { key: "size", label: "Size", align: "right", mono: true, render: r => fmtNum(r.size) },
                    { key: "total", label: "Total", align: "right", mono: true, render: r => fmtUSD(r.total) },
                    { key: "wallet", label: "Wallet", render: r => <AddressPill address={r.wallet}/> },
                    { key: "tx", label: "Tx", render: r => <a href={"https://polygonscan.com/tx/" + r.tx} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>{truncAddr(r.tx, 6)}</a> },
                  ]} data={GSR_MOCKS.trades} pageSize={10}/>
              )}
              {tab === "orderbook" && <div style={{ padding: 16 }}><OrderbookDepth/></div>}
              {tab === "holders" && (
                <DataTable
                  columns={[
                    { key: "rank", label: "#", mono: true, width: 50 },
                    { key: "address", label: "Wallet", render: r => <AddressPill address={r.address} label={r.label}/> },
                    { key: "side", label: "Side", render: r => <StatusPill status={r.side}/> },
                    { key: "shares", label: "Shares", align: "right", mono: true, render: r => fmtNum(r.shares) },
                    { key: "avg", label: "Avg Buy", align: "right", mono: true, render: r => "$" + r.avg.toFixed(2) },
                    { key: "value", label: "Value", align: "right", mono: true, render: r => fmtUSD(r.value) },
                    { key: "pnl", label: "PnL", align: "right", mono: true, render: r => <span className={r.pnl >= 0 ? "t-pos" : "t-neg"}>{fmtUSD(r.pnl)}</span> },
                  ]} data={GSR_MOCKS.holders} pageSize={10}/>
              )}
              {tab === "resolution" && (
                <div style={{ padding: 20 }}>
                  <h4 style={{ marginTop: 0, fontSize: 14 }}>Resolution Rules</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
                    This market resolves YES if Donald J. Trump is the official winner of the 2028 U.S. Presidential election as determined by the certified Electoral College results. Resolution source: Associated Press Race Calls. Otherwise it resolves NO.
                  </p>
                  <div style={{ marginTop: 16 }}>
                    <ResolutionTimeline detail={GSR_MOCKS.resolutionDetail}/>
                  </div>
                </div>
              )}
              {tab === "signals" && (
                <div style={{ padding: 16 }}>
                  {GSR_MOCKS.signals.slice(0, 2).map(s => (
                    <div key={s.id} style={{ padding: 12, borderBottom: "1px solid var(--border-subtle)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <StatusPill status={s.type === "Price Gap" ? "price_gap" : "news"}/>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.detected}</span>
                      </div>
                      <div style={{ fontSize: 13 }}>{s.market}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Market <b className="mono">{(s.marketImplied * 100).toFixed(0)}%</b> vs {s.external} <b className="mono">{s.externalValue}</b></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-4">
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3 className="card-title">Stats</h3></div>
            <div className="card-body">
              <div className="stats-list">
                <div><div className="stat-k">Volume 24h</div><div className="stat-v">{fmtUSD(m.vol24)}</div></div>
                <div><div className="stat-k">Volume 7d</div><div className="stat-v">{fmtUSD(m.vol24 * 6.2)}</div></div>
                <div><div className="stat-k">Volume total</div><div className="stat-v">{fmtUSD(m.vol)}</div></div>
                <div><div className="stat-k">Liquidity</div><div className="stat-v">{fmtUSD(m.liq)}</div></div>
                <div><div className="stat-k">Open Interest</div><div className="stat-v">{fmtUSD(m.liq * 1.3)}</div></div>
                <div><div className="stat-k">Traders</div><div className="stat-v">{fmtNum(m.holders)}</div></div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3 className="card-title">Resolution Rules</h3></div>
            <div className="card-body" style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Resolves YES if the candidate wins the Electoral College per AP Race Calls. Resolution source: <b style={{ color: "var(--text-primary)" }}>UMA Optimistic Oracle V2</b>.
              <div style={{ marginTop: 12 }}>
                <a href="https://oracle.uma.xyz" target="_blank" rel="noreferrer" className="btn sm">View in UMA <Icon name="external-link" size={12}/></a>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header"><h3 className="card-title">Linked Contracts</h3></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div className="stat-k" style={{ marginBottom: 4 }}>Market</div>
                <AddressPill address="0xE111180000d2663C0091e4f400237545B87B996B"/>
              </div>
              <div>
                <div className="stat-k" style={{ marginBottom: 4 }}>Condition ID</div>
                <AddressPill address="0x7b3a9e1f5d8c2b4a6e9f1d3c5b7a8e2f9d4c1b6a3e5f8d2c4b7a9e1f3d5c8b4a" withLink={false}/>
              </div>
              <div>
                <div className="stat-k" style={{ marginBottom: 4 }}>Token YES</div>
                <AddressPill address="0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2" withLink={false}/>
              </div>
              <div>
                <div className="stat-k" style={{ marginBottom: 4 }}>Token NO</div>
                <AddressPill address="0xb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3" withLink={false}/>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Top Holders</h3>
              <a className="btn ghost sm" onClick={() => setTab("holders")} href="#">View all</a>
            </div>
            <div className="card-body">
              <HoldersBar holders={GSR_MOCKS.holders} compact/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// CONTRACTS LIST (search input page)
// =================================================================
function ContractsScreen() {
  const [v, setV] = useState("");
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Explorer</h1>
          <div className="page-sub">Paste any Polygon address to inspect on-chain activity</div>
        </div>
      </div>
      <div className="card" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <Icon name="search" size={28} color="var(--text-muted)"/>
        <div style={{ width: "100%", maxWidth: 640, display: "flex", gap: 8 }}>
          <input className="form-input" style={{ flex: 1, height: 42, fontFamily: "var(--font-mono)" }} placeholder="0x…" value={v} onChange={e => setV(e.target.value)}/>
          <a href={"#/contracts/" + (v || GSR_MOCKS.contractAddr)} className="btn primary lg">Inspect <Icon name="arrow-right" size={14}/></a>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>or browse known contracts:</div>
        <div className="chip-row">
          {GSR_MOCKS.searchIndex.contracts.map(c => (
            <a key={c.address} href={"#/contracts/" + c.address} className="chip">
              <span className="mono">{truncAddr(c.address)}</span>
              <span className="chip-count">{c.title}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// =================================================================
// CONTRACT DETAIL
// =================================================================
function ContractDetailScreen({ address }) {
  const d = GSR_MOCKS.contractDetail;
  return (
    <div>
      <a href="#/contracts" className="back-link"><Icon name="arrow-left" size={12}/> Explorer</a>
      <div className="page-header" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <StatusPill status="active"/>
            <span className="pill purple"><span className="dot"/>{d.type}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--text-primary)" }}>
            {address || d.address}
          </div>
          <div className="meta-row" style={{ marginTop: 8 }}>
            <span>Name <b className="mono" style={{ color: "var(--text-primary)" }}>{d.name}</b></span><span className="sep">·</span>
            <span>First seen <b className="mono" style={{ color: "var(--text-primary)" }}>{d.firstSeen}</b></span><span className="sep">·</span>
            <span>Total txs <b className="mono" style={{ color: "var(--text-primary)" }}>{fmtNum(d.totalTx)}</b></span><span className="sep">·</span>
            <span>Unique wallets <b className="mono" style={{ color: "var(--text-primary)" }}>{fmtNum(d.uniqueWallets)}</b></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <AddressPill address={address || d.address}/>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, background: "var(--accent-subtle)", borderColor: "rgba(79,140,255,0.3)" }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Icon name="sparkles" size={20} color="var(--accent)"/>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, marginBottom: 2 }}>This contract is linked to a market</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>"{d.linkedMarket.q}"</div>
          </div>
          <a href={"#/markets/" + d.linkedMarket.slug} className="btn primary">View market <Icon name="arrow-right" size={14}/></a>
        </div>
      </div>

      <div className="grid grid-2">
        <ContractActivity/>
        <WalletsDaily/>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Recent Transactions</h3>
          <div className="card-sub">Decoded events</div>
        </div>
        <DataTable
          columns={[
            { key: "t", label: "Time", mono: true, render: r => fmtRelTime(r.t) },
            { key: "event", label: "Event", render: r => <span className="pill neutral"><span className="dot"/>{r.event}</span> },
            { key: "from", label: "From", render: r => <AddressPill address={r.from}/> },
            { key: "to", label: "To", render: r => <AddressPill address={r.to}/> },
            { key: "args", label: "Args", render: r => <span className="mono t-mut" style={{ fontSize: 11 }}>{`{ amount: ${r.args.amount} }`}</span> },
            { key: "tx", label: "Tx Hash", render: r => <a href={"https://polygonscan.com/tx/" + r.tx} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>{truncAddr(r.tx, 6)}</a> },
          ]} data={GSR_MOCKS.contractTxs} pageSize={10}/>
      </div>
    </div>
  );
}

// =================================================================
// RESOLUTIONS LIST
// =================================================================
function ResolutionsScreen() {
  const [filter, setFilter] = useState("all");
  let data = GSR_MOCKS.resolutions;
  if (filter !== "all") data = data.filter(r => r.status === filter);

  const cols = [
    { key: "status", label: "Status", render: r => <StatusPill status={r.status}/> },
    { key: "question", label: "Question", truncate: true, render: r => <span>{r.question}</span> },
    { key: "bond", label: "Bond", align: "right", mono: true, render: r => "$" + fmtNum(r.bond) },
    { key: "proposer", label: "Proposer", render: r => <AddressPill address={r.proposer.replace(/\.\.\./, "0000000000000000")} label={r.proposer}/> },
    { key: "disputer", label: "Disputer", render: r => r.disputer ? <AddressPill address={r.disputer.replace(/\.\.\./, "0000000000000000")} label={r.disputer}/> : <span className="t-mut">—</span> },
    { key: "challengeEnds", label: "Window", align: "right", mono: true, render: r => {
      const left = r.challengeEnds - Date.now();
      if (left <= 0) return <span className="t-mut">✓ Passed</span>;
      return <span style={{ color: left < 30 * 60_000 ? "var(--warning)" : "var(--text-primary)" }}>{fmtCountdown(left)}</span>;
    }},
    { key: "endDate", label: "End", mono: true, render: r => fmtTime(r.endDate).slice(0, 10) },
    { key: "_actions", label: "", sortable: false, render: () => <a className="btn sm" href="https://oracle.uma.xyz" target="_blank" rel="noreferrer">UMA <Icon name="external-link" size={11}/></a> },
  ];

  const counts = {
    all: GSR_MOCKS.resolutions.length,
    pending_uma: GSR_MOCKS.resolutions.filter(r => r.status === "pending_uma").length,
    proposed: GSR_MOCKS.resolutions.filter(r => r.status === "proposed").length,
    disputed: GSR_MOCKS.resolutions.filter(r => r.status === "disputed").length,
    resolved: GSR_MOCKS.resolutions.filter(r => r.status === "resolved").length,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Resolution Watchdog</h1>
          <div className="page-sub">Monitor UMA Optimistic Oracle disputes in real-time</div>
        </div>
      </div>

      <BondHistogram/>

      <div className="card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="chip-row">
            {[["all","All"],["pending_uma","Pending"],["proposed","Proposed"],["disputed","Disputed"],["resolved","Resolved (7d)"]].map(([k,l]) => (
              <button key={k} className={"chip " + (filter === k ? "active" : "")} onClick={() => setFilter(k)}>
                {l} <span className="chip-count">{counts[k]}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn"><Icon name="filter" size={14}/> Sort: End time</button>
            <button className="btn"><Icon name="download" size={14}/> Export</button>
          </div>
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={cols}
          data={data}
          pageSize={20}
          onRowClick={r => location.hash = "#/resolutions/" + r.slug}
          flagRow={r => r.status === "disputed" ? "warning" : (r.challengeEnds - Date.now() < 30 * 60_000 && r.challengeEnds - Date.now() > 0 ? "danger" : null)}
        />
      </div>
    </div>
  );
}

// =================================================================
// RESOLUTION DETAIL
// =================================================================
function ResolutionDetailScreen({ slug }) {
  const m = GSR_MOCKS.markets.find(x => x.slug === slug) || GSR_MOCKS.markets[0];
  return (
    <div>
      <a href="#/resolutions" className="back-link"><Icon name="arrow-left" size={12}/> Resolutions</a>
      <div className="page-header" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <div>
          <StatusPill status="disputed"/>
          <h1 className="detail-title">{m.q}</h1>
          <div className="meta-row">
            <span className="mono">QID 0x1234abcd...</span><span className="sep">·</span>
            <span>Proposed <b className="mono" style={{ color: "var(--text-primary)" }}>4h ago</b></span><span className="sep">·</span>
            <span>Phase <b style={{ color: "var(--warning)" }}>Challenge window</b></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="external-link" size={14}/> Discord thread</button>
          <a className="btn primary" href="https://oracle.uma.xyz" target="_blank" rel="noreferrer">View on UMA <Icon name="external-link" size={14}/></a>
        </div>
      </div>

      <ResolutionTimeline detail={GSR_MOCKS.resolutionDetail}/>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Question & Rules</h3></div>
          <div className="card-body" style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>Resolves YES if the candidate wins the Electoral College per AP Race Calls. Resolution source: <b style={{ color: "var(--text-primary)" }}>UMA Optimistic Oracle V2</b>. Disputed by <span className="mono" style={{ color: "var(--text-primary)" }}>0xa92E...1F65</span> citing "evidence not yet finalized".</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Voting (DVM)</h3></div>
          <div className="card-body">
            {[
              { label: "For YES", v: 67, color: "#22C55E" },
              { label: "For NO", v: 18, color: "#EF4444" },
              { label: "Too Early", v: 11, color: "#F59E0B" },
              { label: "Unknown", v: 4, color: "#8A92A6" },
            ].map(b => (
              <div key={b.label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>{b.label}</span>
                  <span className="mono">{b.v}%</span>
                </div>
                <div className="holder-bar-wrap"><div className="holder-bar-fill" style={{ width: b.v + "%", background: b.color }}/></div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>234 voters · 1.2M $UMA staked</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3 className="card-title">Market Impact</h3></div>
        <PriceChart interval="1D" onInterval={() => {}}/>
      </div>
    </div>
  );
}

// =================================================================
// SIGNALS
// =================================================================
function SignalsScreen() {
  const [sevThreshold, setSevThreshold] = useState(1);
  const data = GSR_MOCKS.signals.filter(s => s.severity >= sevThreshold);
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Signals & Divergences</h1>
          <div className="page-sub">Markets out of sync with external reality</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="chip-row">
            <button className="chip active">All types</button>
            <button className="chip">Price Gap</button>
            <button className="chip">News</button>
            <button className="chip">Sudden Move</button>
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Severity ≥</span>
            <div className="chip-row">
              {[1,2,3,4,5].map(n => <button key={n} className={"chip " + (sevThreshold === n ? "active" : "")} onClick={() => setSevThreshold(n)}>{n}</button>)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.map(s => (
          <div key={s.id} className="card">
            <div className="card-body" style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <StatusPill status={s.type === "Price Gap" ? "price_gap" : s.type === "Sudden Move" ? "sudden" : "news"}/>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Severity</span>
                  <span className="sev-meter">{[1,2,3,4,5].map(i => <span key={i} className={"s " + (i <= s.severity ? "on" : "")}/>)}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>{s.market}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
                  <div>
                    <div className="stat-k">Polymarket implied prob</div>
                    <div className="stat-v" style={{ fontSize: 16 }}>{(s.marketImplied * 100).toFixed(0)}% <span style={{ color: "var(--danger)", fontSize: 13 }}>{s.marketDelta}</span></div>
                  </div>
                  <div>
                    <div className="stat-k">{s.external}</div>
                    <div className="stat-v" style={{ fontSize: 16 }}>{s.externalValue}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-secondary)" }}>
                  <span>Detected {s.detected} · Updated {s.updated}</span>
                  <a className="btn sm" href={"#/markets/" + s.slug}>Investigate <Icon name="arrow-right" size={12}/></a>
                </div>
              </div>
              <div style={{ width: 320, minWidth: 280 }}>
                <DivergenceMini market={s.market_series} external={s.external_series}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================================================================
// ECOSYSTEM
// =================================================================
function EcosystemScreen() {
  const [interval, setInterval] = useState("3M");
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ecosystem</h1>
          <div className="page-sub">Polymarket aggregate metrics</div>
        </div>
      </div>

      <div className="grid grid-5">
        {GSR_MOCKS.kpis.map(k => <KpiCard key={k.key} k={k}/>)}
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <EcosystemVolume interval={interval} onInterval={setInterval}/>
        <ActiveMarkets/>
      </div>

      <div style={{ marginTop: 16 }}>
        <CategoryBars/>
      </div>

      <div style={{ marginTop: 16 }}>
        <CalibrationScatter/>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Top Wallets</h3>
          <div className="card-sub">Most active over last 30d</div>
        </div>
        <DataTable
          columns={[
            { key: "address", label: "Wallet", render: r => <AddressPill address={r.address} label={r.label}/> },
            { key: "volume", label: "Volume", align: "right", mono: true, render: r => fmtUSD(r.volume) },
            { key: "markets", label: "Markets", align: "right", mono: true, render: r => fmtNum(r.markets) },
            { key: "pnl", label: "PnL", align: "right", mono: true, render: r => <span className={r.pnl >= 0 ? "t-pos" : "t-neg"}>{fmtUSD(r.pnl)}</span> },
            { key: "success", label: "Win rate", align: "right", mono: true, render: r => (r.success * 100).toFixed(0) + "%" },
          ]} data={GSR_MOCKS.ecoTopWallets} pageSize={10}/>
      </div>

      <div style={{ marginTop: 16 }}>
        <ActivityHeatmap/>
      </div>
    </div>
  );
}

// =================================================================
// SETTINGS
// =================================================================
function SettingsScreen() {
  const [tab, setTab] = useState("profile");
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Account & preferences</div>
        </div>
      </div>
      <div className="card">
        <TabBar tabs={[
          { id: "profile", label: "Profile" },
          { id: "api", label: "API" },
          { id: "prefs", label: "Preferences" },
        ]} active={tab} onChange={setTab}/>
        <div className="card-body" style={{ maxWidth: 600 }}>
          {tab === "profile" && <>
            <div className="form-field"><label className="form-label">Email</label><input className="form-input" defaultValue="m.ortiz@gsr.io"/></div>
            <div className="form-field"><label className="form-label">Display name</label><input className="form-input" defaultValue="M. Ortiz"/></div>
            <div className="form-field"><label className="form-label">Password</label><input className="form-input" type="password" defaultValue="••••••••"/></div>
            <button className="btn primary" style={{ marginTop: 8 }}>Save changes</button>
          </>}
          {tab === "api" && <>
            <div className="form-field">
              <label className="form-label">Personal API Key</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="form-input mono" style={{ flex: 1 }} readOnly value="gsr_sk_live_82HGT4kQ•••••••••••••••••••MR3z"/>
                <button className="btn"><Icon name="refresh" size={14}/> Regenerate</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>Use this key to authenticate against <span className="mono">https://api.gsr-mi.io/v1</span>. Keep it secret.</div>
          </>}
          {tab === "prefs" && <>
            <div className="form-field"><label className="form-label">Theme</label>
              <div className="chip-row">
                <button className="chip active"><Icon name="moon" size={12}/> Dark</button>
                <button className="chip">Light</button>
                <button className="chip">Auto</button>
              </div>
            </div>
            <div className="form-field"><label className="form-label">Timezone</label><input className="form-input" defaultValue="UTC"/></div>
            <div className="form-field"><label className="form-label">Language</label><input className="form-input" defaultValue="English (US)"/></div>
          </>}
        </div>
      </div>
    </div>
  );
}


export { LoginScreen, DashboardScreen, MarketsScreen, MarketDetailScreen, ContractsScreen, ContractDetailScreen, ResolutionsScreen, ResolutionDetailScreen, SignalsScreen, EcosystemScreen, SettingsScreen };
