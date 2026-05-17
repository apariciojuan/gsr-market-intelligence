/* GSR Market Intelligence — mock data fixtures
   Realistic-feeling data based on real Polymarket markets + real Polygon addresses. */

(function (global) {
  const now = Date.now();
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;

  // Deterministic PRNG so charts are stable across reloads
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function genWalk(seed, n, start, vol, min, max) {
    const rnd = mulberry32(seed);
    let v = start; const out = [];
    for (let i = 0; i < n; i++) {
      v += (rnd() - 0.5) * vol;
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
      out.push(v);
    }
    return out;
  }

  function genTimeSeries(seed, points, start, vol, hours, min, max) {
    const vals = genWalk(seed, points, start, vol, min, max);
    const step = (hours * HOUR) / points;
    return vals.map((v, i) => ({ t: now - hours * HOUR + i * step, v: Number(v.toFixed(4)) }));
  }

  // ----- KPI ecosystem -----
  const kpis = [
    { key: "vol24", label: "Volume 24h", value: "$24.31M", delta: 12.3, trend: "up", spark: genWalk(1, 30, 18, 1.2, 12, 28) },
    { key: "active", label: "Active Markets", value: "1,247", delta: 2.1, trend: "up", spark: genWalk(2, 30, 1180, 25, 1100, 1280) },
    { key: "pending", label: "Pending Resolutions", value: "38", delta: -8.4, trend: "down", spark: genWalk(3, 30, 45, 4, 30, 60) },
    { key: "divs", label: "Divergences Today", value: "12", delta: 33.3, trend: "up", spark: genWalk(4, 30, 8, 2, 3, 16) },
    { key: "users", label: "Active Users 24h", value: "8,629", delta: -1.2, trend: "down", spark: genWalk(5, 30, 9200, 220, 8000, 10000) },
  ];

  // ----- Categories -----
  const categories = {
    politics:  { name: "Politics", color: "#A855F7" },
    crypto:    { name: "Crypto",   color: "#F59E0B" },
    sports:    { name: "Sports",   color: "#22C55E" },
    economics: { name: "Economics",color: "#06B6D4" },
    pop:       { name: "Pop Culture", color: "#EC4899" },
    science:   { name: "Science",  color: "#14B8A6" },
  };

  // ----- Markets -----
  const marketDefs = [
    { slug: "trump-2028", q: "Will Trump win the 2028 Presidential Election?",      cat: "politics",  endsIn: "2 yr",  vol24: 2.43e6, vol: 24.3e6,  liq: 1.2e6,  yes: 0.42, d24: 3.2,  holders: 1248 },
    { slug: "btc-200k-eoy",q: "Will Bitcoin reach $200K by EOY 2026?",               cat: "crypto",    endsIn: "232d",  vol24: 1.91e6, vol: 18.7e6,  liq: 920e3,  yes: 0.32, d24: -4.8, holders: 942 },
    { slug: "fed-cut-jan", q: "Will the Fed cut rates in January 2026?",             cat: "economics", endsIn: "67d",   vol24: 1.20e6, vol: 9.30e6,  liq: 560e3,  yes: 0.68, d24: 1.1,  holders: 612 },
    { slug: "lakers-2026", q: "Will the Lakers win the 2026 NBA Championship?",      cat: "sports",    endsIn: "189d",  vol24: 870e3,  vol: 6.4e6,   liq: 410e3,  yes: 0.12, d24: -0.4, holders: 388 },
    { slug: "eth-10k-2026",q: "Will ETH close above $10,000 in 2026?",               cat: "crypto",    endsIn: "232d",  vol24: 740e3,  vol: 5.9e6,   liq: 380e3,  yes: 0.27, d24: 2.3,  holders: 411 },
    { slug: "spx-7000",    q: "Will the S&P 500 close above 7,000 in 2026?",         cat: "economics", endsIn: "232d",  vol24: 690e3,  vol: 5.1e6,   liq: 340e3,  yes: 0.54, d24: 0.8,  holders: 295 },
    { slug: "openai-ipo",  q: "Will OpenAI IPO before 2027?",                        cat: "economics", endsIn: "415d",  vol24: 620e3,  vol: 4.8e6,   liq: 310e3,  yes: 0.19, d24: -2.1, holders: 277 },
    { slug: "gpt5-2026",   q: "Will GPT-5 be released before July 2026?",            cat: "science",   endsIn: "63d",   vol24: 540e3,  vol: 4.2e6,   liq: 280e3,  yes: 0.71, d24: 5.6,  holders: 322 },
    { slug: "wwc-final",   q: "Will Real Madrid win the 2026 Club World Cup?",       cat: "sports",    endsIn: "45d",   vol24: 480e3,  vol: 3.4e6,   liq: 240e3,  yes: 0.33, d24: -1.7, holders: 198 },
    { slug: "mars-2030",   q: "Will SpaceX land humans on Mars before 2030?",        cat: "science",   endsIn: "4 yr",  vol24: 420e3,  vol: 3.1e6,   liq: 210e3,  yes: 0.08, d24: 0.2,  holders: 156 },
    { slug: "tay-tour",    q: "Will Taylor Swift announce a 2027 tour by Q2 2026?",  cat: "pop",       endsIn: "98d",   vol24: 380e3,  vol: 2.8e6,   liq: 190e3,  yes: 0.46, d24: 1.2,  holders: 142 },
    { slug: "uk-pm-2027",  q: "Will Keir Starmer be UK PM on Jan 1, 2027?",          cat: "politics",  endsIn: "232d",  vol24: 340e3,  vol: 2.5e6,   liq: 170e3,  yes: 0.61, d24: -0.5, holders: 134 },
  ];

  const markets = marketDefs.map((m, i) => ({
    ...m,
    sparkColor: m.d24 >= 0 ? "#22C55E" : "#EF4444",
    spark: genWalk(100 + i, 30, m.yes, 0.03, 0.01, 0.99),
    no: Number((1 - m.yes).toFixed(2)),
    createdAt: now - (180 + i * 7) * DAY,
  }));

  // ----- Top Holders for trump-2028 -----
  const holders = [
    { rank: 1, address: "0x7a3f5d2c1B8e9A4f6b2D8C3e1F5a9B4c7D2e8B21", label: "Polymarket Whale #1", shares: 142000, side: "yes", avg: 0.38, value: 59640, pnl: 5680 },
    { rank: 2, address: "0xa92E1c5f8D3b7A2c6E9f4B1d8A5c2E7b9D4a1F65", label: null,                  shares: 98500,  side: "no",  avg: 0.62, value: 57130, pnl: -1230 },
    { rank: 3, address: "0xc41B7e2A9d8F3b5C1e6A4f8B2d9C5e1A7f3B8d24", label: "Smart Trader",         shares: 76200,  side: "yes", avg: 0.41, value: 32004, pnl: 762 },
    { rank: 4, address: "0xb38D9c2F1a6E4b7C8d5A2f9B3e1C6d4A8f7B2e91", label: null,                  shares: 64100,  side: "yes", avg: 0.39, value: 26922, pnl: 1923 },
    { rank: 5, address: "0xe25A8d3c9F1b6E4a7B2c5D8f4A1e9C6b3F7d8a42", label: "Polymarket Treasury", shares: 58300,  side: "no",  avg: 0.55, value: 33814, pnl: 4081 },
    { rank: 6, address: "0xf17C4e9B2a8D5f1A6c3E7b4D9f2A8c1E5b7D3a18", label: null,                  shares: 41200,  side: "yes", avg: 0.44, value: 17304, pnl: -82 },
    { rank: 7, address: "0xd62A1f7C8e4B3d9A2c6F5b8E1d4A7c9B3f6E2a73", label: null,                  shares: 38900,  side: "no",  avg: 0.59, value: 22562, pnl: 1167 },
    { rank: 8, address: "0xa14B6c8D2f9E5a3B7c1F4d8A6e2C9b5D8f1E3a86", label: "Quant Fund",           shares: 35400,  side: "yes", avg: 0.40, value: 14868, pnl: 708 },
    { rank: 9, address: "0xc78D4f1B9e2A6c3F5b8D1a4E7c9B2f6D8a3E5b27", label: null,                  shares: 32100,  side: "yes", avg: 0.42, value: 13482, pnl: 0 },
    { rank:10, address: "0xb91E3a7c5F8b4D2a6E1c9F3b7D4a8C2e6B5f1A38", label: null,                  shares: 28500,  side: "no",  avg: 0.61, value: 16530, pnl: -285 },
  ];

  // ----- Trades -----
  const trades = Array.from({ length: 40 }).map((_, i) => {
    const rnd = mulberry32(50 + i);
    const side = rnd() > 0.45 ? "yes" : "no";
    const price = side === "yes" ? 0.40 + rnd() * 0.06 : 0.55 + rnd() * 0.06;
    const size = Math.round(rnd() * 12000) + 50;
    const a = holders[Math.floor(rnd() * holders.length)].address;
    return {
      t: now - i * (HOUR / 6 + rnd() * HOUR),
      side, action: rnd() > 0.5 ? "BUY" : "SELL",
      price: Number(price.toFixed(4)),
      size,
      total: Number((price * size).toFixed(2)),
      wallet: a,
      tx: "0x" + Math.floor(rnd() * 1e16).toString(16).padStart(16, "0") + Math.floor(rnd() * 1e16).toString(16).padStart(16, "0"),
    };
  });

  // ----- Orderbook -----
  const orderbook = (() => {
    const bids = []; const asks = [];
    let mid = 0.42;
    let bSize = 0; let aSize = 0;
    for (let i = 0; i < 20; i++) {
      bSize += 800 + Math.random() * 1500;
      bids.push({ price: Number((mid - 0.01 * (i + 1)).toFixed(2)), cum: Math.round(bSize) });
    }
    for (let i = 0; i < 20; i++) {
      aSize += 700 + Math.random() * 1500;
      asks.push({ price: Number((mid + 0.01 * (i + 1)).toFixed(2)), cum: Math.round(aSize) });
    }
    return { bids: bids.reverse(), asks, mid };
  })();

  // ----- Resolutions -----
  const statuses = ["disputed", "pending_uma", "proposed", "resolved", "pending_uma", "proposed", "disputed", "resolved", "proposed", "pending_uma", "resolved", "proposed", "resolved", "pending_uma", "proposed"];
  const propAddrs = ["0x7a3f...8b21", "0xa92E...1F65", "0xc41B...8d24", "0xb38D...2e91", "0xe25A...8a42", "0xf17C...3a18"];
  const resolutions = statuses.map((s, i) => {
    const m = marketDefs[i % marketDefs.length];
    return {
      questionId: "0x" + (1234567890 + i * 9876).toString(16).padStart(8, "0") + "...",
      status: s,
      question: m.q,
      slug: m.slug,
      bond: [500, 750, 1000, 1500, 2500, 5000, 750][i % 7],
      proposer: propAddrs[i % propAddrs.length],
      disputer: (s === "disputed") ? propAddrs[(i + 1) % propAddrs.length] : null,
      challengeEnds: now + (i * 17 + 8) * 60 * 1000 - 23 * 60 * 1000,
      endDate: now + (i * 9 + 1) * DAY,
      outcome: i % 2 === 0 ? "YES" : "NO",
    };
  });

  // Active resolutions for dashboard teaser
  const activeResolutions = resolutions.filter(r => r.status !== "resolved").slice(0, 5);

  // ----- Resolution detail for trump-2028 -----
  const resolutionDetail = {
    questionId: "0x1234abcd...",
    question: marketDefs[0].q,
    slug: "trump-2028",
    currentPhase: "challenge",
    timeline: [
      { phase: "initialized", title: "Created",    timestamp: now - 6 * HOUR,  completed: true,  state: "done" },
      { phase: "proposed",    title: "Proposed",   timestamp: now - 4 * HOUR,  completed: true,  state: "done",
        data: { proposer: "0x7a3f...8b21", bond: 750, outcome: "YES" } },
      { phase: "challenge",   title: "Challenge",  timestamp: now,             completed: false, state: "active",
        data: { deadlineIn: 1 * HOUR + 23 * 60 * 1000 } },
      { phase: "dvm_vote",    title: "DVM Vote",   timestamp: null,            completed: false, state: "pending" },
      { phase: "resolved",    title: "Resolved",   timestamp: null,            completed: false, state: "pending" },
    ],
  };

  // ----- Divergence signals -----
  const signals = [
    { id: "sig-1", type: "Price Gap", severity: 4, market: "Will Bitcoin reach $200K by EOY 2026?",  slug: "btc-200k-eoy",  marketImplied: 0.32, marketDelta: "↓", external: "Chainlink BTC/USD", externalValue: "$147,200", detected: "2h ago", updated: "14m ago" },
    { id: "sig-2", type: "News not reflected", severity: 5, market: "Will the Fed cut rates in January 2026?", slug: "fed-cut-jan", marketImplied: 0.68, marketDelta: "→", external: "Reuters: Fed signals hold", externalValue: "Hawkish FOMC minutes", detected: "47m ago", updated: "9m ago" },
    { id: "sig-3", type: "Sudden Move", severity: 3, market: "Will ETH close above $10,000 in 2026?", slug: "eth-10k-2026", marketImplied: 0.27, marketDelta: "↓", external: "Chainlink ETH/USD", externalValue: "$3,890", detected: "5h ago", updated: "1h ago" },
    { id: "sig-4", type: "Price Gap", severity: 2, market: "Will GPT-5 be released before July 2026?", slug: "gpt5-2026", marketImplied: 0.71, marketDelta: "↑", external: "OpenAI Dev Day rumors", externalValue: "Unconfirmed", detected: "1d ago", updated: "3h ago" },
  ];

  // Mini chart data for signals
  signals.forEach((s, i) => {
    s.market_series = genTimeSeries(200 + i, 48, s.marketImplied, 0.012, 24, 0, 1).map(p => ({ t: p.t, v: p.v }));
    s.external_series = genTimeSeries(300 + i, 48, s.marketImplied + 0.18, 0.014, 24, 0, 1).map(p => ({ t: p.t, v: p.v }));
  });

  // ----- Price history (Yes / No) for market detail -----
  function priceSeries(seed, hours, points, start) {
    const yes = genWalk(seed, points, start, 0.012, 0.05, 0.95);
    const step = (hours * HOUR) / points;
    return yes.map((v, i) => ({
      t: now - hours * HOUR + i * step,
      yes: Number(v.toFixed(4)),
      no: Number((1 - v).toFixed(4)),
      vol: Math.round(800 + Math.random() * 12000),
    }));
  }
  const priceHistory = {
    "1H": priceSeries(11, 1, 60, 0.42),
    "4H": priceSeries(12, 4, 80, 0.41),
    "1D": priceSeries(13, 24, 96, 0.39),
    "1W": priceSeries(14, 168, 120, 0.36),
    "MAX": priceSeries(15, 24 * 60, 180, 0.30),
  };
  const priceMarkers = [
    { t: now - 4 * HOUR,  type: "news", title: "Reuters: Trump leads in Iowa polls" },
    { t: now - 9 * HOUR,  type: "oracle", title: "Oracle proposal submitted (bond $750)" },
    { t: now - 18 * HOUR, type: "news", title: "AP: Court rules on ballot eligibility" },
  ];

  // ----- Contracts -----
  const contractAddr = "0xE111180000d2663C0091e4f400237545B87B996B"; // CTF Exchange real
  const contractDetail = {
    address: contractAddr,
    type: "Polymarket CTF Exchange",
    name: "CTF Exchange",
    firstSeen: "2021-06-15",
    totalTx: 4832109,
    uniqueWallets: 142847,
    linkedMarket: { slug: "trump-2028", q: marketDefs[0].q },
  };
  const contractActivity = (() => {
    const days = 30;
    const arr = []; const rnd = mulberry32(77);
    for (let i = 0; i < days; i++) {
      const tx = 1200 + Math.floor(rnd() * 3500 + Math.sin(i / 2) * 800);
      const uw = Math.floor(tx * (0.18 + rnd() * 0.08));
      const vol = tx * (2 + rnd() * 8) * 1000;
      arr.push({ t: now - (days - i) * DAY, tx, unique: uw, vol });
    }
    return arr;
  })();

  const contractTxs = Array.from({ length: 30 }).map((_, i) => {
    const rnd = mulberry32(900 + i);
    const events = ["OrderFilled", "OrderCanceled", "PositionSplit", "PayoutRedemption", "Transfer"];
    return {
      t: now - i * (10 * 60 * 1000 + rnd() * HOUR),
      event: events[Math.floor(rnd() * events.length)],
      from: holders[Math.floor(rnd() * holders.length)].address,
      to: contractAddr,
      args: { amount: Math.round(rnd() * 50000), tokenId: "0x" + Math.floor(rnd() * 1e10).toString(16) },
      tx: "0x" + Math.floor(rnd() * 1e16).toString(16).padStart(16, "0") + Math.floor(rnd() * 1e16).toString(16).padStart(16, "0"),
    };
  });

  // ----- Ecosystem -----
  const ecoVolume = (() => {
    const days = 90; const rnd = mulberry32(33);
    const arr = []; let base = 8;
    for (let i = 0; i < days; i++) {
      base += (rnd() - 0.5) * 1.2;
      base = Math.max(2, Math.min(40, base));
      arr.push({ t: now - (days - i) * DAY, vol: Number(base.toFixed(2)) * 1e6, markets: Math.floor(8 + rnd() * 30) });
    }
    return arr;
  })();
  const ecoActive = (() => {
    const days = 90; const rnd = mulberry32(34);
    const arr = []; let base = 980;
    for (let i = 0; i < days; i++) {
      base += (rnd() - 0.4) * 6;
      arr.push({ t: now - (days - i) * DAY, active: Math.floor(base) });
    }
    return arr;
  })();
  const ecoCategory = [
    { name: "Politics",  value: 18.4e6, share: 38, color: "#A855F7" },
    { name: "Crypto",    value: 11.2e6, share: 24, color: "#F59E0B" },
    { name: "Sports",    value: 7.8e6,  share: 17, color: "#22C55E" },
    { name: "Economics", value: 5.1e6,  share: 11, color: "#06B6D4" },
    { name: "Pop Culture",value: 3.2e6, share: 7,  color: "#EC4899" },
    { name: "Science",   value: 1.3e6,  share: 3,  color: "#14B8A6" },
  ];
  const calibration = (() => {
    const rnd = mulberry32(42); const pts = [];
    const cats = Object.keys(categories);
    for (let i = 0; i < 200; i++) {
      const x = rnd();
      const realRate = Math.min(0.99, Math.max(0.01, x + (rnd() - 0.5) * 0.18));
      const outcome = rnd() < realRate ? 1 : 0;
      const cat = cats[Math.floor(rnd() * cats.length)];
      pts.push({
        x: Number(x.toFixed(3)),
        y: outcome + (rnd() - 0.5) * 0.06,
        outcome,
        category: cat,
        volume: Math.round(Math.exp(rnd() * 5) * 10000),
        question: "Sample market #" + (i + 1),
      });
    }
    const buckets = [];
    for (let i = 0; i < 10; i++) {
      const lo = i / 10, hi = (i + 1) / 10;
      const inB = pts.filter(p => p.x >= lo && p.x < hi);
      if (!inB.length) continue;
      const avgPred = inB.reduce((s, p) => s + p.x, 0) / inB.length;
      const actual = inB.reduce((s, p) => s + p.outcome, 0) / inB.length;
      buckets.push({ x: Number(avgPred.toFixed(3)), y: Number(actual.toFixed(3)), count: inB.length, range: `${i * 10}-${(i + 1) * 10}%` });
    }
    return { points: pts, buckets };
  })();
  const ecoTopWallets = holders.map((h, i) => ({
    address: h.address, label: h.label,
    volume: 800000 + i * 120000,
    markets: 40 + i * 3,
    pnl: (i % 2 ? 1 : -1) * (12000 + i * 800),
    success: Number((0.42 + (i % 4) * 0.08).toFixed(2)),
  }));
  const heatmap = (() => {
    const matrix = []; const rnd = mulberry32(55);
    for (let d = 0; d < 7; d++) {
      const row = [];
      for (let h = 0; h < 24; h++) {
        const base = Math.sin((h - 14) / 4) * 0.4 + 0.4 + (d < 5 ? 0.2 : -0.1);
        row.push(Math.max(0, Math.min(1, base + (rnd() - 0.5) * 0.3)));
      }
      matrix.push(row);
    }
    return matrix;
  })();

  // ----- Global search index -----
  const searchIndex = {
    markets: marketDefs.slice(0, 5).map(m => ({ title: m.q, slug: m.slug, sub: m.cat })),
    wallets: holders.slice(0, 4).map(h => ({ title: h.label || (h.address.slice(0, 8) + "..." + h.address.slice(-4)), address: h.address, sub: h.label ? "Labeled" : "Unknown" })),
    contracts: [
      { title: "CTF Exchange", address: contractAddr, sub: "Polymarket" },
      { title: "USDC", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", sub: "ERC-20" },
      { title: "UMA Optimistic Oracle V2", address: "0xeE3Afe347D5C74317041E2618C49534dAf887c24", sub: "Oracle" },
    ],
    tags: [
      { title: "Politics", sub: "Category" },
      { title: "Crypto", sub: "Category" },
      { title: "Smart Money", sub: "Wallet tag" },
    ],
  };

  global.GSR_MOCKS = {
    kpis, categories, markets, holders, trades, orderbook,
    resolutions, activeResolutions, resolutionDetail,
    signals, priceHistory, priceMarkers,
    contractAddr, contractDetail, contractActivity, contractTxs,
    ecoVolume, ecoActive, ecoCategory, calibration, ecoTopWallets, heatmap,
    searchIndex,
  };
})(window);
