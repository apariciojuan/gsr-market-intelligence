#!/usr/bin/env python3
"""Backfill chainlink_series + chainlink_latest for an existing ontology snapshot."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.blockchain.log_source import EtherscanLogSource
from app.services.chainlink_client import CHAINLINK_FEEDS, ChainlinkClient
from scripts.extract_market_datasets import (  # noqa: E402
    DEFAULT_SNAPSHOT_CONFIG,
    build_chainlink_series_aligned,
    derive_chainlink_latest,
    evaluate_quality,
    fetch_chainlink_feed_history,
    file_sha256,
)

DEFAULT_DIR = BACKEND_ROOT / 'data' / 'datasets' / 'ontology'


async def backfill(output_dir: Path) -> dict:
    manifest = json.loads((output_dir / 'manifest.json').read_text(encoding='utf-8'))
    config = {**DEFAULT_SNAPSHOT_CONFIG, **manifest.get('snapshot_config', {})}
    delay = config['request_delay_seconds']

    markets_df = pd.read_parquet(output_dir / 'markets.parquet')
    price_df = pd.read_parquet(output_dir / 'price_series.parquet')
    links_df = pd.read_parquet(output_dir / 'market_resolution_links.parquet')
    trades_df = pd.read_parquet(output_dir / 'trades.parquet')
    wallet_activity_path = output_dir / 'wallet_activity.parquet'
    external_signals_path = output_dir / 'external_signals.parquet'
    wallet_activity_df = (
        pd.read_parquet(wallet_activity_path) if wallet_activity_path.exists() else pd.DataFrame()
    )
    external_signals_df = (
        pd.read_parquet(external_signals_path) if external_signals_path.exists() else pd.DataFrame()
    )

    if price_df.empty:
        raise RuntimeError('price_series is empty; run full extraction first')

    start_ts = int(price_df['timestamp_unix'].min())
    end_ts = int(price_df['timestamp_unix'].max())

    source = EtherscanLogSource()
    chainlink = ChainlinkClient()
    feed_history: dict[str, pd.DataFrame] = {}
    warnings: list[str] = []

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
            frame = await fetch_chainlink_feed_history(
                source, feed, start_ts, end_ts, delay, chainlink
            )
            feed_history[pair] = frame
            if len(frame) < 24:
                warnings.append(f'{pair}: only {len(frame)} chainlink samples')
        except Exception as exc:  # noqa: BLE001
            warnings.append(f'{pair}: {exc}')
            feed_history[pair] = pd.DataFrame()

    interval = config['history_windows'][0] if config.get('history_windows') else '1h'
    chainlink_series_df = build_chainlink_series_aligned(
        price_df, markets_df, feed_history, interval=interval
    )
    chainlink_latest_df = derive_chainlink_latest(chainlink_series_df)

    chainlink_series_df.to_parquet(output_dir / 'chainlink_series.parquet', index=False)
    chainlink_latest_df.to_parquet(output_dir / 'chainlink_latest.parquet', index=False)

    manifest['row_counts']['chainlink_series'] = len(chainlink_series_df)
    manifest['row_counts']['chainlink_latest'] = len(chainlink_latest_df)
    manifest['join_coverage']['chainlink_series_rows'] = len(chainlink_series_df)
    manifest['join_coverage']['pct_with_chainlink_series'] = round(
        100
        * (
            chainlink_series_df['market_id'].nunique()
            if len(chainlink_series_df)
            else 0
        )
        / max(len(markets_df), 1),
        1,
    )
    manifest['extraction_warnings'] = (manifest.get('extraction_warnings') or []) + warnings
    manifest['file_sha256']['chainlink_series'] = file_sha256(output_dir / 'chainlink_series.parquet')
    manifest['file_sha256']['chainlink_latest'] = file_sha256(
        output_dir / 'chainlink_latest.parquet'
    )

    passed, failures = evaluate_quality(
        links_df,
        chainlink_series_df,
        trades_df,
        config,
        price_df=price_df,
        wallet_activity_df=wallet_activity_df,
        external_signals_df=external_signals_df,
        markets_total=len(markets_df),
    )
    manifest['quality_passed'] = passed
    manifest['quality_failures'] = failures

    (output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    manifest = asyncio.run(backfill(out))
    print(json.dumps(manifest, indent=2))
    if not manifest.get('quality_passed'):
        sys.exit(1)


if __name__ == '__main__':
    main()
