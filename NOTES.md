# Notes

## What This App Does

This app watches Polymarket markets and compares some of them with trusted
external price data.

In simple terms:

```text
What is happening in Polymarket markets, and does it match trusted external data?
```

For example, if there is a Polymarket market about Bitcoin, the app can compare
that market with Chainlink BTC/USD data.

## What Runs Automatically

The `worker` container runs background jobs on a schedule:

```text
Every 1 minute:  get latest Chainlink prices
Every 5 minutes: get Polymarket market price history
Every 10 minutes: check for divergences/signals
Every 30 minutes: download active Polymarket markets
Every 1 hour:    calculate ecosystem dashboard metrics
```

So normally you do not need to trigger workers manually. Manual worker commands
are useful while testing because they run one pipeline immediately.

## What Data It Downloads

The app downloads:

```text
1. Chainlink prices
```

Trusted external prices like:

```text
BTC/USD
ETH/USD
SOL/USD
MATIC/USD
USDC/USD
```

```text
2. Polymarket markets
```

Market questions, outcomes, slugs, volume, liquidity, and whether the market is
active or closed.

```text
3. Polymarket price history
```

How the YES/NO price changed over time.

Example:

```text
YES was 0.42 at 10:00
YES was 0.48 at 11:00
YES was 0.61 at 12:00
```

## What It Calculates

The app calculates:

```text
Ecosystem metrics
```

Dashboard-style summary numbers, such as active markets, volume, and category
breakdowns.

```text
Divergences
```

Possible mismatches between Polymarket behavior and external price data.

Example:

```text
Chainlink says ETH moved sharply,
but a related Polymarket market did not move.
```

That could become a signal.

## How It Matches A Market To Bitcoin Or Ethereum

The app uses simple keyword matching.

It looks at:

```text
market question
market slug
market tags, if available
```

Then it searches for crypto keywords.

Examples:

```text
BTC/USD    -> btc, bitcoin
ETH/USD    -> eth, ethereum, ether
MATIC/USD  -> matic, polygon
SOL/USD    -> sol, solana
USDC/USD   -> usdc
```

So a market like:

```text
Will Bitcoin hit $100,000 in 2026?
```

would be treated as Bitcoin-related and matched with Chainlink BTC/USD.

This is useful for a prototype, but it is not perfect. It can miss markets that
refer to Bitcoin indirectly, and it can match markets that mention Bitcoin but
are not really about Bitcoin price.

## Main Database Tables

```text
markets
```

Polymarket markets.

```text
chainlink_feeds
```

The external price feeds the app watches.

```text
chainlink_prices
```

Historical Chainlink price readings.

```text
price_history
```

Historical Polymarket YES/NO prices.

```text
ecosystem_metrics
```

Dashboard metric snapshots.

```text
divergences
```

Possible market-vs-external-data signals.

```text
sync_state
```

Worker progress and status.

## Simple Pipeline

```text
Seed Chainlink feeds
        ↓
Download Chainlink prices
        ↓
Download Polymarket markets
        ↓
Download Polymarket market prices
        ↓
Compare market prices with external data
        ↓
Show dashboards and signals
```

## Just Command Flow

Start the stack:

```bash
just up
```

Check containers:

```bash
just ps
```

Check backend health:

```bash
just health
```

Seed Chainlink feeds once per fresh database:

```bash
just seed
```

Check database state:

```bash
just db check
```

Check seeded feeds:

```bash
just db feeds
```

Check recent Chainlink prices:

```bash
just db prices
```

Watch the worker:

```bash
just worker logs
```

Manually trigger market ingestion:

```bash
just worker markets
```

Check that markets were stored:

```bash
just db check
```

Manually trigger Polymarket price collection:

```bash
just worker prices
```

Manually trigger ecosystem metrics:

```bash
just worker ecosystem
```

Manually trigger divergence detection:

```bash
just worker divergences
```

Run backend smoke tests:

```bash
just smoke
```

Open the frontend:

```text
http://localhost:3000
```

Open the backend docs:

```text
http://localhost:8000/docs
```

Stop the stack:

```bash
just down
```

Stop the stack and delete the local database volume:

```bash
just reset
```

## Recommended Test Sequence

For a fresh local run:

```bash
just up
just ps
just health
just seed
just db check
just db feeds
just worker signals
just db prices
just worker markets
just db check
just worker prices
just worker ecosystem
just worker divergences
just smoke
```

Then open:

```text
http://localhost:3000
http://localhost:8000/docs
```
