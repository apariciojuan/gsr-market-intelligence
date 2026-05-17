/* One-shot generator for app/lib/mocks/*.json.
 *
 * Produces JSON fixtures whose shapes match API_CONTRACT.md EXACTLY.
 * Reuses the realistic data from web-example/nextjs/lib/mocks.js but reshapes
 * it: the example uses loose shapes ({t,v} as ms numbers, vol24, yes/no flat
 * fields); the contract uses ISO timestamps, string wei amounts, nested
 * objects, etc. This script is the reshape step (checklist 1.5).
 *
 * Run: node scripts/gen-mocks.js   (from app/)
 * It is deterministic — re-running yields identical files.
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "lib", "mocks");

// Fixed "now" so fixtures are stable & reproducible.
const NOW = Date.parse("2026-05-11T14:00:00Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// ---- deterministic PRNG (mulberry32), same as the example ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function genWalk(seed, n, start, vol, min, max) {
  const rnd = mulberry32(seed);
  let v = start;
  const out = [];
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.5) * vol;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    out.push(v);
  }
  return out;
}
// time series of {t: ISO, v}
function genSeries(seed, points, start, vol, hours, min, max) {
  const vals = genWalk(seed, points, start, vol, min, max);
  const step = (hours * HOUR) / points;
  return vals.map((v, i) => ({
    t: iso(NOW - hours * HOUR + i * step),
    v: Number(v.toFixed(4)),
  }));
}
const round = (n, d = 2) => Number(n.toFixed(d));

// ============================================================
// Source definitions (reused/expanded from the example)
// ============================================================

const CATEGORY_COLORS = {
  Politics: "#A855F7",
  Crypto: "#F59E0B",
  Sports: "#22C55E",
  Economics: "#06B6D4",
  "Pop Culture": "#EC4899",
  Science: "#14B8A6",
};

// 14 markets — enough to exercise pagination (limit default 50, but lists
// short; we still cover ordering/filtering). ids are stable.
const marketDefs = [
  { id: 12345, slug: "will-trump-win-2028", q: "Will Donald Trump win the 2028 Presidential Election?", cat: "Politics", endDays: 905, vol24: 2.43e6, vol: 24.3e6, liq: 1.2e6, yes: 0.42, d24: 3.2, holders: 1248, traders: 1456 },
  { id: 12346, slug: "btc-200k-eoy-2026", q: "Will Bitcoin reach $200K by EOY 2026?", cat: "Crypto", endDays: 234, vol24: 1.91e6, vol: 18.7e6, liq: 920e3, yes: 0.32, d24: -4.8, holders: 942, traders: 1102 },
  { id: 12347, slug: "fed-cut-jan-2026", q: "Will the Fed cut rates in January 2026?", cat: "Economics", endDays: 67, vol24: 1.2e6, vol: 9.3e6, liq: 560e3, yes: 0.68, d24: 1.1, holders: 612, traders: 780 },
  { id: 12348, slug: "lakers-2026-championship", q: "Will the Lakers win the 2026 NBA Championship?", cat: "Sports", endDays: 189, vol24: 870e3, vol: 6.4e6, liq: 410e3, yes: 0.12, d24: -0.4, holders: 388, traders: 502 },
  { id: 12349, slug: "eth-10k-2026", q: "Will ETH close above $10,000 in 2026?", cat: "Crypto", endDays: 234, vol24: 740e3, vol: 5.9e6, liq: 380e3, yes: 0.27, d24: 2.3, holders: 411, traders: 540 },
  { id: 12350, slug: "spx-7000-2026", q: "Will the S&P 500 close above 7,000 in 2026?", cat: "Economics", endDays: 234, vol24: 690e3, vol: 5.1e6, liq: 340e3, yes: 0.54, d24: 0.8, holders: 295, traders: 360 },
  { id: 12351, slug: "openai-ipo-before-2027", q: "Will OpenAI IPO before 2027?", cat: "Economics", endDays: 415, vol24: 620e3, vol: 4.8e6, liq: 310e3, yes: 0.19, d24: -2.1, holders: 277, traders: 333 },
  { id: 12352, slug: "gpt5-before-july-2026", q: "Will GPT-5 be released before July 2026?", cat: "Science", endDays: 63, vol24: 540e3, vol: 4.2e6, liq: 280e3, yes: 0.71, d24: 5.6, holders: 322, traders: 401 },
  { id: 12353, slug: "real-madrid-cwc-2026", q: "Will Real Madrid win the 2026 Club World Cup?", cat: "Sports", endDays: 45, vol24: 480e3, vol: 3.4e6, liq: 240e3, yes: 0.33, d24: -1.7, holders: 198, traders: 256 },
  { id: 12354, slug: "spacex-mars-before-2030", q: "Will SpaceX land humans on Mars before 2030?", cat: "Science", endDays: 1460, vol24: 420e3, vol: 3.1e6, liq: 210e3, yes: 0.08, d24: 0.2, holders: 156, traders: 190 },
  { id: 12355, slug: "taylor-swift-2027-tour", q: "Will Taylor Swift announce a 2027 tour by Q2 2026?", cat: "Pop Culture", endDays: 98, vol24: 380e3, vol: 2.8e6, liq: 190e3, yes: 0.46, d24: 1.2, holders: 142, traders: 188 },
  { id: 12356, slug: "starmer-uk-pm-2027", q: "Will Keir Starmer be UK PM on Jan 1, 2027?", cat: "Politics", endDays: 234, vol24: 340e3, vol: 2.5e6, liq: 170e3, yes: 0.61, d24: -0.5, holders: 134, traders: 170 },
  { id: 12357, slug: "us-recession-2026", q: "Will the US enter a recession in 2026?", cat: "Economics", endDays: 234, vol24: 295e3, vol: 2.1e6, liq: 150e3, yes: 0.38, d24: 2.9, holders: 121, traders: 150, resolved: false },
  { id: 12358, slug: "world-cup-2026-usa", q: "Will the USA reach the 2026 World Cup semifinals?", cat: "Sports", endDays: 400, vol24: 0, vol: 1.9e6, liq: 0, yes: 0.22, d24: 0, holders: 98, traders: 130, resolved: true, active: false },
];

const condId = (i) => "0x" + (0xabc0000 + i * 0x1111).toString(16).padStart(40, "0");
const qId = (i) => "0x" + (0xdef0000 + i * 0x2222).toString(16).padStart(64, "0");
const tokenId = (i, side) => String(BigInt(100000000 + i * 7777 + (side === "yes" ? 1 : 2)));

function marketRead(m, i) {
  return {
    id: m.id,
    condition_id: condId(i),
    question_id: qId(i),
    slug: m.slug,
    question: m.q,
    description: `This market resolves YES if the conditions described in "${m.q}" are met by the resolution date, as determined by the UMA Optimistic Oracle.`,
    category: m.cat,
    tags: [m.cat.toLowerCase().replace(/\s+/g, "-")],
    outcomes: ["Yes", "No"],
    outcome_token_ids: [tokenId(i, "yes"), tokenId(i, "no")],
    market_address: "0x" + (0x7a3f0000 + i * 0x999).toString(16).padStart(40, "0"),
    image_url: `https://cdn.gsr-mi.example.com/markets/${m.slug}.png`,
    start_date: iso(NOW - (180 + i * 7) * DAY),
    end_date: iso(NOW + m.endDays * DAY),
    resolved: m.resolved ?? false,
    active: m.active ?? !(m.resolved ?? false),
    volume_total: m.vol,
    liquidity: m.liq,
    uma_adapter_version: "v2",
    uma_adapter_address: "0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74",
    last_synced_at: iso(NOW - HOUR),
  };
}
function marketListItem(m, i) {
  const r = marketRead(m, i);
  return {
    id: r.id,
    condition_id: r.condition_id,
    slug: r.slug,
    question: r.question,
    category: r.category,
    tags: r.tags,
    outcomes: r.outcomes,
    end_date: r.end_date,
    volume_total: r.volume_total,
    liquidity: r.liquidity,
    active: r.active,
    resolved: r.resolved,
  };
}

// ---- wallets / holders ----
const walletDefs = [
  { address: "0x7a3f5d2c1b8e9a4f6b2d8c3e1f5a9b4c7d2e8b21", label: "Polymarket Whale #1" },
  { address: "0xa92e1c5f8d3b7a2c6e9f4b1d8a5c2e7b9d4a1f65", label: null },
  { address: "0xc41b7e2a9d8f3b5c1e6a4f8b2d9c5e1a7f3b8d24", label: "Smart Trader" },
  { address: "0xb38d9c2f1a6e4b7c8d5a2f9b3e1c6d4a8f7b2e91", label: null },
  { address: "0xe25a8d3c9f1b6e4a7b2c5d8f4a1e9c6b3f7d8a42", label: "Polymarket Treasury" },
  { address: "0xf17c4e9b2a8d5f1a6c3e7b4d9f2a8c1e5b7d3a18", label: null },
  { address: "0xd62a1f7c8e4b3d9a2c6f5b8e1d4a7c9b3f6e2a73", label: null },
  { address: "0xa14b6c8d2f9e5a3b7c1f4d8a6e2c9b5d8f1e3a86", label: "Quant Fund" },
  { address: "0xc78d4f1b9e2a6c3f5b8d1a4e7c9b2f6d8a3e5b27", label: null },
  { address: "0xb91e3a7c5f8b4d2a6e1c9f3b7d4a8c2e6b5f1a38", label: null },
];

const holderRows = [
  { rank: 1, w: 0, shares: 142000, side: "yes", avg: 0.38, value: 59640, rpnl: 5680, upnl: 2120 },
  { rank: 2, w: 1, shares: 98500, side: "no", avg: 0.62, value: 57130, rpnl: -1230, upnl: 880 },
  { rank: 3, w: 2, shares: 76200, side: "yes", avg: 0.41, value: 32004, rpnl: 762, upnl: 1450 },
  { rank: 4, w: 3, shares: 64100, side: "yes", avg: 0.39, value: 26922, rpnl: 1923, upnl: 990 },
  { rank: 5, w: 4, shares: 58300, side: "no", avg: 0.55, value: 33814, rpnl: 4081, upnl: -320 },
  { rank: 6, w: 5, shares: 41200, side: "yes", avg: 0.44, value: 17304, rpnl: -82, upnl: 410 },
  { rank: 7, w: 6, shares: 38900, side: "no", avg: 0.59, value: 22562, rpnl: 1167, upnl: 230 },
  { rank: 8, w: 7, shares: 35400, side: "yes", avg: 0.4, value: 14868, rpnl: 708, upnl: 560 },
  { rank: 9, w: 8, shares: 32100, side: "yes", avg: 0.42, value: 13482, rpnl: 0, upnl: 120 },
  { rank: 10, w: 9, shares: 28500, side: "no", avg: 0.61, value: 16530, rpnl: -285, upnl: -90 },
];
function holders() {
  return holderRows.map((h) => ({
    rank: h.rank,
    address: walletDefs[h.w].address,
    address_label: walletDefs[h.w].label,
    shares: String(h.shares),
    side: h.side,
    avg_buy_price: h.avg,
    value_usd: h.value,
    realized_pnl_usd: h.rpnl,
    unrealized_pnl_usd: h.upnl,
    first_buy_at: iso(NOW - (15 + h.rank * 3) * DAY),
  }));
}

// ============================================================
// Build each fixture
// ============================================================
const files = {};

// ---- auth.json (fixed mock user + credentials + profile) ----
files["auth.json"] = {
  credentials: { username: "admin", password: "1234" },
  login_response: {
    access_token:
      "mock.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJyb2xlIjoiYWRtaW4ifQ.mock-signature",
    token_type: "bearer",
  },
  user: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "admin@gsr.com",
    display_name: "Admin",
    is_active: true,
    is_superuser: true,
    is_verified: true,
    created_at: "2026-05-01T10:00:00Z",
  },
};

// ---- health.json ----
files["health.json"] = {
  status: "ok",
  database: "ok",
  redis: "ok",
  polygon_rpc: "ok",
  version: "0.1.0",
  uptime_seconds: 1234567,
};

// ---- markets.json (full list of MarketListItem) ----
files["markets.json"] = {
  items: marketDefs.map((m, i) => marketListItem(m, i)),
};

// ---- market-detail.json (keyed by slug → MarketDetail) ----
const marketDetails = {};
marketDefs.forEach((m, i) => {
  const r = marketRead(m, i);
  const yes = m.yes;
  const no = round(1 - yes, 2);
  marketDetails[m.slug] = {
    market: r,
    stats: {
      volume_24h_usd: m.vol24,
      volume_7d_usd: round(m.vol24 * 5.3, 0),
      trader_count: m.traders,
      holder_count: m.holders,
      open_interest_usd: round(m.liq * 1.6, 0),
    },
    current_prices: {
      yes: {
        price: yes,
        bid: round(yes - 0.01, 2),
        ask: round(yes + 0.01, 2),
        midpoint: yes,
        spread: 0.02,
      },
      no: {
        price: no,
        bid: round(no - 0.01, 2),
        ask: round(no + 0.01, 2),
        midpoint: no,
        spread: 0.02,
      },
    },
    linked_contracts: [
      {
        address: "0xe111180000d2663c0091e4f400237545b87b996b",
        type: "polymarket_ctf_exchange",
        name: "CTF Exchange",
      },
      {
        address: "0x6a9d222616c90fca5754cd1333cfd9b7fb6a4f74",
        type: "uma_optimistic_oracle_v2",
        name: "UMA Adapter V2",
      },
    ],
    has_chainlink_overlay: m.cat === "Crypto",
    chainlink_asset_pair:
      m.cat === "Crypto" ? (m.slug.startsWith("btc") ? "BTC/USD" : "ETH/USD") : null,
  };
});
files["market-detail.json"] = marketDetails;

// ---- market-prices.json (keyed by market id → PriceHistory, interval 1h) ----
const marketPrices = {};
marketDefs.forEach((m, i) => {
  const hours = 24;
  const points = 24;
  const seriesYes = genSeries(11 + i, points, m.yes, 0.012, hours, 0.05, 0.95);
  const seriesNo = seriesYes.map((p) => ({ t: p.t, v: round(1 - p.v, 4) }));
  const volWalk = genWalk(50 + i, points, 12000, 6000, 500, 40000);
  const volumeSeries = seriesYes.map((p, k) => ({
    t: p.t,
    v: Math.round(volWalk[k]),
    direction: k > 0 && volWalk[k] >= volWalk[k - 1] ? "up" : "down",
  }));
  const isCrypto = m.cat === "Crypto";
  const ys = seriesYes.map((p) => p.v);
  marketPrices[String(m.id)] = {
    market_id: m.id,
    interval: "1h",
    from_time: iso(NOW - hours * HOUR),
    to_time: iso(NOW),
    series_yes: seriesYes,
    series_no: seriesNo,
    volume_series: volumeSeries,
    chainlink_overlay: isCrypto
      ? {
          asset_pair: m.slug.startsWith("btc") ? "BTC/USD" : "ETH/USD",
          feed_address: "0xc907e116054ad103354f2d350fd2514433d57f6f",
          series: genSeries(
            70 + i,
            points,
            m.slug.startsWith("btc") ? 147000 : 3800,
            m.slug.startsWith("btc") ? 1800 : 90,
            hours,
            0,
            null
          ),
        }
      : null,
    markers: [
      {
        t: iso(NOW - 16 * HOUR),
        type: "news",
        title: "Reuters: market-moving headline",
        url: "https://reuters.com/article/" + m.slug,
        source: "reuters",
      },
      {
        t: iso(NOW - 9 * HOUR),
        type: "oracle_proposal",
        proposer_address: walletDefs[0].address,
        bond_usd: 750,
        outcome: "Yes",
      },
    ],
    stats: {
      min_yes: round(Math.min(...ys), 4),
      max_yes: round(Math.max(...ys), 4),
      avg_yes: round(ys.reduce((a, b) => a + b, 0) / ys.length, 4),
      total_volume_usd: volumeSeries.reduce((a, b) => a + b.v, 0),
    },
  };
});
files["market-prices.json"] = marketPrices;

// ---- market-sparkline.json (keyed by market id → Sparkline) ----
const marketSparklines = {};
marketDefs.forEach((m, i) => {
  const values = genWalk(100 + i, 30, m.yes, 0.03, 0.01, 0.99).map((v) =>
    round(v, 4)
  );
  marketSparklines[String(m.id)] = {
    values,
    direction: values[values.length - 1] >= values[0] ? "up" : "down",
  };
});
files["market-sparkline.json"] = marketSparklines;

// ---- market-orderbook.json (keyed by market id → Orderbook) ----
const marketOrderbooks = {};
marketDefs.forEach((m, i) => {
  const mid = m.yes;
  const rnd = mulberry32(400 + i);
  const bids = [];
  const asks = [];
  let bCum = 0;
  let aCum = 0;
  for (let k = 0; k < 20; k++) {
    const bSize = Math.round(500 + rnd() * 1500);
    bCum += bSize;
    bids.push({
      price: round(mid - 0.01 * (k + 1), 2),
      size: bSize,
      cumulative_size: bCum,
    });
    const aSize = Math.round(500 + rnd() * 1500);
    aCum += aSize;
    asks.push({
      price: round(mid + 0.01 * (k + 1), 2),
      size: aSize,
      cumulative_size: aCum,
    });
  }
  marketOrderbooks[String(m.id)] = {
    market_id: m.id,
    outcome: "yes",
    token_id: tokenId(i, "yes"),
    midpoint: mid,
    spread: 0.02,
    bids,
    asks,
    last_updated_at: iso(NOW - 30 * 1000),
  };
});
files["market-orderbook.json"] = marketOrderbooks;

// ---- market-holders.json (keyed by market id → Holder[]) ----
// Use same holder set for all markets (realistic enough for the demo).
const marketHolders = {};
marketDefs.forEach((m) => {
  marketHolders[String(m.id)] = holders();
});
files["market-holders.json"] = marketHolders;

// ---- market-trades.json (keyed by market id → Trade[]) ----
const marketTrades = {};
marketDefs.forEach((m, i) => {
  const rows = Array.from({ length: 40 }).map((_, k) => {
    const rnd = mulberry32(900 + i * 100 + k);
    const side = rnd() > 0.5 ? "buy" : "sell";
    const outcome = rnd() > 0.45 ? "yes" : "no";
    const price =
      outcome === "yes"
        ? round(m.yes - 0.03 + rnd() * 0.06, 4)
        : round(1 - m.yes - 0.03 + rnd() * 0.06, 4);
    const size = Math.round(rnd() * 12000) + 50;
    const w = walletDefs[Math.floor(rnd() * walletDefs.length)];
    return {
      tx_hash:
        "0x" +
        Math.floor(rnd() * 1e16).toString(16).padStart(16, "0") +
        Math.floor(rnd() * 1e16).toString(16).padStart(16, "0"),
      time: iso(NOW - k * (HOUR / 6) - Math.floor(rnd() * HOUR)),
      side,
      outcome,
      price,
      size,
      value_usd: round(price * size, 2),
      trader_address: w.address,
      block_number: 52345678 - k * 37 - i,
    };
  });
  marketTrades[String(m.id)] = rows;
});
files["market-trades.json"] = marketTrades;

// ---- market-news.json (keyed by market id → NewsWithSignal[]) ----
const NEWS_SOURCES = ["reuters", "ap", "bloomberg", "coindesk", "the-block"];
const marketNews = {};
marketDefs.forEach((m, i) => {
  const rows = Array.from({ length: 6 }).map((_, k) => {
    const rnd = mulberry32(1300 + i * 10 + k);
    const rel = round(0.5 + rnd() * 0.49, 2);
    return {
      news: {
        id: 9000 + i * 10 + k,
        source: NEWS_SOURCES[Math.floor(rnd() * NEWS_SOURCES.length)],
        url: `https://news.example.com/${m.slug}/${k}`,
        title: `Headline ${k + 1} relevant to "${m.q}"`,
        summary:
          "Summary of the article and why it is relevant to this prediction market.",
        published_at: iso(NOW - (k * 5 + 2) * HOUR),
        language: "en",
      },
      signal: {
        relevance_score: rel,
        method: "cosine_similarity",
      },
    };
  });
  marketNews[String(m.id)] = rows;
});
files["market-news.json"] = marketNews;

// ---- dashboard-summary.json ----
files["dashboard-summary.json"] = {
  kpis: [
    { key: "volume_24h", label: "Volume 24h", value: 8647323, value_formatted: "$8.6M", delta_pct: 12.3, delta_direction: "up" },
    { key: "active_markets", label: "Active Markets", value: 1247, value_formatted: "1,247", delta_pct: -2.1, delta_direction: "down" },
    { key: "pending_resolutions", label: "Pending Resolutions", value: 34, value_formatted: "34", delta_pct: null, delta_direction: "neutral" },
    { key: "divergences_today", label: "Divergences Today", value: 7, value_formatted: "7", delta_pct: null, delta_direction: "neutral" },
    { key: "active_users_24h", label: "Active Wallets 24h", value: 8421, value_formatted: "8,421", delta_pct: 5.2, delta_direction: "up" },
  ],
  active_resolutions: [],
};

// ---- resolutions.json (ResolutionListItem[]) ----
const RES_STATUSES = [
  "disputed", "pending", "proposed", "resolved", "pending", "proposed",
  "disputed", "resolved", "proposed", "pending", "resolved", "proposed",
  "resolved", "pending",
];
const resolutionItems = RES_STATUSES.map((status, i) => {
  const m = marketDefs[i % marketDefs.length];
  const mi = i % marketDefs.length;
  const bond = [500, 750, 1000, 1500, 2500, 5000, 750][i % 7];
  const requestTs = NOW - (i * 3 + 2) * HOUR;
  const proposalTs = status === "pending" ? null : requestTs + 30 * 60 * 1000;
  const challengeDeadline = proposalTs ? proposalTs + 2 * HOUR : null;
  const secondsRemaining =
    status === "resolved" || !challengeDeadline
      ? null
      : Math.max(0, Math.round((challengeDeadline - NOW) / 1000));
  const isUrgent =
    status === "proposed" &&
    secondsRemaining != null &&
    secondsRemaining < 1800;
  return {
    id: 789 + i,
    question_id: qId(mi),
    market_id: m.id,
    market_question: m.q,
    market_slug: m.slug,
    adapter_version: "v2",
    adapter_address: "0x6a9d222616c90fca5754cd1333cfd9b7fb6a4f74",
    status,
    proposer_address: status === "pending" ? null : walletDefs[i % walletDefs.length].address,
    disputer_address: status === "disputed" ? walletDefs[(i + 1) % walletDefs.length].address : null,
    proposed_outcome: status === "pending" ? null : i % 2 === 0 ? "Yes" : "No",
    bond_usd: bond,
    counter_bond_usd: status === "disputed" ? bond : null,
    request_timestamp: iso(requestTs),
    proposal_timestamp: proposalTs ? iso(proposalTs) : null,
    challenge_deadline: challengeDeadline ? iso(challengeDeadline) : null,
    seconds_remaining: secondsRemaining,
    uma_oracle_url: "https://oracle.uma.xyz/request?questionId=" + qId(mi),
    is_urgent: isUrgent,
  };
});
files["resolutions.json"] = { items: resolutionItems };

// Backfill dashboard active_resolutions from non-resolved resolutions.
files["dashboard-summary.json"].active_resolutions = resolutionItems
  .filter((r) => r.status !== "resolved")
  .slice(0, 5)
  .map((r) => ({
    question_id: r.question_id,
    market_question: r.market_question,
    status: r.status,
    bond_usd: r.bond_usd,
    ends_in_seconds: r.seconds_remaining ?? 3600,
    challenge_deadline: r.challenge_deadline ?? iso(NOW + HOUR),
  }));

// ---- resolution-detail.json (keyed by question_id → ResolutionDetail) ----
const resolutionDetails = {};
resolutionItems.forEach((r, idx) => {
  const mi = marketDefs.findIndex((m) => m.id === r.market_id);
  const m = marketDefs[mi];
  const requestTs = Date.parse(r.request_timestamp);
  const proposalTs = r.proposal_timestamp ? Date.parse(r.proposal_timestamp) : null;
  const deadline = r.challenge_deadline ? Date.parse(r.challenge_deadline) : null;
  const phaseOrder = ["initialized", "proposed", "challenge", "dvm_vote", "resolved"];
  let currentPhase = "initialized";
  if (r.status === "pending") currentPhase = "initialized";
  else if (r.status === "proposed") currentPhase = "challenge";
  else if (r.status === "disputed") currentPhase = "dvm_vote";
  else if (r.status === "resolved") currentPhase = "resolved";
  const curIdx = phaseOrder.indexOf(currentPhase);
  const timeline = phaseOrder.map((phase, pi) => {
    const completed = pi < curIdx || (r.status === "resolved" && pi <= curIdx);
    let timestamp = null;
    let data = null;
    let txHash;
    if (phase === "initialized") {
      timestamp = iso(requestTs);
      data = { creator: walletDefs[0].address, reward_token: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", reward_usd: 5 };
      txHash = "0x" + (0x1a2b + idx).toString(16).padStart(64, "0");
    } else if (phase === "proposed" && proposalTs) {
      timestamp = iso(proposalTs);
      data = { proposer: r.proposer_address, bond_usd: r.bond_usd, outcome: r.proposed_outcome };
      txHash = "0x" + (0x3c4d + idx).toString(16).padStart(64, "0");
    } else if (phase === "challenge" && deadline) {
      timestamp = iso(proposalTs);
      data = { deadline: iso(deadline), seconds_remaining: r.seconds_remaining ?? 0 };
    } else if (phase === "dvm_vote" && r.status === "disputed") {
      timestamp = iso(deadline);
      data = { disputer: r.disputer_address, counter_bond_usd: r.counter_bond_usd };
    } else if (phase === "resolved" && r.status === "resolved") {
      timestamp = iso(NOW - idx * HOUR);
      data = { final_outcome: r.proposed_outcome ?? "Yes" };
      txHash = "0x" + (0x5e6f + idx).toString(16).padStart(64, "0");
    }
    const entry = { phase, timestamp, completed: !!completed && timestamp != null, data };
    if (txHash) entry.tx_hash = txHash;
    return entry;
  });
  resolutionDetails[r.question_id] = {
    question_id: r.question_id,
    market: marketRead(m, mi),
    current_phase: currentPhase,
    is_disputed: r.status === "disputed",
    is_resolved: r.status === "resolved",
    ancillary_data_decoded: `This market resolves YES if: ${m.q}`,
    timeline,
    dispute:
      r.status === "disputed"
        ? {
            disputer_address: r.disputer_address,
            counter_bond_usd: r.counter_bond_usd,
            disputed_at: iso(deadline),
            reason: "Proposed outcome contradicts on-chain settlement data.",
          }
        : null,
    market_impact_chart: {
      from_time: iso(requestTs - 2 * HOUR),
      to_time: iso(deadline ?? NOW),
      price_series_yes: genSeries(2000 + idx, 24, m.yes, 0.01, 6, 0, 1),
    },
    uma_oracle_url: r.uma_oracle_url,
  };
});
files["resolution-detail.json"] = resolutionDetails;

// ---- resolution-stats.json ----
files["resolution-stats.json"] = {
  window: "30d",
  total_resolutions: 234,
  disputed_count: 12,
  dispute_rate_pct: 5.1,
  avg_resolution_seconds: 8400,
  bond_histogram: [
    { bucket: "0-100", count: 4 },
    { bucket: "100-500", count: 89 },
    { bucket: "500-1000", count: 134 },
    { bucket: "1000-5000", count: 6 },
    { bucket: "5000+", count: 1 },
  ],
};

// ---- signals.json (SignalListItem[]) ----
const SIGNAL_DEFS = [
  { mi: 1, type: "price_gap_vs_chainlink", severity: 4, magnitude: 12.3, direction: "market_below", external: "chainlink_btc_usd", extVal: 0.45, window: 60, status: "active" },
  { mi: 2, type: "news_not_reflected", severity: 5, magnitude: 18.7, direction: "market_above", external: "reuters_fed_hold", extVal: 0.5, window: 120, status: "active" },
  { mi: 4, type: "sudden_move_no_signal", severity: 3, magnitude: 8.4, direction: "market_below", external: "chainlink_eth_usd", extVal: 0.39, window: 30, status: "active" },
  { mi: 7, type: "price_gap_vs_chainlink", severity: 2, magnitude: 5.1, direction: "market_above", external: "openai_devday_rumor", extVal: 0.66, window: 240, status: "active" },
  { mi: 5, type: "chainlink_move_no_market", severity: 3, magnitude: 9.8, direction: "market_below", external: "chainlink_eth_usd", extVal: 0.34, window: 90, status: "closed" },
];
function divergenceRead(idx, def) {
  const m = marketDefs[def.mi];
  return {
    id: 456 + idx,
    market_id: m.id,
    divergence_type: def.type,
    detected_at: iso(NOW - (idx * 2 + 1) * HOUR),
    last_updated_at: iso(NOW - (idx * 10 + 9) * 60 * 1000),
    severity: def.severity,
    magnitude_pct: def.magnitude,
    direction: def.direction,
    market_value: m.yes,
    external_value: def.extVal,
    external_source: def.external,
    time_window_minutes: def.window,
    status: def.status,
  };
}
function miniChart(idx, def) {
  const m = marketDefs[def.mi];
  return {
    market_series: genSeries(2200 + idx, 48, m.yes, 0.012, 24, 0, 1),
    external_series: genSeries(2300 + idx, 48, def.extVal, 0.014, 24, 0, 1),
  };
}
const signalItems = SIGNAL_DEFS.map((def, idx) => {
  const m = marketDefs[def.mi];
  return {
    divergence: divergenceRead(idx, def),
    market: { id: m.id, slug: m.slug, question: m.q, category: m.cat },
    mini_chart_data: miniChart(idx, def),
  };
});
files["signals.json"] = { items: signalItems };

// ---- signal-detail.json (keyed by divergence id → SignalDetail) ----
const signalDetails = {};
SIGNAL_DEFS.forEach((def, idx) => {
  const m = marketDefs[def.mi];
  const d = divergenceRead(idx, def);
  const mc = miniChart(idx, def);
  signalDetails[String(d.id)] = {
    divergence: d,
    market: marketRead(m, def.mi),
    market_series: mc.market_series,
    external_series: mc.external_series,
    detection_point: {
      t: d.detected_at,
      market_value: d.market_value,
      external_value: d.external_value,
      magnitude_pct: d.magnitude_pct,
    },
    related_news: (marketNews[String(m.id)] || []).slice(0, 3).map((n) => n.news),
  };
});
files["signal-detail.json"] = signalDetails;

// ---- dashboard-notable-divergences.json (DivergenceCard[]) ----
files["dashboard-notable-divergences.json"] = {
  items: signalItems.filter((s) => s.divergence.status === "active").slice(0, 3),
};

// ---- dashboard-top-markets.json (TopMarketItem[]) ----
files["dashboard-top-markets.json"] = {
  items: marketDefs
    .filter((m) => (m.active ?? true) && m.vol24 > 0)
    .sort((a, b) => b.vol24 - a.vol24)
    .slice(0, 10)
    .map((m, i) => {
      const idx = marketDefs.indexOf(m);
      const spark = genWalk(100 + idx, 6, m.yes, 0.02, 0.01, 0.99).map((v) =>
        round(v, 2)
      );
      return {
        id: m.id,
        slug: m.slug,
        question: m.q,
        category: m.cat,
        price_yes: m.yes,
        price_no: round(1 - m.yes, 2),
        delta_pct_24h: m.d24,
        volume_24h_usd: m.vol24,
        end_date: iso(NOW + m.endDays * DAY),
        sparkline: spark,
      };
    }),
};

// ---- contracts.json (keyed by address → ContractRead) ----
const CTF_ADDR = "0xe111180000d2663c0091e4f400237545b87b996b";
const USDC_ADDR = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const UMA_ADDR = "0xee3afe347d5c74317041e2618c49534daf887c24";
files["contracts.json"] = {
  [CTF_ADDR]: {
    id: 42,
    address: CTF_ADDR,
    chain_id: 137,
    contract_type: "polymarket_ctf_exchange",
    name: "CTF Exchange",
    symbol: null,
    decimals: null,
    abi_key: "ctf_exchange",
    first_seen_block: 18000000,
    metadata_json: {
      deployer: "0x6e1f3b8d4a2c5e9b7f1d6a3c8e4b2f9d5a7c1e63",
      deployment_tx: "0x" + "ab".repeat(32),
    },
    polygonscan_url: "https://polygonscan.com/address/" + CTF_ADDR,
    linked_market: null,
    created_at: "2026-05-01T10:00:00Z",
  },
  [USDC_ADDR]: {
    id: 43,
    address: USDC_ADDR,
    chain_id: 137,
    contract_type: "erc20",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    abi_key: "erc20",
    first_seen_block: 14000000,
    metadata_json: { deployer: "0x" + "00".repeat(20) },
    polygonscan_url: "https://polygonscan.com/address/" + USDC_ADDR,
    linked_market: null,
    created_at: "2026-05-01T10:00:00Z",
  },
  [UMA_ADDR]: {
    id: 44,
    address: UMA_ADDR,
    chain_id: 137,
    contract_type: "uma_optimistic_oracle_v2",
    name: "UMA Optimistic Oracle V2",
    symbol: null,
    decimals: null,
    abi_key: "uma_oo_v2",
    first_seen_block: 25000000,
    metadata_json: {},
    polygonscan_url: "https://polygonscan.com/address/" + UMA_ADDR,
    linked_market: {
      id: marketDefs[0].id,
      slug: marketDefs[0].slug,
      question: marketDefs[0].q,
    },
    created_at: "2026-05-01T10:00:00Z",
  },
};

// ---- contract-summary.json (keyed by address → ContractSummary) ----
files["contract-summary.json"] = {
  [CTF_ADDR]: {
    contract: files["contracts.json"][CTF_ADDR],
    total_transactions: 4832109,
    unique_wallets: 142847,
    total_volume_usd: 8647323000,
    first_activity: "2021-06-15T12:34:56Z",
    last_activity: iso(NOW - 60 * 1000),
    is_polymarket_market: false,
    linked_market: null,
  },
  [USDC_ADDR]: {
    contract: files["contracts.json"][USDC_ADDR],
    total_transactions: 98234567,
    unique_wallets: 2384721,
    total_volume_usd: 184000000000,
    first_activity: "2020-04-01T00:00:00Z",
    last_activity: iso(NOW - 5 * 1000),
    is_polymarket_market: false,
    linked_market: null,
  },
  [UMA_ADDR]: {
    contract: files["contracts.json"][UMA_ADDR],
    total_transactions: 482109,
    unique_wallets: 38472,
    total_volume_usd: 264000000,
    first_activity: "2021-08-01T00:00:00Z",
    last_activity: iso(NOW - 12 * 60 * 1000),
    is_polymarket_market: true,
    linked_market: {
      id: marketDefs[0].id,
      slug: marketDefs[0].slug,
      question: marketDefs[0].q,
    },
  },
};

// ---- contract-sync-status.json (keyed by address → SyncStatus) ----
files["contract-sync-status.json"] = {
  [CTF_ADDR]: {
    address: CTF_ADDR,
    sync_status: "completed",
    progress_pct: 100,
    last_block_processed: 52002000,
    current_polygon_block: 52002000,
    blocks_remaining: 0,
    events_found: 4832109,
    started_at: iso(NOW - 2 * HOUR),
    estimated_completion_at: iso(NOW - 90 * 60 * 1000),
    error_message: null,
  },
  [USDC_ADDR]: {
    address: USDC_ADDR,
    sync_status: "syncing",
    progress_pct: 67.5,
    last_block_processed: 52001350,
    current_polygon_block: 52002000,
    blocks_remaining: 650,
    events_found: 4832,
    started_at: iso(NOW - 45 * 1000),
    estimated_completion_at: iso(NOW + 15 * 1000),
    error_message: null,
  },
  [UMA_ADDR]: {
    address: UMA_ADDR,
    sync_status: "completed",
    progress_pct: 100,
    last_block_processed: 52002000,
    current_polygon_block: 52002000,
    blocks_remaining: 0,
    events_found: 482109,
    started_at: iso(NOW - 3 * HOUR),
    estimated_completion_at: iso(NOW - 2 * HOUR),
    error_message: null,
  },
};

// ---- contract-activity.json (keyed by address → ContractActivity) ----
const contractActivity = {};
[CTF_ADDR, USDC_ADDR, UMA_ADDR].forEach((addr, ai) => {
  const days = 30;
  const rnd = mulberry32(77 + ai);
  const buckets = [];
  for (let i = 0; i < days; i++) {
    const tx = 1200 + Math.floor(rnd() * 3500 + Math.sin(i / 2) * 800);
    const uw = Math.floor(tx * (0.18 + rnd() * 0.08));
    const vol = Math.round(tx * (2 + rnd() * 8) * 1000);
    buckets.push({
      t: iso(NOW - (days - i) * DAY),
      tx_count: tx,
      unique_senders: uw,
      volume_usd: vol,
    });
  }
  contractActivity[addr] = {
    address: addr,
    interval: "1d",
    from_time: iso(NOW - days * DAY),
    to_time: iso(NOW),
    buckets,
  };
});
files["contract-activity.json"] = contractActivity;

// ---- contract-transactions.json (keyed by address → ContractTransaction[]) ----
const EVENTS = ["OrderFilled", "OrderCanceled", "PositionSplit", "PayoutRedemption", "Transfer"];
const contractTxs = {};
[CTF_ADDR, USDC_ADDR, UMA_ADDR].forEach((addr, ai) => {
  const rows = Array.from({ length: 40 }).map((_, k) => {
    const rnd = mulberry32(900 + ai * 100 + k);
    const from = walletDefs[Math.floor(rnd() * walletDefs.length)].address;
    const to = walletDefs[Math.floor(rnd() * walletDefs.length)].address;
    const event = EVENTS[Math.floor(rnd() * EVENTS.length)];
    return {
      tx_hash:
        "0x" +
        Math.floor(rnd() * 1e16).toString(16).padStart(16, "0") +
        Math.floor(rnd() * 1e16).toString(16).padStart(16, "0"),
      log_index: Math.floor(rnd() * 8),
      block_number: 52001234 - k * 11 - ai,
      time: iso(NOW - k * (10 * 60 * 1000) - Math.floor(rnd() * HOUR)),
      event_name: event,
      from_address: from,
      to_address: to,
      decoded_args: {
        orderHash: "0x" + Math.floor(rnd() * 1e16).toString(16).padStart(32, "0"),
        maker: from,
        taker: to,
        makerAmountFilled: String(Math.round(rnd() * 5e8)),
        takerAmountFilled: String(Math.round(rnd() * 12e8)),
        fee: "0",
      },
      value_usd: round(rnd() * 5000, 2),
      polygonscan_url:
        "https://polygonscan.com/tx/0x" +
        Math.floor(rnd() * 1e16).toString(16).padStart(16, "0"),
    };
  });
  contractTxs[addr] = rows;
});
files["contract-transactions.json"] = contractTxs;

// ---- ecosystem-kpis.json ----
files["ecosystem-kpis.json"] = {
  kpis: [
    { key: "total_volume_24h", label: "Total Volume 24h", value: 8647323, value_formatted: "$8.6M", delta_pct: 12.3, delta_direction: "up" },
    { key: "active_markets", label: "Active Markets", value: 1247, value_formatted: "1,247", delta_pct: 2.1, delta_direction: "up" },
    { key: "pending_resolutions", label: "Pending Resolutions", value: 38, value_formatted: "38", delta_pct: -8.4, delta_direction: "down" },
    { key: "divergences_today", label: "Divergences Today", value: 12, value_formatted: "12", delta_pct: 33.3, delta_direction: "up" },
    { key: "active_wallets_24h", label: "Active Wallets 24h", value: 8629, value_formatted: "8,629", delta_pct: -1.2, delta_direction: "down" },
  ],
};

// ---- ecosystem-sparkline.json (keyed by kpi key → EcoSparkline) ----
const ecoSparkSeeds = {
  total_volume_24h: [1, 8000000, 600000, 4000000, 14000000],
  active_markets: [2, 1180, 25, 1100, 1280],
  pending_resolutions: [3, 45, 4, 30, 60],
  divergences_today: [4, 8, 2, 3, 16],
  active_wallets_24h: [5, 9200, 220, 8000, 10000],
};
const ecoSparklines = {};
Object.entries(ecoSparkSeeds).forEach(([key, [seed, start, vol, min, max]]) => {
  const values = genWalk(seed, 30, start, vol, min, max).map((v) =>
    Math.round(v)
  );
  ecoSparklines[key] = {
    key,
    values,
    direction: values[values.length - 1] >= values[0] ? "up" : "down",
  };
});
files["ecosystem-sparkline.json"] = ecoSparklines;

// ---- ecosystem-volume.json ----
(() => {
  const days = 90;
  const rnd = mulberry32(33);
  let base = 8;
  const buckets = [];
  for (let i = 0; i < days; i++) {
    base += (rnd() - 0.5) * 1.2;
    base = Math.max(2, Math.min(40, base));
    buckets.push({
      t: iso(NOW - (days - i) * DAY),
      volume_usd: Math.round(base * 1e6),
      new_markets: Math.floor(8 + rnd() * 30),
    });
  }
  files["ecosystem-volume.json"] = {
    interval: "1d",
    from_time: iso(NOW - days * DAY),
    to_time: iso(NOW),
    buckets,
  };
})();

// ---- ecosystem-active-markets.json ----
(() => {
  const days = 90;
  const rnd = mulberry32(34);
  let base = 980;
  const buckets = [];
  for (let i = 0; i < days; i++) {
    base += (rnd() - 0.4) * 6;
    buckets.push({
      t: iso(NOW - (days - i) * DAY),
      active_count: Math.floor(base),
    });
  }
  files["ecosystem-active-markets.json"] = { interval: "1d", buckets };
})();

// ---- ecosystem-by-category.json ----
(() => {
  const cats = [
    { name: "Politics", volume_usd: 18400000 },
    { name: "Crypto", volume_usd: 11200000 },
    { name: "Sports", volume_usd: 7800000 },
    { name: "Economics", volume_usd: 5100000 },
    { name: "Pop Culture", volume_usd: 3200000 },
    { name: "Science", volume_usd: 1300000 },
  ];
  const total = cats.reduce((a, c) => a + c.volume_usd, 0);
  files["ecosystem-by-category.json"] = {
    window: "30d",
    total_volume_usd: total,
    categories: cats.map((c) => ({
      name: c.name,
      volume_usd: c.volume_usd,
      share_pct: round((c.volume_usd / total) * 100, 1),
      color: CATEGORY_COLORS[c.name],
    })),
  };
})();

// ---- ecosystem-calibration.json ----
(() => {
  const rnd = mulberry32(42);
  const cats = Object.keys(CATEGORY_COLORS);
  const markets = [];
  for (let i = 0; i < 200; i++) {
    const implied = round(rnd(), 3);
    const realRate = Math.min(0.99, Math.max(0.01, implied + (rnd() - 0.5) * 0.18));
    const outcome = rnd() < realRate ? 1 : 0;
    const cat = cats[Math.floor(rnd() * cats.length)];
    markets.push({
      id: 20000 + i,
      slug: "sample-market-" + (i + 1),
      question: "Sample calibration market #" + (i + 1),
      implied_prob_avg: implied,
      outcome,
      category: cat.toLowerCase().replace(/\s+/g, "-"),
      volume_usd: Math.round(Math.exp(rnd() * 5) * 10000),
    });
  }
  const buckets = [];
  for (let i = 0; i < 10; i++) {
    const lo = i / 10;
    const hi = (i + 1) / 10;
    const inB = markets.filter(
      (m) => m.implied_prob_avg >= lo && m.implied_prob_avg < hi
    );
    if (!inB.length) continue;
    const predAvg =
      inB.reduce((s, m) => s + m.implied_prob_avg, 0) / inB.length;
    const actual = inB.reduce((s, m) => s + m.outcome, 0) / inB.length;
    buckets.push({
      range: `${i * 10}-${(i + 1) * 10}%`,
      predicted_avg: round(predAvg, 3),
      actual_rate: round(actual, 3),
      count: inB.length,
    });
  }
  files["ecosystem-calibration.json"] = {
    window: "all",
    category: "all",
    markets_count: markets.length,
    markets,
    buckets,
    overall_brier_score: 0.187,
  };
})();

// ---- ecosystem-activity-heatmap.json ----
(() => {
  const rnd = mulberry32(55);
  const matrix = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const base = Math.sin((h - 14) / 4) * 0.4 + 0.4 + (d < 5 ? 0.2 : -0.1);
      const norm = Math.max(0, Math.min(1, base + (rnd() - 0.5) * 0.3));
      matrix.push({ day: d, hour: h, tx_count: Math.round(norm * 4000 + 100) });
    }
  }
  files["ecosystem-activity-heatmap.json"] = { window: "30d", matrix };
})();

// ---- ecosystem-top-wallets.json (TopWallet[]) ----
files["ecosystem-top-wallets.json"] = {
  items: walletDefs.map((w, i) => ({
    address: w.address,
    address_label: w.label,
    total_volume_usd: 800000 + i * 120000,
    trade_count: 423 - i * 19,
    market_count: 87 - i * 4,
    realized_pnl_usd: (i % 2 ? 1 : -1) * (12300 + i * 800),
    success_rate_pct: round(67.4 - i * 2.1, 1),
    first_seen_at: iso(NOW - (300 + i * 30) * DAY),
  })),
};

// ---- search.json (one canned SearchResults; mock filters client-side) ----
files["search.json"] = {
  markets: marketDefs.map((m) => ({
    id: m.id,
    slug: m.slug,
    question: m.q,
    category: m.cat,
  })),
  wallets: walletDefs.map((w, i) => ({
    address: w.address,
    label: w.label,
    total_volume_usd: 800000 + i * 120000,
  })),
  contracts: [
    { address: CTF_ADDR, type: "polymarket_ctf_exchange", name: "CTF Exchange" },
    { address: USDC_ADDR, type: "erc20", name: "USD Coin" },
    { address: UMA_ADDR, type: "uma_optimistic_oracle_v2", name: "UMA Optimistic Oracle V2" },
  ],
  tags: [
    { name: "politics", market_count: 23 },
    { name: "crypto", market_count: 41 },
    { name: "economics", market_count: 34 },
    { name: "sports", market_count: 28 },
    { name: "science", market_count: 12 },
    { name: "pop-culture", market_count: 9 },
  ],
};

// ============================================================
// Write
// ============================================================
fs.mkdirSync(OUT_DIR, { recursive: true });
let count = 0;
for (const [name, data] of Object.entries(files)) {
  fs.writeFileSync(
    path.join(OUT_DIR, name),
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );
  count++;
}
console.log(`Wrote ${count} mock files to ${OUT_DIR}`);
