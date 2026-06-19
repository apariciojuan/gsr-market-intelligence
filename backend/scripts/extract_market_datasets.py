#!/usr/bin/env python3
"""Extract a static Polymarket research dataset (APIs called once → parquet on disk).

Usage (from backend/):
    python scripts/extract_market_datasets.py
    python scripts/extract_market_datasets.py --output-dir data/datasets/ontology --sample-size 120
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from eth_abi import decode as abi_decode

from app.services.blockchain.log_source import EtherscanLogSource, RawLog
from app.services.chainlink_client import (
    CHAINLINK_FEEDS,
    SELECTOR_LATEST_ROUND_DATA,
    ChainlinkClient,
    ChainlinkFeedDef,
    _LATEST_ROUND_DATA_TYPES,
    _decode_hex,
)
from app.services.polymarket_client import PolymarketClient
from app.services.uma.client import UmaClient

# keccak256("AnswerUpdated(int256,uint256,uint256)") — classic Chainlink aggregator
TOPIC_ANSWER_UPDATED = '0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f'
POLYGON_BLOCKS_PER_DAY = 43_200

DEFAULT_SNAPSHOT_CONFIG = {
    'market_sample_size': 120,
    'quota_uma': 25,
    'quota_crypto': 35,
    'quota_resolved': 25,
    'history_windows': ['1d', '1h'],
    'history_days': 90,
    'trade_limit': 100,
    'trade_max_pages': 20,
    'holders_limit': 50,
    'activity_limit': 50,
    'wallet_top_k': 5,
    'activity_max_pages': 5,
    'collect_external_signals': True,
    'request_delay_seconds': 0.35,
    'crypto_search_queries': ['bitcoin', 'ethereum', 'crypto', 'solana'],
    'min_resolution_links': 15,
    'min_chainlink_series_rows': 500,
    'min_markets_with_trades': 50,
    'min_trades_per_market': 5,
    'min_price_series_rows': 800,
    'min_markets_with_price_series': 40,
    'min_markets_with_chainlink_series': 15,
    'min_external_signals_rows': 30,
    'min_markets_with_wallet_activity': 8,
}

COHORT_ACTIVE_LIQUID = 'A_active_liquid'
COHORT_RESOLVED = 'B_resolved'
COHORT_DISPUTED = 'C_disputed'
COHORT_LOW_LIQUIDITY = 'D_low_liquidity'


def response_json(payload: Any) -> Any:
    """Parse httpx.Response from RequestClient; pass through dict/list."""
    if hasattr(payload, 'json'):
        return payload.json()
    return payload


def normalize_collection(
    payload: Any, keys: tuple[str, ...] = ('events', 'markets', 'results', 'data')
) -> list:
    payload = response_json(payload)
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return value
        for value in payload.values():
            if isinstance(value, list):
                return value
    return []


def extract_markets_from_search(payload: Any) -> list[dict]:
    """Flatten Gamma public-search into market dicts."""
    payload = response_json(payload)
    if isinstance(payload, list):
        return [m for m in payload if isinstance(m, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get('markets'), list):
            return [m for m in payload['markets'] if isinstance(m, dict)]
        if isinstance(payload.get('events'), list):
            markets: list[dict] = []
            for event in payload['events']:
                if isinstance(event, dict) and isinstance(event.get('markets'), list):
                    markets.extend(m for m in event['markets'] if isinstance(m, dict))
            return markets
    return []


def parse_token_ids(raw: Any) -> list[str]:
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return [raw] if raw else []
        raw = parsed
    if not isinstance(raw, list):
        return [str(raw)] if raw else []
    return [str(t) for t in raw if t]


def normalize_tags(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return [raw] if raw else []
    if not isinstance(raw, list):
        return []
    labels: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            labels.append(str(item.get('label') or item.get('slug') or item.get('id', '')))
        elif item:
            labels.append(str(item))
    return [label for label in labels if label]


def extract_market_rows(event: dict) -> list[dict]:
    rows: list[dict] = []
    event_tags = normalize_tags(event.get('tags'))
    for market in event.get('markets') or []:
        token_ids = parse_token_ids(market.get('clobTokenIds'))
        market_tags = normalize_tags(market.get('tags')) or event_tags
        rows.append(
            {
                'event_id': str(event.get('id', '')),
                'event_slug': event.get('slug'),
                'market_id': str(market.get('id', '')),
                'slug': market.get('slug'),
                'title': market.get('question') or market.get('title'),
                'condition_id': market.get('conditionId'),
                'clob_token_ids': token_ids,
                'tags_json': json.dumps(market_tags),
                'resolution_source': market.get('resolutionSource') or event.get('resolutionSource'),
                'description': market.get('description') or event.get('description'),
                'active': market.get('active'),
                'closed': market.get('closed'),
                'liquidity': _to_float(market.get('liquidity')),
                'volume': _to_float(market.get('volume')),
                'volume24hr': _to_float(market.get('volume24hr')),
                'best_bid': _to_float(market.get('bestBid')),
                'best_ask': _to_float(market.get('bestAsk')),
                'last_trade_price': _to_float(market.get('lastTradePrice')),
            }
        )
    return rows


def extract_market_row_standalone(market: dict) -> dict:
    """Single market dict from /markets or search (no parent event)."""
    token_ids = parse_token_ids(market.get('clobTokenIds'))
    market_tags = normalize_tags(market.get('tags'))
    return {
        'event_id': str(market.get('eventId') or market.get('event_id') or ''),
        'event_slug': market.get('eventSlug') or market.get('event_slug'),
        'market_id': str(market.get('id', '')),
        'slug': market.get('slug'),
        'title': market.get('question') or market.get('title'),
        'condition_id': market.get('conditionId'),
        'clob_token_ids': token_ids,
        'tags_json': json.dumps(market_tags),
        'resolution_source': market.get('resolutionSource'),
        'description': market.get('description'),
        'active': market.get('active'),
        'closed': market.get('closed'),
        'liquidity': _to_float(market.get('liquidity')),
        'volume': _to_float(market.get('volume')),
        'volume24hr': _to_float(market.get('volume24hr')),
        'best_bid': _to_float(market.get('bestBid')),
        'best_ask': _to_float(market.get('bestAsk')),
        'last_trade_price': _to_float(market.get('lastTradePrice')),
    }


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _valid_uma_market_id(market_id: Any) -> str | None:
    if market_id is None:
        return None
    try:
        mid_int = int(market_id)
    except (TypeError, ValueError):
        return None
    if mid_int <= 0:
        return None
    return str(mid_int)


def resolve_feed_for_text(text: str) -> str | None:
    haystack = (text or '').lower()
    for feed in CHAINLINK_FEEDS:
        for keyword in feed.keywords:
            if re.search(rf'\b{re.escape(keyword)}\b', haystack):
                return feed.asset_pair
    return None


def resolve_feed_for_row(row: dict | pd.Series) -> str | None:
    parts = [str(row.get('title') or ''), str(row.get('slug') or '')]
    tags_raw = row.get('tags_json')
    if tags_raw:
        try:
            parts.extend(json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw)
        except json.JSONDecodeError:
            pass
    return resolve_feed_for_text(' '.join(parts))


def book_metrics(book: dict | None) -> dict[str, float | None]:
    if not book:
        return {
            'spread': None,
            'mid_price': None,
            'bid_depth_top10': None,
            'ask_depth_top10': None,
        }
    bids = book.get('bids') or []
    asks = book.get('asks') or []
    best_bid = _to_float(bids[0].get('price')) if bids else None
    best_ask = _to_float(asks[0].get('price')) if asks else None
    spread = None
    mid = None
    if best_bid is not None and best_ask is not None:
        spread = best_ask - best_bid
        mid = (best_bid + best_ask) / 2
    bid_depth = sum(_to_float(b.get('size')) or 0 for b in bids[:10])
    ask_depth = sum(_to_float(a.get('size')) or 0 for a in asks[:10])
    return {
        'spread': spread,
        'mid_price': mid,
        'bid_depth_top10': bid_depth,
        'ask_depth_top10': ask_depth,
    }


def git_commit() -> str | None:
    try:
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=BACKEND_ROOT.parent,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(65536), b''):
            digest.update(chunk)
    return digest.hexdigest()


def dataset_name(output_dir: Path) -> str:
    return output_dir.name


async def fetch_events_batch(
    client: PolymarketClient, *, closed: bool | None, limit: int, **extra: Any
) -> list[dict]:
    params: dict[str, Any] = {'limit': min(limit, 100), 'order': 'volume24hr', **extra}
    if closed is True:
        params['closed'] = 'true'
    elif closed is False:
        params['closed'] = 'false'
    response = await client.get_events(params)
    return normalize_collection(response)


async def fetch_markets_batch(
    client: PolymarketClient, *, closed: bool | None, limit: int, **extra: Any
) -> list[dict]:
    params: dict[str, Any] = {'limit': min(limit, 100), 'order': 'volume_num', **extra}
    if closed is True:
        params['closed'] = 'true'
    elif closed is False:
        params['closed'] = 'false'
    response = await client.get_markets(params)
    return normalize_collection(response, ('markets', 'data', 'results'))


async def collect_market_candidates(
    polymarket: PolymarketClient, config: dict, delay: float
) -> list[dict]:
    """Gather market rows from stratified Gamma sources before quota selection."""
    rows: list[dict] = []
    seen: set[str] = set()

    def add_rows(new_rows: list[dict]) -> None:
        for row in new_rows:
            mid = row.get('market_id')
            if mid and mid not in seen:
                seen.add(mid)
                rows.append(row)

    active_events = await fetch_events_batch(
        polymarket, closed=False, limit=100, liquidity_min=500
    )
    await asyncio.sleep(delay)
    for event in active_events:
        add_rows(extract_market_rows(event))

    liquid_markets = await fetch_markets_batch(
        polymarket,
        closed=False,
        limit=100,
        liquidity_num_min=1000,
        volume_num_min=1000,
    )
    await asyncio.sleep(delay)
    for market in liquid_markets:
        add_rows([extract_market_row_standalone(market)])

    for query in config.get('crypto_search_queries', ['bitcoin', 'ethereum']):
        try:
            search_payload = await polymarket.get_markets_search(
                {'q': query, 'limit_per_type': 30}
            )
            await asyncio.sleep(delay)
            for market in extract_markets_from_search(search_payload):
                pseudo_event = {
                    'id': market.get('eventId'),
                    'slug': market.get('eventSlug'),
                    'markets': [market],
                }
                add_rows(extract_market_rows(pseudo_event))
        except Exception:  # noqa: BLE001
            continue

    closed_events = await fetch_events_batch(polymarket, closed=True, limit=80)
    await asyncio.sleep(delay)
    for event in closed_events:
        add_rows(extract_market_rows(event))

    closed_markets = await fetch_markets_batch(polymarket, closed=True, limit=80, order='volume_num')
    await asyncio.sleep(delay)
    for market in closed_markets:
        add_rows([extract_market_row_standalone(market)])

    if not rows:
        for closed_flag in (False, True):
            markets_payload = await polymarket.get_markets(
                {
                    'limit': 100,
                    'closed': 'true' if closed_flag else 'false',
                    'order': 'volume_num',
                }
            )
            await asyncio.sleep(delay)
            for market in normalize_collection(markets_payload, ('markets', 'data', 'results')):
                pseudo_event = {
                    'id': market.get('eventId'),
                    'slug': market.get('eventSlug'),
                    'markets': [market],
                }
                add_rows(extract_market_rows(pseudo_event))

    return rows


async def fetch_uma_market_rows(
    polymarket: PolymarketClient,
    uma_market_ids: list[str],
    delay: float,
) -> list[dict]:
    """Fetch Gamma metadata for markets referenced in recent UMA resolutions."""
    rows: list[dict] = []
    for mid in uma_market_ids:
        try:
            payload = response_json(await polymarket.get_market_by_id(market_id=mid))
            market = payload[0] if isinstance(payload, list) and payload else payload
            if isinstance(market, dict):
                rows.append(extract_market_row_standalone(market))
        except Exception:  # noqa: BLE001
            continue
        await asyncio.sleep(delay)
    return rows


def select_stratified_sample(
    candidates: list[dict],
    config: dict,
    uma_market_ids: set[str],
) -> pd.DataFrame:
    """Quota sampling: UMA-linked, crypto feeds, resolved, then liquid fill."""
    if not candidates:
        raise RuntimeError('No markets returned from Polymarket Gamma API')

    df = pd.DataFrame(candidates).drop_duplicates(subset=['market_id'])
    df['chainlink_asset_pair'] = df.apply(resolve_feed_for_row, axis=1)

    total = config['market_sample_size']
    quota_uma = config.get('quota_uma', 25)
    quota_crypto = config.get('quota_crypto', 35)
    quota_resolved = config.get('quota_resolved', 25)

    selected_ids: set[str] = set()
    chunks: list[pd.DataFrame] = []

    if uma_market_ids:
        uma_pool = df[df['market_id'].astype(str).isin(uma_market_ids)]
        if len(uma_pool):
            pick = uma_pool[~uma_pool['market_id'].astype(str).isin(selected_ids)].head(quota_uma)
            selected_ids.update(pick['market_id'].astype(str))
            chunks.append(pick)

    crypto = df[df['chainlink_asset_pair'].notna()].sort_values(
        ['volume', 'liquidity'], ascending=False, na_position='last'
    )
    if len(crypto):
        pick = crypto[~crypto['market_id'].astype(str).isin(selected_ids)].head(quota_crypto)
        selected_ids.update(pick['market_id'].astype(str))
        chunks.append(pick)

    resolved_mask = df['closed'] == True  # noqa: E712
    if resolved_mask.any():
        pick = (
            df[resolved_mask & ~df['market_id'].astype(str).isin(selected_ids)]
            .sort_values(['volume', 'liquidity'], ascending=False, na_position='last')
            .head(quota_resolved)
        )
        selected_ids.update(pick['market_id'].astype(str))
        chunks.append(pick)

    remaining = total - len(selected_ids)
    if remaining > 0:
        rest = (
            df[~df['market_id'].astype(str).isin(selected_ids)]
            .sort_values(['liquidity', 'volume'], ascending=False, na_position='last')
            .head(remaining)
        )
        selected_ids.update(rest['market_id'].astype(str))
        chunks.append(rest)

    if not chunks:
        return df.head(total)

    sample = pd.concat(chunks, ignore_index=True).drop_duplicates(subset=['market_id'])
    if len(sample) > total:
        sample = sample.head(total)
    return sample


def assign_cohorts(markets_df: pd.DataFrame) -> pd.DataFrame:
    df = markets_df.copy()
    df['cohort'] = COHORT_ACTIVE_LIQUID
    if 'liquidity' in df.columns:
        liq = df['liquidity'].fillna(0)
        threshold = liq.quantile(0.25) if len(liq) > 4 else 0
        df.loc[liq <= threshold, 'cohort'] = COHORT_LOW_LIQUIDITY
    if 'closed' in df.columns:
        df.loc[df['closed'] == True, 'cohort'] = COHORT_RESOLVED  # noqa: E712
    return df


def decode_answer_updated_log(log: RawLog, decimals: int) -> tuple[int, float] | None:
    """Decode Chainlink AnswerUpdated: topics carry current & roundId, data has updatedAt."""
    if len(log.topics) < 3:
        return None
    try:
        current_raw = int(log.topics[1], 16)
        if current_raw >= 2**255:
            current_raw -= 2**256
        price_usd = current_raw / 10**decimals
        ts = log.timestamp if log.timestamp else int(datetime.now(UTC).timestamp())
        return ts, price_usd
    except (ValueError, TypeError):
        return None


async def _fetch_chainlink_from_logs(
    source: EtherscanLogSource,
    feed: ChainlinkFeedDef,
    start_ts: int,
    end_ts: int,
    delay: float,
    chainlink: ChainlinkClient,
) -> pd.DataFrame:
    """Try AnswerUpdated logs (often empty on aggregator proxies)."""
    latest_block = await source.latest_block()
    span_seconds = max(end_ts - start_ts, 3600)
    from_block = max(0, latest_block - int(span_seconds / 2) - 2_000)
    await asyncio.sleep(delay)

    logs = await source.get_logs(
        feed.feed_address,
        topic0=TOPIC_ANSWER_UPDATED,
        from_block=from_block,
        to_block='latest',
        offset=1000,
    )
    await asyncio.sleep(delay)
    decimals = await chainlink.get_decimals(feed)

    rows: list[dict] = []
    for log in logs:
        decoded = decode_answer_updated_log(log, decimals)
        if decoded is None:
            continue
        ts, price_usd = decoded
        if start_ts <= ts <= end_ts + 3600:
            rows.append(
                {
                    'asset_pair': feed.asset_pair,
                    'timestamp_unix': ts,
                    'chainlink_price_usd': price_usd,
                }
            )

    if not rows:
        return pd.DataFrame(columns=['asset_pair', 'timestamp_unix', 'chainlink_price_usd'])
    return pd.DataFrame(rows).drop_duplicates(subset=['timestamp_unix', 'chainlink_price_usd'])


async def _fetch_chainlink_via_eth_call(
    source: EtherscanLogSource,
    feed: ChainlinkFeedDef,
    start_ts: int,
    end_ts: int,
    delay: float,
    chainlink: ChainlinkClient,
) -> pd.DataFrame:
    """Sample latestRoundData at hourly blocks (works when getLogs on proxy fails)."""
    decimals = await chainlink.get_decimals(feed)
    rows: list[dict] = []
    step = 3600
    for ts in range(start_ts, end_ts + 1, step):
        try:
            block = await source.block_by_timestamp(ts)
            await asyncio.sleep(delay)
            result = await source.eth_call(
                feed.feed_address,
                SELECTOR_LATEST_ROUND_DATA,
                tag=hex(block),
            )
        except Exception:  # noqa: BLE001
            continue
        if not result:
            continue
        try:
            _round_id, answer, _started, _updated_at, _answered = abi_decode(
                _LATEST_ROUND_DATA_TYPES, _decode_hex(result)
            )
            price_usd = answer / 10**decimals
            # Anchor to the sampled wall-clock hour so merge_asof matches price_series.
            rows.append(
                {
                    'asset_pair': feed.asset_pair,
                    'timestamp_unix': ts,
                    'chainlink_price_usd': float(price_usd),
                }
            )
        except Exception:  # noqa: BLE001
            continue

    if not rows:
        return pd.DataFrame(columns=['asset_pair', 'timestamp_unix', 'chainlink_price_usd'])
    return pd.DataFrame(rows).drop_duplicates(subset=['timestamp_unix', 'chainlink_price_usd'])


async def fetch_chainlink_feed_history(
    source: EtherscanLogSource,
    feed: ChainlinkFeedDef,
    start_ts: int,
    end_ts: int,
    delay: float,
    chainlink: ChainlinkClient,
) -> pd.DataFrame:
    """Chainlink history: logs first, then hourly eth_call at historical blocks."""
    frame = pd.DataFrame(columns=['asset_pair', 'timestamp_unix', 'chainlink_price_usd'])
    try:
        frame = await _fetch_chainlink_from_logs(
            source, feed, start_ts, end_ts, delay, chainlink
        )
    except Exception:  # noqa: BLE001
        frame = pd.DataFrame(columns=['asset_pair', 'timestamp_unix', 'chainlink_price_usd'])

    if len(frame) < 10:
        frame = await _fetch_chainlink_via_eth_call(
            source, feed, start_ts, end_ts, delay, chainlink
        )

    if frame.empty:
        return frame
    return frame.sort_values('timestamp_unix').reset_index(drop=True)


def build_chainlink_series_aligned(
    price_df: pd.DataFrame,
    markets_df: pd.DataFrame,
    feed_history: dict[str, pd.DataFrame],
    interval: str = '1h',
) -> pd.DataFrame:
    """merge_asof Chainlink answers onto each market price point."""
    if price_df.empty or 'market_id' not in price_df.columns:
        return pd.DataFrame(
            columns=[
                'market_id',
                'asset_pair',
                'timestamp_unix',
                'market_price_yes',
                'chainlink_price_usd',
                'alignment_method',
                'interval',
            ]
        )
    rows: list[dict] = []
    feed_markets = markets_df[markets_df['chainlink_asset_pair'].notna()]

    for _, market in feed_markets.iterrows():
        market_id = str(market['market_id'])
        pair = market['chainlink_asset_pair']
        hist = feed_history.get(str(pair))
        if hist is None or hist.empty:
            continue

        mkt_prices = price_df[
            (price_df['market_id'].astype(str) == market_id) & (price_df['interval'] == interval)
        ].copy()
        if mkt_prices.empty:
            continue

        mkt_prices = mkt_prices.dropna(subset=['timestamp_unix', 'price']).sort_values(
            'timestamp_unix'
        )
        cl = hist[['timestamp_unix', 'chainlink_price_usd']].sort_values('timestamp_unix')
        merged = pd.merge_asof(
            mkt_prices,
            cl,
            on='timestamp_unix',
            direction='backward',
        )
        for _, point in merged.iterrows():
            cl_price = point.get('chainlink_price_usd')
            if pd.isna(cl_price):
                continue
            rows.append(
                {
                    'market_id': market_id,
                    'asset_pair': pair,
                    'timestamp_unix': int(point['timestamp_unix']),
                    'market_price_yes': _to_float(point['price']),
                    'chainlink_price_usd': float(cl_price),
                    'alignment_method': 'asof_backward',
                    'interval': interval,
                }
            )

    return pd.DataFrame(rows)


def derive_chainlink_latest(chainlink_series_df: pd.DataFrame) -> pd.DataFrame:
    if chainlink_series_df.empty:
        return pd.DataFrame(
            columns=[
                'market_id',
                'asset_pair',
                'market_price_yes_last',
                'chainlink_price_usd',
                'chainlink_updated_at',
            ]
        )
    latest = (
        chainlink_series_df.sort_values('timestamp_unix')
        .groupby('market_id', as_index=False)
        .tail(1)
    )
    return pd.DataFrame(
        {
            'market_id': latest['market_id'],
            'asset_pair': latest['asset_pair'],
            'market_price_yes_last': latest['market_price_yes'],
            'chainlink_price_usd': latest['chainlink_price_usd'],
            'chainlink_updated_at': latest['timestamp_unix'],
        }
    )


def build_resolution_links(
    resolutions_rows: list[dict], sampled_ids: set[str]
) -> list[dict]:
    links: list[dict] = []
    for row in resolutions_rows:
        mid = _valid_uma_market_id(row.get('market_id'))
        if mid is None or mid not in sampled_ids:
            continue
        links.append(
            {
                'market_id': mid,
                'resolution_id': row.get('id'),
                'question_id': row.get('question_id'),
                'resolution_status': row.get('status'),
                'link_method': 'ancillary_market_id',
                'uma_oracle_url': row.get('uma_oracle_url'),
            }
        )
    return links


def uma_audit_metrics(resolutions_rows: list[dict], sampled_ids: set[str]) -> dict[str, int]:
    parsed = {_valid_uma_market_id(r.get('market_id')) for r in resolutions_rows}
    parsed.discard(None)
    overlap = len(parsed & sampled_ids)
    return {
        'uma_parsed_count': len(parsed),
        'uma_overlap_count': overlap,
    }


async def fetch_paginated_trades(
    polymarket: PolymarketClient,
    condition_id: str,
    *,
    limit: int,
    max_pages: int,
    delay: float,
) -> list[dict]:
    """Fetch all trades for a market up to max_pages."""
    all_trades: list[dict] = []
    offset = 0
    for _ in range(max_pages):
        payload = response_json(
            await polymarket.get_trades(
                {'market': condition_id, 'limit': limit, 'offset': offset}
            )
        )
        await asyncio.sleep(delay)
        batch = normalize_collection(payload, ('trades', 'data', 'results', 'history'))
        if not batch:
            break
        all_trades.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return all_trades


async def fetch_wallet_activity(
    polymarket: PolymarketClient,
    wallets: list[str],
    *,
    market_id: str,
    condition_id: str | None,
    limit: int,
    max_pages: int,
    delay: float,
) -> list[dict]:
    rows: list[dict] = []
    for wallet in wallets:
        if not wallet:
            continue
        offset = 0
        for _ in range(max_pages):
            params: dict[str, Any] = {
                'user': wallet,
                'limit': limit,
                'offset': offset,
                'sortBy': 'TIMESTAMP',
                'sortDirection': 'DESC',
            }
            if condition_id:
                params['market'] = condition_id
            try:
                payload = response_json(await polymarket.get_activity(params))
            except Exception:  # noqa: BLE001
                break
            await asyncio.sleep(delay)
            batch = normalize_collection(payload, ('activity', 'data', 'results', 'history'))
            if not batch:
                break
            for item in batch:
                rows.append(
                    {
                        'market_id': market_id,
                        'condition_id': condition_id,
                        'wallet': wallet,
                        'type': item.get('type'),
                        'side': item.get('side'),
                        'size': _to_float(item.get('size')),
                        'price': _to_float(item.get('price')),
                        'timestamp': item.get('timestamp') or item.get('createdAt'),
                        'transaction_hash': item.get('transactionHash'),
                    }
                )
            if len(batch) < limit:
                break
            offset += limit
    return rows


def build_contract_events(
    resolutions_rows: list[dict],
    links_df: pd.DataFrame,
    sampled_ids: set[str],
) -> pd.DataFrame:
    """Minimal UMA resolution lifecycle rows for ontology contract_events."""
    rows: list[dict] = []
    linked_markets = set()
    if len(links_df) and 'market_id' in links_df.columns:
        linked_markets = set(links_df['market_id'].astype(str))

    for resolution in resolutions_rows:
        mid = _valid_uma_market_id(resolution.get('market_id'))
        if not mid or mid not in sampled_ids:
            continue
        status = resolution.get('status') or 'pending'
        for field, event_name in (
            ('request_timestamp', 'uma_request'),
            ('proposal_timestamp', 'uma_propose'),
        ):
            ts = resolution.get(field)
            if not ts:
                continue
            rows.append(
                {
                    'market_id': mid,
                    'question_id': resolution.get('question_id'),
                    'event_name': event_name,
                    'contract_address': resolution.get('adapter_address'),
                    'timestamp': ts,
                    'transaction_hash': None,
                    'status': status,
                    'source': 'uma',
                }
            )
        rows.append(
            {
                'market_id': mid,
                'question_id': resolution.get('question_id'),
                'event_name': f'uma_{status}',
                'contract_address': resolution.get('adapter_address'),
                'timestamp': resolution.get('request_timestamp'),
                'transaction_hash': None,
                'status': status,
                'source': 'uma',
            }
        )

    for mid in linked_markets:
        if mid in sampled_ids:
            rows.append(
                {
                    'market_id': mid,
                    'question_id': None,
                    'event_name': 'uma_market_linked',
                    'contract_address': None,
                    'timestamp': None,
                    'transaction_hash': None,
                    'status': 'linked',
                    'source': 'uma',
                }
            )
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def compute_join_coverage(
    markets_df: pd.DataFrame,
    trades_df: pd.DataFrame,
    holders_df: pd.DataFrame,
    links_df: pd.DataFrame,
    chainlink_series_df: pd.DataFrame,
    price_df: pd.DataFrame,
    external_signals_df: pd.DataFrame | None = None,
    wallet_activity_df: pd.DataFrame | None = None,
) -> dict[str, float]:
    n = max(len(markets_df), 1)
    markets_with_trades = (
        trades_df['market_id'].nunique() if len(trades_df) and 'market_id' in trades_df else 0
    )
    markets_with_holders = (
        holders_df['market_id'].nunique() if len(holders_df) and 'market_id' in holders_df else 0
    )
    markets_with_feed = (
        markets_df['chainlink_asset_pair'].notna().sum()
        if 'chainlink_asset_pair' in markets_df
        else 0
    )
    markets_with_prices = (
        price_df['market_id'].nunique() if len(price_df) and 'market_id' in price_df else 0
    )
    markets_with_cl_series = (
        chainlink_series_df['market_id'].nunique()
        if len(chainlink_series_df) and 'market_id' in chainlink_series_df
        else 0
    )
    linked = len(links_df) if len(links_df) else 0
    markets_with_external = (
        external_signals_df['market_id'].nunique()
        if external_signals_df is not None
        and len(external_signals_df)
        and 'market_id' in external_signals_df.columns
        else 0
    )
    markets_with_activity = (
        wallet_activity_df['market_id'].nunique()
        if wallet_activity_df is not None
        and len(wallet_activity_df)
        and 'market_id' in wallet_activity_df.columns
        else 0
    )
    return {
        'markets_total': len(markets_df),
        'pct_with_trades': round(100 * markets_with_trades / n, 1),
        'pct_with_holders': round(100 * markets_with_holders / n, 1),
        'pct_with_chainlink_feed': round(100 * markets_with_feed / n, 1),
        'pct_with_price_series': round(100 * markets_with_prices / n, 1),
        'pct_with_chainlink_series': round(100 * markets_with_cl_series / n, 1),
        'pct_with_external_signals': round(100 * markets_with_external / n, 1),
        'pct_with_wallet_activity': round(100 * markets_with_activity / n, 1),
        'uma_links_in_sample': linked,
        'pct_uma_linked': round(100 * linked / n, 1),
        'chainlink_series_rows': len(chainlink_series_df),
        'external_signals_rows': len(external_signals_df) if external_signals_df is not None else 0,
        'wallet_activity_rows': len(wallet_activity_df) if wallet_activity_df is not None else 0,
    }


def evaluate_quality(
    links_df: pd.DataFrame,
    chainlink_series_df: pd.DataFrame,
    trades_df: pd.DataFrame,
    config: dict,
    *,
    price_df: pd.DataFrame | None = None,
    wallet_activity_df: pd.DataFrame | None = None,
    external_signals_df: pd.DataFrame | None = None,
    markets_total: int | None = None,
) -> tuple[bool, list[str]]:
    failures: list[str] = []
    min_links = config.get('min_resolution_links', 15)
    min_cl = config.get('min_chainlink_series_rows', 500)
    min_markets_trades = config.get('min_markets_with_trades', 50)
    min_trades = config.get('min_trades_per_market', 5)
    min_price_rows = config.get('min_price_series_rows', 0)
    min_markets_price = config.get('min_markets_with_price_series', 0)
    min_markets_chainlink = config.get('min_markets_with_chainlink_series', 0)
    min_external_rows = config.get('min_external_signals_rows', 0)
    min_markets_activity = config.get('min_markets_with_wallet_activity', 0)

    if len(links_df) < min_links:
        failures.append(f'market_resolution_links={len(links_df)} < {min_links}')
    if len(chainlink_series_df) < min_cl:
        failures.append(f'chainlink_series={len(chainlink_series_df)} < {min_cl}')
    if len(chainlink_series_df) and min_markets_chainlink > 0 and markets_total:
        cl_markets = int(chainlink_series_df['market_id'].nunique())
        if cl_markets < min_markets_chainlink:
            failures.append(f'markets_with_chainlink_series={cl_markets} < {min_markets_chainlink}')

    if price_df is not None:
        if len(price_df) < min_price_rows:
            failures.append(f'price_series={len(price_df)} < {min_price_rows}')
        if min_markets_price > 0 and markets_total:
            price_markets = int(price_df['market_id'].nunique()) if len(price_df) else 0
            if price_markets < min_markets_price:
                failures.append(f'markets_with_price_series={price_markets} < {min_markets_price}')

    if external_signals_df is not None and len(external_signals_df) < min_external_rows:
        failures.append(f'external_signals={len(external_signals_df)} < {min_external_rows}')

    if wallet_activity_df is not None and min_markets_activity > 0 and markets_total:
        activity_markets = int(wallet_activity_df['market_id'].nunique()) if len(wallet_activity_df) else 0
        if activity_markets < min_markets_activity:
            failures.append(f'markets_with_wallet_activity={activity_markets} < {min_markets_activity}')

    if len(trades_df) and 'market_id' in trades_df.columns:
        per_market = trades_df.groupby('market_id').size()
        rich = int((per_market >= min_trades).sum())
        if rich < min_markets_trades:
            failures.append(
                f'markets with >={min_trades} trades={rich} < {min_markets_trades}'
            )
    else:
        failures.append('trades table empty')

    return len(failures) == 0, failures


async def extract_dataset(output_dir: Path, config: dict) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    delay = config['request_delay_seconds']
    name = dataset_name(output_dir)
    polymarket = PolymarketClient()
    chainlink = ChainlinkClient()
    log_source = EtherscanLogSource()
    uma_errors: str | None = None
    extraction_warnings: list[str] = []
    resolutions_rows: list[dict] = []
    uma_market_ids: set[str] = set()

    try:
        uma = UmaClient()
        paginated = await uma.list_resolutions(limit=300, status='all')
        for item in paginated.items:
            dump = item.model_dump()
            resolutions_rows.append(dump)
            mid = _valid_uma_market_id(dump.get('market_id'))
            if mid:
                uma_market_ids.add(mid)
    except Exception as exc:  # noqa: BLE001
        uma_errors = str(exc)
        extraction_warnings.append(f'UMA extraction failed: {exc}')

    uma_id_list = list(uma_market_ids)[: config.get('quota_uma', 25)]
    candidates = await collect_market_candidates(polymarket, config, delay)
    uma_rows = await fetch_uma_market_rows(polymarket, uma_id_list, delay)
    seen = {str(c['market_id']) for c in candidates}
    for row in uma_rows:
        mid = str(row.get('market_id', ''))
        if mid and mid not in seen:
            candidates.append(row)
            seen.add(mid)

    markets_df = select_stratified_sample(candidates, config, uma_market_ids)
    markets_df = assign_cohorts(markets_df)
    if 'chainlink_asset_pair' not in markets_df.columns:
        markets_df['chainlink_asset_pair'] = markets_df.apply(resolve_feed_for_row, axis=1)

    sampled_ids = set(markets_df['market_id'].astype(str))
    uma_audit = uma_audit_metrics(resolutions_rows, sampled_ids)

    if resolutions_rows and not uma_errors:
        disputed_ids = {
            mid
            for r in resolutions_rows
            if (mid := _valid_uma_market_id(r.get('market_id')))
            and r.get('status') == 'disputed'
            and mid in sampled_ids
        }
        markets_df.loc[markets_df['market_id'].astype(str).isin(disputed_ids), 'cohort'] = (
            COHORT_DISPUTED
        )
        uma_by_market = {
            mid: r.get('status')
            for r in resolutions_rows
            if (mid := _valid_uma_market_id(r.get('market_id'))) and mid in sampled_ids
        }
        markets_df['uma_resolution_status'] = markets_df['market_id'].astype(str).map(
            uma_by_market
        )
    else:
        markets_df['uma_resolution_status'] = None

    resolution_links = build_resolution_links(resolutions_rows, sampled_ids)

    end_ts = int(datetime.now(UTC).timestamp())
    start_ts = int((datetime.now(UTC) - timedelta(days=config.get('history_days', 7))).timestamp())

    price_rows: list[dict] = []
    orderbook_rows: list[dict] = []
    trade_rows: list[dict] = []
    holder_rows: list[dict] = []
    wallet_activity_rows: list[dict] = []
    book_metrics_by_market: dict[str, dict[str, float | None]] = {}

    for _, market in markets_df.iterrows():
        market_id = str(market['market_id'])
        condition_id = market.get('condition_id')
        token_ids = market.get('clob_token_ids') or []
        if isinstance(token_ids, str):
            token_ids = parse_token_ids(token_ids)

        yes_token = token_ids[0] if token_ids else None

        for window in config['history_windows']:
            if not yes_token:
                break
            try:
                points: list[dict[str, Any]] = []
                try:
                    query = {
                        'market': yes_token,
                        'interval': window,
                        'fidelity': 1,
                        'startTs': start_ts,
                        'endTs': end_ts,
                    }
                    hist = response_json(await polymarket.get_prices_history_by_market(query))
                    await asyncio.sleep(delay)
                    points = (hist or {}).get('history') or []
                except Exception:  # noqa: BLE001
                    points = []

                if not points:
                    # Some tokens reject bounded windows; fallback to unbounded.
                    fallback = {'market': yes_token, 'interval': window, 'fidelity': 1}
                    hist = response_json(await polymarket.get_prices_history_by_market(fallback))
                    await asyncio.sleep(delay)
                    points = (hist or {}).get('history') or []

                for point in points:
                    price_rows.append(
                        {
                            'market_id': market_id,
                            'token_id': yes_token,
                            'outcome_side': 'yes',
                            'interval': window,
                            'timestamp_unix': point.get('t'),
                            'price': _to_float(point.get('p')),
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                extraction_warnings.append(
                    f'price history failed market={market_id} interval={window}: {exc}'
                )

        if yes_token:
            try:
                book = response_json(await polymarket.get_book({'token_id': yes_token}))
                await asyncio.sleep(delay)
                metrics = book_metrics(book)
                book_metrics_by_market[market_id] = metrics
                orderbook_rows.append(
                    {
                        'market_id': market_id,
                        'token_id': yes_token,
                        'bids_json': json.dumps((book or {}).get('bids') or []),
                        'asks_json': json.dumps((book or {}).get('asks') or []),
                        **metrics,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                extraction_warnings.append(f'book failed market={market_id}: {exc}')

        if condition_id:
            try:
                batch = await fetch_paginated_trades(
                    polymarket,
                    condition_id,
                    limit=config['trade_limit'],
                    max_pages=config.get('trade_max_pages', 20),
                    delay=delay,
                )
                for trade in batch:
                    trade_rows.append(
                        {
                            'market_id': market_id,
                            'condition_id': condition_id,
                            'wallet': trade.get('proxyWallet') or trade.get('user'),
                            'price': _to_float(trade.get('price')),
                            'size': _to_float(trade.get('size')),
                            'side': trade.get('side'),
                            'timestamp': trade.get('timestamp') or trade.get('createdAt'),
                            'transaction_hash': trade.get('transactionHash'),
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                extraction_warnings.append(f'trades failed market={market_id}: {exc}')

            try:
                holders_payload = response_json(
                    await polymarket.get_holders(
                        {'market': condition_id, 'limit': config['holders_limit']}
                    )
                )
                await asyncio.sleep(delay)
                for holder in normalize_collection(
                    holders_payload, ('holders', 'data', 'results')
                ):
                    holder_rows.append(
                        {
                            'market_id': market_id,
                            'condition_id': condition_id,
                            'wallet': holder.get('proxyWallet') or holder.get('user'),
                            'balance': _to_float(holder.get('balance') or holder.get('amount')),
                            'outcome_index': holder.get('outcomeIndex'),
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                extraction_warnings.append(f'holders failed market={market_id}: {exc}')

            market_holders = [
                h['wallet']
                for h in holder_rows
                if h.get('market_id') == market_id and h.get('wallet')
            ]
            top_wallets = list(dict.fromkeys(market_holders))[: config.get('wallet_top_k', 5)]
            if top_wallets:
                try:
                    activity = await fetch_wallet_activity(
                        polymarket,
                        top_wallets,
                        market_id=market_id,
                        condition_id=str(condition_id) if condition_id else None,
                        limit=config['activity_limit'],
                        max_pages=config.get('activity_max_pages', 5),
                        delay=delay,
                    )
                    wallet_activity_rows.extend(activity)
                except Exception as exc:  # noqa: BLE001
                    extraction_warnings.append(
                        f'wallet_activity failed market={market_id}: {exc}'
                    )

    for mid, metrics in book_metrics_by_market.items():
        idx = markets_df.index[markets_df['market_id'].astype(str) == str(mid)]
        if len(idx):
            for col, val in metrics.items():
                markets_df.loc[idx, col] = val

    price_df = pd.DataFrame(price_rows)
    trades_df = pd.DataFrame(trade_rows)
    holders_df = pd.DataFrame(holder_rows)
    links_df = pd.DataFrame(resolution_links)

    feed_history: dict[str, pd.DataFrame] = {}
    pairs_needed = {
        str(pair)
        for pair in markets_df['chainlink_asset_pair'].dropna().unique()
        if pair
    }
    for pair in pairs_needed:
        feed = next((f for f in CHAINLINK_FEEDS if f.asset_pair == pair), None)
        if feed is None:
            continue
        try:
            feed_history[pair] = await fetch_chainlink_feed_history(
                log_source, feed, start_ts, end_ts, delay, chainlink
            )
        except Exception as exc:  # noqa: BLE001
            extraction_warnings.append(f'chainlink history failed {pair}: {exc}')
            feed_history[pair] = pd.DataFrame()

    interval = config['history_windows'][0] if config['history_windows'] else '1h'
    cl_start, cl_end = start_ts, end_ts
    if len(price_df) and 'timestamp_unix' in price_df.columns:
        cl_start = int(price_df['timestamp_unix'].min())
        cl_end = int(price_df['timestamp_unix'].max())

    chainlink_series_df = build_chainlink_series_aligned(
        price_df, markets_df, feed_history, interval=interval
    )

    if len(chainlink_series_df) < config.get('min_chainlink_series_rows', 500):
        feed_history = {}
        for pair in pairs_needed:
            feed = next((f for f in CHAINLINK_FEEDS if f.asset_pair == pair), None)
            if feed is None:
                continue
            try:
                feed_history[pair] = await fetch_chainlink_feed_history(
                    log_source, feed, cl_start, cl_end, delay, chainlink
                )
            except Exception as exc:  # noqa: BLE001
                extraction_warnings.append(f'chainlink retry failed {pair}: {exc}')
                feed_history[pair] = pd.DataFrame()
        chainlink_series_df = build_chainlink_series_aligned(
            price_df, markets_df, feed_history, interval=interval
        )
    chainlink_latest_df = derive_chainlink_latest(chainlink_series_df)

    contract_events_df = build_contract_events(resolutions_rows, links_df, sampled_ids)

    external_signals_rows: list[dict] = []
    if config.get('collect_external_signals', True):
        try:
            from app.services.external_signals.collector import collect_signals_for_markets

            market_dicts = markets_df.to_dict(orient='records')
            for row in market_dicts:
                row['question'] = row.get('title') or row.get('question')
            external_signals_rows = await collect_signals_for_markets(market_dicts)
        except Exception as exc:  # noqa: BLE001
            extraction_warnings.append(f'external_signals collection failed: {exc}')

    if external_signals_rows:
        external_signals_df = pd.DataFrame(external_signals_rows)
        parquet_cols = [
            'market_id',
            'source',
            'text',
            'timestamp',
            'url',
            '_match_score',
            '_matched_by',
        ]
        external_signals_df = external_signals_df.reindex(columns=parquet_cols)
    else:
        external_signals_df = pd.DataFrame(
            columns=['market_id', 'source', 'text', 'timestamp', 'url', '_match_score', '_matched_by']
        )
    wallet_activity_df = (
        pd.DataFrame(wallet_activity_rows) if wallet_activity_rows else pd.DataFrame()
    )

    tables = {
        'markets': markets_df,
        'resolutions': pd.DataFrame(resolutions_rows) if resolutions_rows else pd.DataFrame(),
        'market_resolution_links': links_df,
        'price_series': price_df,
        'orderbook_snapshots': pd.DataFrame(orderbook_rows),
        'trades': trades_df,
        'holders': holders_df,
        'wallet_activity': wallet_activity_df,
        'chainlink_latest': chainlink_latest_df,
        'chainlink_series': chainlink_series_df,
        'contract_events': contract_events_df,
        'external_signals': external_signals_df,
    }

    file_hashes: dict[str, str] = {}
    for table_name, frame in tables.items():
        path = output_dir / f'{table_name}.parquet'
        frame.to_parquet(path, index=False)
        file_hashes[table_name] = file_sha256(path)

    cohort_counts = (
        markets_df['cohort'].value_counts().to_dict() if 'cohort' in markets_df.columns else {}
    )
    join_coverage = compute_join_coverage(
        markets_df,
        trades_df,
        holders_df,
        links_df,
        chainlink_series_df,
        price_df,
        external_signals_df,
        wallet_activity_df,
    )
    quality_passed, quality_failures = evaluate_quality(
        links_df,
        chainlink_series_df,
        trades_df,
        config,
        price_df=price_df,
        wallet_activity_df=wallet_activity_df,
        external_signals_df=external_signals_df,
        markets_total=len(markets_df),
    )

    manifest = {
        'dataset': name,
        'created_at_utc': datetime.now(UTC).isoformat(),
        'snapshot_config': config,
        'git_commit': git_commit(),
        'row_counts': {table_name: len(frame) for table_name, frame in tables.items()},
        'cohort_counts': cohort_counts,
        'join_coverage': join_coverage,
        'uma_audit': uma_audit,
        'quality_passed': quality_passed,
        'quality_failures': quality_failures,
        'extraction_warnings': extraction_warnings[:50],
        'file_sha256': file_hashes,
        'uma_extraction_error': uma_errors,
        'notes': (
            'Static snapshot for ontology notebook. Re-run this script to refresh. '
            'chainlink_series is time-aligned to price_series via merge_asof backward. '
            'market_resolution_links join Gamma sample to UMA via ancillary market_id.'
        ),
    }
    (output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description='Extract Polymarket static research dataset')
    parser.add_argument(
        '--output-dir',
        type=Path,
        default=BACKEND_ROOT / 'data' / 'datasets' / 'ontology',
    )
    parser.add_argument(
        '--sample-size', type=int, default=DEFAULT_SNAPSHOT_CONFIG['market_sample_size']
    )
    parser.add_argument(
        '--quota-crypto', type=int, default=DEFAULT_SNAPSHOT_CONFIG['quota_crypto']
    )
    parser.add_argument(
        '--quota-resolved', type=int, default=DEFAULT_SNAPSHOT_CONFIG['quota_resolved']
    )
    parser.add_argument(
        '--quota-uma', type=int, default=DEFAULT_SNAPSHOT_CONFIG['quota_uma']
    )
    parser.add_argument(
        '--skip-quality-gate',
        action='store_true',
        help='Write manifest even when quality thresholds fail (exit 0).',
    )
    parser.add_argument('--history-days', type=int, default=None)
    parser.add_argument(
        '--history-windows',
        type=str,
        default=None,
        help='Comma-separated CLOB intervals, e.g. 1d,1h',
    )
    parser.add_argument('--trade-max-pages', type=int, default=None)
    parser.add_argument(
        '--no-external-signals',
        action='store_true',
        help='Skip RSS/resolution_source external signal collection.',
    )
    args = parser.parse_args()

    config = {
        **DEFAULT_SNAPSHOT_CONFIG,
        'market_sample_size': args.sample_size,
        'quota_crypto': args.quota_crypto,
        'quota_resolved': args.quota_resolved,
        'quota_uma': args.quota_uma,
    }
    if args.history_days is not None:
        config['history_days'] = args.history_days
    if args.history_windows:
        config['history_windows'] = [w.strip() for w in args.history_windows.split(',') if w.strip()]
    if args.trade_max_pages is not None:
        config['trade_max_pages'] = args.trade_max_pages
    if args.no_external_signals:
        config['collect_external_signals'] = False
    started = time.perf_counter()
    manifest = asyncio.run(extract_dataset(args.output_dir, config))
    elapsed = time.perf_counter() - started
    manifest['extraction_seconds'] = round(elapsed, 2)
    (args.output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2))

    if not manifest.get('quality_passed') and not args.skip_quality_gate:
        print('QUALITY GATE FAILED:', manifest.get('quality_failures'), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
