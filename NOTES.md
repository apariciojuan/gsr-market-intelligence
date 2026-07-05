# Notes

## App Summary

This app watches Polymarket markets and compares some of them with trusted
external data from Chainlink.

Simple idea:

```text
Are Polymarket prices moving in a way that makes sense compared to real-world
price feeds like BTC/USD or ETH/USD?
```

## Worker Schedule

The `worker` container runs automatically:

```text
Every 1 minute:  Chainlink prices
Every 5 minutes: Polymarket price history
Every 10 minutes: divergence checks
Every 30 minutes: active Polymarket markets
Every 1 hour:    ecosystem metrics
```

Manual `just worker ...` commands are only for testing or forcing a job to run now.

## Data

Downloaded data:

```text
Chainlink prices: BTC/USD, ETH/USD, SOL/USD, MATIC/USD, USDC/USD
Polymarket markets: questions, outcomes, volume, liquidity, status
Polymarket price history: YES/NO prices over time
```

Calculated data:

```text
ecosystem_metrics: dashboard snapshots
divergences: possible mismatches between markets and external prices
```

Main tables:

```text
markets
chainlink_feeds
chainlink_prices
price_history
ecosystem_metrics
divergences
sync_state
```

## Market Matching

The app matches markets to Chainlink feeds with simple keywords:

```text
BTC/USD    -> btc, bitcoin
ETH/USD    -> eth, ethereum, ether
MATIC/USD  -> matic, polygon
SOL/USD    -> sol, solana
USDC/USD   -> usdc
```

It searches the market question, slug, and tags. This is useful for a prototype,
but it is not perfect.

## Pipeline

```text
Seed Chainlink feeds
  -> download Chainlink prices
  -> download Polymarket markets
  -> download Polymarket market prices
  -> calculate metrics and divergences
  -> show data in the API/frontend
```

## Useful Commands

Install `just`: https://github.com/casey/just

```bash
brew install just
```

```bash
just              # list all recipes
just up           # start stack
just ps           # check containers
just health       # check backend health
just seed         # seed Chainlink feeds
just db check     # check DB status and row counts
just db feeds     # show Chainlink feed registry
just db prices    # show recent Chainlink prices
just worker logs  # follow worker logs
just worker all   # run all worker jobs once
just smoke        # quick API sanity check
just down         # stop stack
just reset        # stop stack and delete local DB volume
```

## Fresh Local Test Sequence

```bash
just up
just ps
just health
just seed
just db check
just worker all
just db check
just smoke
```

Open:

```text
Frontend: http://localhost:3000
API docs: http://localhost:8000/docs
```
