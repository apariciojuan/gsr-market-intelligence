/* GSR Market Intelligence — chart components (G1..G18) using Recharts.
   G1, G2 live in components.jsx as KpiCard spark + MiniSpark. */

const R = Recharts;

function customTooltip(formatRows) {
  return function CT({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const ts = payload[0].payload.t;
    return (
      <div className="custom-tooltip">
        {ts && <div className="tt-time">{fmtTime(ts)}</div>}
        {formatRows(payload, label).map((r, i) => (
          <div className="tt-row" key={i}>
            <span className="lbl">{r.dot && <span style={{ width: 8, height: 8, borderRadius: 50, background: r.dot, display: "inline-block" }}/>}{r.label}</span>
            <span className="val">{r.value}</span>
          </div>
        ))}
      </div>
    );
  };
}

// ----- G3 Price History (Yes/No) using Recharts (LWC equivalent visual) -----
function PriceChart({ interval, onInterval, showChainlink = false }) {
  const series = GSR_MOCKS.priceHistory[interval] || GSR_MOCKS.priceHistory["1D"];
  const [seriesOn, setSeriesOn] = useState({ yes: true, no: true, cl: showChainlink });
  const data = series.map(p => ({
    t: p.t, yes: p.yes, no: p.no, cl: 0.42 + Math.sin((p.t / 3600000) % 24 / 4) * 0.04,
  }));
  const yes = series.map(p => p.yes);
  const stats = {
    min: Math.min(...yes).toFixed(2),
    max: Math.max(...yes).toFixed(2),
    avg: (yes.reduce((a, b) => a + b, 0) / yes.length).toFixed(2),
    vol: series.reduce((a, b) => a + b.vol, 0),
  };
  return (
    <ChartContainer
      title="Price History"
      subtitle="YES / NO implied probability"
      intervals={["1H", "4H", "1D", "1W", "MAX"]}
      currentInterval={interval}
      onInterval={onInterval}
      legend={
        <div className="legend-group">
          <button className={"legend-toggle " + (seriesOn.yes ? "active" : "dim")} onClick={() => setSeriesOn(s => ({ ...s, yes: !s.yes }))}><span className="dot" style={{ background: "#22C55E" }}/>Yes</button>
          <button className={"legend-toggle " + (seriesOn.no ? "active" : "dim")} onClick={() => setSeriesOn(s => ({ ...s, no: !s.no }))}><span className="dot" style={{ background: "#EF4444" }}/>No</button>
          <button className={"legend-toggle " + (seriesOn.cl ? "active" : "dim")} onClick={() => setSeriesOn(s => ({ ...s, cl: !s.cl }))}><span className="dot" style={{ background: "#06B6D4" }}/>Chainlink</button>
        </div>
      }
      footer={<>
        <div>Min<b className="mono">{stats.min}</b></div>
        <div>Max<b className="mono">{stats.max}</b></div>
        <div>Avg<b className="mono">{stats.avg}</b></div>
        <div>Volume<b className="mono">{fmtUSD(stats.vol)}</b></div>
      </>}>
      <div style={{ width: "100%", height: 380 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 20 }}>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false}/>
            <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} minTickGap={40}/>
            <R.YAxis yAxisId="prob" domain={[0, 1]} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={v => v.toFixed(2)} width={42}/>
            {seriesOn.cl && <R.YAxis yAxisId="cl" orientation="right" domain={[0.3, 0.6]} stroke="#06B6D4" tick={{ fontSize: 11, fill: "#06B6D4" }} width={50}/>}
            <R.Tooltip content={customTooltip((p) => [
              ...(seriesOn.yes ? [{ label: "YES", value: p.find(x => x.dataKey === "yes")?.value?.toFixed(4), dot: "#22C55E" }] : []),
              ...(seriesOn.no  ? [{ label: "NO",  value: p.find(x => x.dataKey === "no")?.value?.toFixed(4),  dot: "#EF4444" }] : []),
              ...(seriesOn.cl  ? [{ label: "Chainlink", value: "$" + (p.find(x => x.dataKey === "cl")?.value || 0).toFixed(2), dot: "#06B6D4" }] : []),
            ])} cursor={{ stroke: "#353B4D", strokeDasharray: "3 3" }}/>
            {seriesOn.yes && <R.Line yAxisId="prob" type="monotone" dataKey="yes" stroke="#22C55E" strokeWidth={1.8} dot={false} isAnimationActive={false}/>}
            {seriesOn.no  && <R.Line yAxisId="prob" type="monotone" dataKey="no"  stroke="#EF4444" strokeWidth={1.8} dot={false} isAnimationActive={false}/>}
            {seriesOn.cl  && <R.Line yAxisId="cl"   type="monotone" dataKey="cl"  stroke="#06B6D4" strokeWidth={1.4} strokeOpacity={0.7} dot={false} isAnimationActive={false}/>}
            {GSR_MOCKS.priceMarkers.map((m, i) => (
              <R.ReferenceDot key={i} yAxisId="prob" x={m.t} y={0.5}
                r={5} fill={m.type === "news" ? "#F59E0B" : "#A855F7"} stroke="none">
                <R.Label position="top" fill={m.type === "news" ? "#F59E0B" : "#A855F7"} fontSize={10}>{m.type === "news" ? "📰" : "⚖"}</R.Label>
              </R.ReferenceDot>
            ))}
          </R.LineChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G5 Volume bars (shared X with G3, shown below) -----
function VolumeBars({ interval }) {
  const series = GSR_MOCKS.priceHistory[interval] || GSR_MOCKS.priceHistory["1D"];
  const data = series.map((p, i) => ({
    t: p.t, vol: p.vol, dir: i > 0 ? (p.yes >= series[i - 1].yes ? "up" : "down") : "up",
  }));
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="chart-toolbar"><div><h3>Volume</h3><div className="sub">Trading volume per interval</div></div></div>
      <div className="chart-body" style={{ height: 120 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.BarChart data={data} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
            <R.XAxis dataKey="t" hide/>
            <R.YAxis tick={{ fontSize: 10, fill: "#8A92A6" }} stroke="#5A6178" width={42} tickFormatter={v => fmtUSD(v)}/>
            <R.Tooltip content={customTooltip((p) => [{ label: "Volume", value: fmtUSD(p[0].value), dot: "#4F8CFF" }])} cursor={{ fill: "#1C2030" }}/>
            <R.Bar dataKey="vol">
              {data.map((d, i) => <R.Cell key={i} fill={d.dir === "up" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"} />)}
            </R.Bar>
          </R.BarChart>
        </R.ResponsiveContainer>
      </div>
    </div>
  );
}

// ----- G6 Orderbook depth -----
function OrderbookDepth() {
  const { bids, asks, mid } = GSR_MOCKS.orderbook;
  const data = [
    ...bids.map(b => ({ price: b.price, bid: b.cum, ask: null })),
    { price: mid, bid: null, ask: null },
    ...asks.map(a => ({ price: a.price, bid: null, ask: a.cum })),
  ];
  return (
    <div className="card chart-container">
      <div className="chart-toolbar"><div><h3>Orderbook Depth</h3><div className="sub">Bids vs Asks • Midpoint <span className="mono">{mid.toFixed(2)}</span></div></div></div>
      <div className="chart-body" style={{ height: 300 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.AreaChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 20 }}>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4"/>
            <R.XAxis dataKey="price" type="number" domain={[0, 1]} tickFormatter={v => v.toFixed(2)} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }}/>
            <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} width={50} tickFormatter={fmtNum}/>
            <R.Tooltip content={customTooltip((p) => p.map(x => ({ label: x.dataKey === "bid" ? "Bid size" : "Ask size", value: fmtNum(x.value), dot: x.dataKey === "bid" ? "#22C55E" : "#EF4444" })))}/>
            <R.Area type="step" dataKey="bid" stroke="#22C55E" fill="rgba(34,197,94,0.20)" strokeWidth={1.5} isAnimationActive={false}/>
            <R.Area type="step" dataKey="ask" stroke="#EF4444" fill="rgba(239,68,68,0.20)" strokeWidth={1.5} isAnimationActive={false}/>
            <R.ReferenceLine x={mid} stroke="#8A92A6" strokeDasharray="3 3" label={{ value: "Mid " + mid.toFixed(2), fill: "#E6E9F0", fontSize: 11, position: "top" }}/>
          </R.AreaChart>
        </R.ResponsiveContainer>
      </div>
    </div>
  );
}

// ----- G7 Top Holders bar -----
function HoldersBar({ holders, compact = false }) {
  const data = holders.slice(0, compact ? 5 : 20).map(h => ({
    name: h.label || truncAddr(h.address),
    value: h.value,
    side: h.side,
    address: h.address,
  }));
  const max = Math.max(...data.map(d => d.value));
  if (compact) {
    return (
      <div>
        {data.map((h, i) => (
          <div className="holder-row" key={i}>
            <span style={{ width: 14, color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>#{i + 1}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, width: 110, overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
            <div className="holder-bar-wrap">
              <div className="holder-bar-fill" style={{ width: (h.value / max * 100) + "%", background: h.side === "yes" ? "#22C55E" : "#EF4444" }}/>
            </div>
            <span className="mono" style={{ fontSize: 11, width: 56, textAlign: "right" }}>{fmtUSD(h.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ height: data.length * 28 + 60 }}>
      <R.ResponsiveContainer width="100%" height="100%">
        <R.BarChart data={data} layout="vertical" margin={{ top: 10, right: 40, bottom: 10, left: 10 }}>
          <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4"/>
          <R.XAxis type="number" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtUSD}/>
          <R.YAxis type="category" dataKey="name" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6", fontFamily: "IBM Plex Mono" }} width={140}/>
          <R.Tooltip content={customTooltip((p) => [{ label: p[0].payload.side.toUpperCase(), value: fmtUSD(p[0].value), dot: p[0].payload.side === "yes" ? "#22C55E" : "#EF4444" }])} cursor={{ fill: "#1C2030" }}/>
          <R.Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => <R.Cell key={i} fill={d.side === "yes" ? "#22C55E" : "#EF4444"}/>)}
          </R.Bar>
        </R.BarChart>
      </R.ResponsiveContainer>
    </div>
  );
}

// ----- G8 Contract Activity -----
function ContractActivity() {
  const data = GSR_MOCKS.contractActivity;
  return (
    <ChartContainer title="Contract Activity" subtitle="Transactions per day"
      intervals={["1H", "1D", "1W", "1M", "MAX"]} currentInterval="1D">
      <div style={{ height: 280 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.AreaChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="g-act" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#4F8CFF" stopOpacity={0.55}/>
                <stop offset="100%" stopColor="#4F8CFF" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false}/>
            <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }}/>
            <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtNum} width={56}/>
            <R.Tooltip content={customTooltip((p) => [
              { label: "Transactions", value: fmtNum(p[0].payload.tx), dot: "#4F8CFF" },
              { label: "Unique wallets", value: fmtNum(p[0].payload.unique), dot: "#06B6D4" },
              { label: "Volume", value: fmtUSD(p[0].payload.vol), dot: "#22C55E" },
            ])}/>
            <R.Area type="monotone" dataKey="tx" stroke="#4F8CFF" strokeWidth={1.6} fill="url(#g-act)" isAnimationActive={false}/>
          </R.AreaChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G9 Unique wallets per day -----
function WalletsDaily() {
  const data = GSR_MOCKS.contractActivity;
  return (
    <ChartContainer title="Unique Wallets" subtitle="Daily distinct addresses">
      <div style={{ height: 220 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.BarChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false}/>
            <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }}/>
            <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtNum} width={56}/>
            <R.Tooltip content={customTooltip((p) => [{ label: "Wallets", value: fmtNum(p[0].value), dot: "#06B6D4" }])} cursor={{ fill: "#1C2030" }}/>
            <R.Bar dataKey="unique" fill="#06B6D4" radius={[2, 2, 0, 0]}/>
          </R.BarChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G10 Resolution Timeline (custom SVG) -----
function ResolutionTimeline({ detail }) {
  const [expanded, setExpanded] = useState("proposed");
  const stateClass = (n) => {
    if (n.state === "done") return "done";
    if (n.state === "active") return "active";
    if (n.state === "disputed") return "disputed";
    if (n.state === "danger") return "danger";
    return "";
  };
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-title">Resolution Cycle</h3>
          <div className="card-sub">UMA Optimistic Oracle V2 — phases</div>
        </div>
        <a className="btn sm" href="https://oracle.uma.xyz" target="_blank" rel="noreferrer">View on UMA <Icon name="external-link" size={12}/></a>
      </div>
      <div className="tl-wrap">
        <div className="tl-line"/>
        <div className="tl-nodes">
          {detail.timeline.map((n, i) => (
            <div className="tl-node" key={i}>
              <div className="phase">{n.title}</div>
              <button className={"tl-circle " + stateClass(n)} onClick={() => setExpanded(expanded === n.phase ? null : n.phase)} aria-label={n.title}/>
              <div className="tl-time">
                {n.timestamp ? fmtTime(n.timestamp) : "—"}
              </div>
              {expanded === n.phase && (
                <div className="tl-card">
                  {n.phase === "proposed" && n.data && <>
                    <div className="row"><span className="k">Proposer</span><span className="v">{n.data.proposer}</span></div>
                    <div className="row"><span className="k">Bond</span><span className="v">${n.data.bond}</span></div>
                    <div className="row"><span className="k">Outcome</span><span className="v">{n.data.outcome}</span></div>
                  </>}
                  {n.phase === "challenge" && n.data && <>
                    <div className="row"><span className="k">Window</span><span className="v">{fmtCountdown(n.data.deadlineIn)}</span></div>
                    <div className="row"><span className="k">Status</span><span className="v" style={{ color: "var(--info)" }}>In progress</span></div>
                  </>}
                  {n.phase === "initialized" && <div className="row"><span className="k">Question</span><span className="v">Created</span></div>}
                  {n.phase === "dvm_vote" && <div className="row"><span className="k">Status</span><span className="v">Awaiting dispute</span></div>}
                  {n.phase === "resolved" && <div className="row"><span className="k">Status</span><span className="v">Pending</span></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ----- G11 Bond distribution -----
function BondHistogram() {
  const data = [
    { bucket: "<$100", count: 8 },
    { bucket: "$100-500", count: 23 },
    { bucket: "$500-1k", count: 41 },
    { bucket: "$1k-5k", count: 18 },
    { bucket: ">$5k", count: 6 },
  ];
  return (
    <div className="card">
      <div className="chart-toolbar"><div><h3>Bond Distribution</h3><div className="sub">Last 30d</div></div></div>
      <div className="chart-body" style={{ height: 120 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 6 }}>
            <R.XAxis dataKey="bucket" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }}/>
            <R.YAxis hide/>
            <R.Tooltip content={customTooltip((p) => [{ label: "Resolutions", value: fmtNum(p[0].value), dot: "#4F8CFF" }])} cursor={{ fill: "#1C2030" }}/>
            <R.Bar dataKey="count" fill="#4F8CFF" radius={[3, 3, 0, 0]}/>
          </R.BarChart>
        </R.ResponsiveContainer>
      </div>
    </div>
  );
}

// ----- G12 Divergence mini -----
function DivergenceMini({ market, external }) {
  const data = market.map((m, i) => ({ t: m.t, market: m.v, external: external[i]?.v ?? null }));
  return (
    <div style={{ height: 90 }}>
      <R.ResponsiveContainer width="100%" height="100%">
        <R.AreaChart data={data} margin={{ top: 2, right: 6, left: 6, bottom: 2 }}>
          <defs>
            <linearGradient id="g-div" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4}/>
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <R.XAxis dataKey="t" hide/>
          <R.YAxis domain={[0, 1]} hide/>
          <R.Tooltip content={customTooltip((p) => [
            { label: "Market", value: p.find(x => x.dataKey === "market")?.value?.toFixed(3), dot: "#4F8CFF" },
            { label: "External", value: p.find(x => x.dataKey === "external")?.value?.toFixed(3), dot: "#06B6D4" },
          ])}/>
          <R.Area type="monotone" dataKey="external" stroke="#06B6D4" strokeWidth={1.4} fill="url(#g-div)" isAnimationActive={false}/>
          <R.Line type="monotone" dataKey="market" stroke="#4F8CFF" strokeWidth={1.4} dot={false} isAnimationActive={false}/>
        </R.AreaChart>
      </R.ResponsiveContainer>
    </div>
  );
}

// ----- G13 Market vs Chainlink detail (dual axis) -----
function MarketVsChainlink({ data }) {
  return (
    <ChartContainer title="Market vs Chainlink" subtitle="Implied probability vs oracle price">
      <div style={{ height: 360 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.LineChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false}/>
            <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }}/>
            <R.YAxis yAxisId="l" domain={[0, 1]} stroke="#4F8CFF" tick={{ fontSize: 11, fill: "#4F8CFF" }} width={42}/>
            <R.YAxis yAxisId="r" orientation="right" stroke="#06B6D4" tick={{ fontSize: 11, fill: "#06B6D4" }} width={60} tickFormatter={fmtUSD}/>
            <R.Tooltip content={customTooltip((p) => [
              { label: "Market (impl. prob)", value: p[0]?.value?.toFixed(3), dot: "#4F8CFF" },
              { label: "Chainlink", value: fmtUSD(p[1]?.value), dot: "#06B6D4" },
            ])}/>
            <R.Line yAxisId="l" type="monotone" dataKey="market" stroke="#4F8CFF" strokeWidth={1.8} dot={false} isAnimationActive={false}/>
            <R.Line yAxisId="r" type="monotone" dataKey="cl" stroke="#06B6D4" strokeWidth={1.6} dot={false} isAnimationActive={false}/>
          </R.LineChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G14 Ecosystem volume (line + bars combo) -----
function EcosystemVolume({ interval, onInterval }) {
  const data = GSR_MOCKS.ecoVolume;
  return (
    <ChartContainer title="Total Volume" subtitle="USD volume + new markets" intervals={["1W","1M","3M","1Y","ALL"]} currentInterval={interval} onInterval={onInterval}>
      <div style={{ height: 280 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.ComposedChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false}/>
            <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }}/>
            <R.YAxis yAxisId="l" stroke="#4F8CFF" tick={{ fontSize: 11, fill: "#4F8CFF" }} tickFormatter={fmtUSD} width={56}/>
            <R.YAxis yAxisId="r" orientation="right" stroke="#06B6D4" tick={{ fontSize: 11, fill: "#06B6D4" }} width={32}/>
            <R.Tooltip content={customTooltip((p) => [
              { label: "Volume", value: fmtUSD(p[0]?.value), dot: "#4F8CFF" },
              { label: "New markets", value: fmtNum(p[1]?.value), dot: "#06B6D4" },
            ])}/>
            <R.Bar yAxisId="r" dataKey="markets" fill="rgba(6,182,212,0.45)" radius={[2, 2, 0, 0]}/>
            <R.Line yAxisId="l" type="monotone" dataKey="vol" stroke="#4F8CFF" strokeWidth={1.8} dot={false} isAnimationActive={false}/>
          </R.ComposedChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G15 Active markets over time -----
function ActiveMarkets() {
  const data = GSR_MOCKS.ecoActive;
  return (
    <ChartContainer title="Active Markets" subtitle="Daily open markets">
      <div style={{ height: 280 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.AreaChart data={data} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="g-act2" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#A855F7" stopOpacity={0.5}/>
                <stop offset="100%" stopColor="#A855F7" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4" vertical={false}/>
            <R.XAxis dataKey="t" tickFormatter={fmtDay} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }}/>
            <R.YAxis stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} width={50} tickFormatter={fmtNum}/>
            <R.Tooltip content={customTooltip((p) => [{ label: "Active", value: fmtNum(p[0]?.value), dot: "#A855F7" }])}/>
            <R.Area type="monotone" dataKey="active" stroke="#A855F7" strokeWidth={1.8} fill="url(#g-act2)" isAnimationActive={false}/>
          </R.AreaChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G16 Category breakdown -----
function CategoryBars() {
  const data = GSR_MOCKS.ecoCategory;
  return (
    <ChartContainer title="Volume by Category" subtitle="Last 30 days">
      <div style={{ height: 280 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.BarChart data={data} layout="vertical" margin={{ top: 4, right: 80, left: 16, bottom: 4 }}>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4"/>
            <R.XAxis type="number" stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={fmtUSD}/>
            <R.YAxis type="category" dataKey="name" stroke="#5A6178" tick={{ fontSize: 12, fill: "#E6E9F0" }} width={100}/>
            <R.Tooltip content={customTooltip((p) => [{ label: p[0]?.payload.name, value: fmtUSD(p[0]?.value) + " (" + p[0]?.payload.share + "%)", dot: p[0]?.payload.color }])} cursor={{ fill: "#1C2030" }}/>
            <R.Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {data.map((d, i) => <R.Cell key={i} fill={d.color}/>)}
              <R.LabelList dataKey="share" position="right" formatter={v => v + "%"} fill="#8A92A6" fontSize={11}/>
            </R.Bar>
          </R.BarChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G17 Calibration scatter -----
function CalibrationScatter() {
  const cal = GSR_MOCKS.calibration;
  const [filter, setFilter] = useState("all");
  const cats = ["all", ...Object.keys(GSR_MOCKS.categories)];
  const pts = filter === "all" ? cal.points : cal.points.filter(p => p.category === filter);
  const diag = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  return (
    <ChartContainer
      title="Calibration"
      subtitle="Implied probability vs realized outcome"
      legend={<div className="chip-row">
        {cats.map(c => <button key={c} className={"chip " + (filter === c ? "active" : "")} onClick={() => setFilter(c)}>{c === "all" ? "All" : (GSR_MOCKS.categories[c]?.name || c)}</button>)}
      </div>}>
      <div style={{ height: 420 }}>
        <R.ResponsiveContainer width="100%" height="100%">
          <R.ScatterChart margin={{ top: 10, right: 18, left: 0, bottom: 20 }}>
            <R.CartesianGrid stroke="#1F2433" strokeDasharray="2 4"/>
            <R.XAxis type="number" dataKey="x" domain={[0, 1]} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} tickFormatter={v => (v * 100).toFixed(0) + "%"} label={{ value: "Implied probability", fill: "#8A92A6", fontSize: 11, position: "insideBottom", offset: -8 }}/>
            <R.YAxis type="number" dataKey="y" domain={[-0.1, 1.1]} stroke="#5A6178" tick={{ fontSize: 11, fill: "#8A92A6" }} ticks={[0, 1]} tickFormatter={v => v === 1 ? "YES" : v === 0 ? "NO" : ""} width={48}/>
            <R.ZAxis dataKey="volume" range={[16, 120]}/>
            <R.Tooltip content={customTooltip((p) => {
              const d = p[0]?.payload || {};
              return [
                { label: "Predicted", value: ((d.x || 0) * 100).toFixed(1) + "%" },
                { label: "Outcome", value: d.outcome === 1 ? "YES" : "NO" },
                { label: "Category", value: d.category || "—" },
                { label: "Volume", value: fmtUSD(d.volume || 0) },
              ];
            })} cursor={{ strokeDasharray: "3 3" }}/>
            <R.ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#5A6178" strokeDasharray="4 4"/>
            <R.Scatter data={pts}>
              {pts.map((p, i) => <R.Cell key={i} fill={GSR_MOCKS.categories[p.category]?.color || "#4F8CFF"} fillOpacity={0.55}/>)}
            </R.Scatter>
            <R.Scatter data={cal.buckets} shape="circle" fill="#F59E0B">
              {cal.buckets.map((b, i) => <R.Cell key={i} fill="#F59E0B"/>)}
            </R.Scatter>
          </R.ScatterChart>
        </R.ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}

// ----- G18 Activity heatmap -----
function ActivityHeatmap() {
  const m = GSR_MOCKS.heatmap;
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return (
    <div className="card">
      <div className="chart-toolbar"><div><h3>Activity Heatmap</h3><div className="sub">Trades by day-of-week × hour-of-day</div></div></div>
      <div className="chart-body">
        <div className="heatmap">
          {m.map((row, di) => <>
            <div key={"y"+di} className="ylabel">{days[di]}</div>
            {row.map((v, hi) => (
              <div key={di+"-"+hi} className="cell" title={`${days[di]} ${String(hi).padStart(2, "0")}:00 — intensity ${(v*100).toFixed(0)}%`}
                style={{ background: `rgba(79,140,255,${0.06 + v * 0.75})` }}/>
            ))}
          </>)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12, alignItems: "center", fontSize: 11, color: "var(--text-secondary)" }}>
          <span>Low</span>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => <div key={v} style={{ width: 16, height: 12, borderRadius: 2, background: `rgba(79,140,255,${0.06 + v * 0.75})` }}/>)}
          <span>High</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  PriceChart, VolumeBars, OrderbookDepth, HoldersBar, ContractActivity, WalletsDaily,
  ResolutionTimeline, BondHistogram, DivergenceMini, MarketVsChainlink,
  EcosystemVolume, ActiveMarkets, CategoryBars, CalibrationScatter, ActivityHeatmap,
});
