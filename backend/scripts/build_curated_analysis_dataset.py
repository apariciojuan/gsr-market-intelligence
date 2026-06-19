#!/usr/bin/env python3
"""Build a curated analysis dataset from ontology parquet files."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = BACKEND_ROOT / 'data' / 'datasets' / 'ontology'
DEFAULT_OUTPUT = BACKEND_ROOT / 'data' / 'datasets' / 'curated'


def _read_parquet(path: Path, required: bool = False) -> pd.DataFrame:
    if not path.exists():
        if required:
            raise FileNotFoundError(path)
        return pd.DataFrame()
    return pd.read_parquet(path)


def _hour_bucket_from_unix(series: pd.Series) -> pd.Series:
    ts = pd.to_datetime(series, unit='s', utc=True, errors='coerce')
    return ts.dt.floor('h')


def _hour_bucket_from_iso(series: pd.Series) -> pd.Series:
    ts = pd.to_datetime(series, utc=True, errors='coerce')
    return ts.dt.floor('h')


def _hour_bucket_auto(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors='coerce')
    # Unix timestamps in seconds should be around >= 1e9.
    if numeric.notna().mean() > 0.8 and float(numeric.dropna().median()) > 1e9:
        return _hour_bucket_from_unix(numeric)
    return _hour_bucket_from_iso(series)


def _to_unix_seconds(dt_series: pd.Series) -> pd.Series:
    values = dt_series.astype('int64')
    max_abs = int(values.abs().max()) if len(values) else 0
    if max_abs > 10**17:  # ns
        return values // 10**9
    if max_abs > 10**14:  # us
        return values // 10**6
    if max_abs > 10**11:  # ms
        return values // 10**3
    return values


def build_curated(input_dir: Path, output_dir: Path) -> dict:
    markets = _read_parquet(input_dir / 'markets.parquet', required=True)
    prices = _read_parquet(input_dir / 'price_series.parquet', required=True)
    chainlink = _read_parquet(input_dir / 'chainlink_series.parquet')
    trades = _read_parquet(input_dir / 'trades.parquet')
    external = _read_parquet(input_dir / 'external_signals.parquet')
    orderbook = _read_parquet(input_dir / 'orderbook_snapshots.parquet')
    links = _read_parquet(input_dir / 'market_resolution_links.parquet')

    if prices.empty:
        raise RuntimeError('price_series.parquet is empty; extract data first')

    output_dir.mkdir(parents=True, exist_ok=True)

    preferred_interval = '1h' if (prices['interval'] == '1h').any() else prices['interval'].iloc[0]
    px = prices[prices['interval'] == preferred_interval].copy()
    px['market_id'] = px['market_id'].astype(str)
    px = px.sort_values(['market_id', 'timestamp_unix'])
    px['timestamp_hour'] = _hour_bucket_from_unix(px['timestamp_unix'])
    px['price_return_1'] = px.groupby('market_id')['price'].pct_change()
    px['price_return_24'] = px.groupby('market_id')['price'].pct_change(24)
    px['price_volatility_24h'] = (
        px.groupby('market_id')['price_return_1']
        .rolling(24, min_periods=6)
        .std()
        .reset_index(level=0, drop=True)
    )

    market_cols = [
        'market_id',
        'slug',
        'title',
        'cohort',
        'liquidity',
        'volume',
        'chainlink_asset_pair',
        'uma_resolution_status',
    ]
    for col in market_cols:
        if col not in markets.columns:
            markets[col] = None
    market_meta = markets[market_cols].copy()
    market_meta['market_id'] = market_meta['market_id'].astype(str)

    frame = px.merge(market_meta, on='market_id', how='left')

    if not chainlink.empty:
        cl = chainlink.copy()
        cl['market_id'] = cl['market_id'].astype(str)
        cl['timestamp_hour'] = _hour_bucket_from_unix(cl['timestamp_unix'])
        cl = (
            cl.groupby(['market_id', 'timestamp_hour'], as_index=False)[['chainlink_price_usd']]
            .mean()
            .rename(columns={'chainlink_price_usd': 'chainlink_price_usd_hour'})
        )
        frame = frame.merge(cl, on=['market_id', 'timestamp_hour'], how='left')
        frame['market_chainlink_gap'] = frame['price'] - frame['chainlink_price_usd_hour']
    else:
        frame['chainlink_price_usd_hour'] = pd.NA
        frame['market_chainlink_gap'] = pd.NA

    if not trades.empty:
        tr = trades.copy()
        tr['market_id'] = tr['market_id'].astype(str)
        tr['timestamp_hour'] = _hour_bucket_auto(tr['timestamp'])
        tr['trade_size'] = pd.to_numeric(tr['size'], errors='coerce')
        trade_agg = tr.groupby(['market_id', 'timestamp_hour'], as_index=False).agg(
            trades_count=('market_id', 'size'),
            trades_size_sum=('trade_size', 'sum'),
            trades_price_mean=('price', 'mean'),
        )
        frame = frame.merge(trade_agg, on=['market_id', 'timestamp_hour'], how='left')
    else:
        frame['trades_count'] = 0
        frame['trades_size_sum'] = 0.0
        frame['trades_price_mean'] = pd.NA

    if not external.empty:
        ex = external.copy()
        ex['market_id'] = ex['market_id'].astype(str)
        ex['timestamp_hour'] = _hour_bucket_from_iso(ex['timestamp'])
        ex['_match_score'] = pd.to_numeric(ex.get('_match_score'), errors='coerce')
        signal_agg = ex.groupby(['market_id', 'timestamp_hour'], as_index=False).agg(
            signals_count=('market_id', 'size'),
            signals_score_mean=('_match_score', 'mean'),
        )
        signal_src = ex.pivot_table(
            index=['market_id', 'timestamp_hour'],
            columns='source',
            values='url',
            aggfunc='count',
            fill_value=0,
        ).reset_index()
        signal_src.columns = [str(c) if isinstance(c, str) else c for c in signal_src.columns]
        frame = frame.merge(signal_agg, on=['market_id', 'timestamp_hour'], how='left')
        frame = frame.merge(signal_src, on=['market_id', 'timestamp_hour'], how='left')

        # Rolling signal windows prevent zero-coverage when exact hour doesn't match.
        frame['signals_last_6h'] = 0.0
        frame['signals_last_24h'] = 0.0
        frame['signals_score_sum_last_24h'] = 0.0
        signal_hourly = (
            ex.groupby(['market_id', 'timestamp_hour'], as_index=False)
            .agg(
                signals_count_hour=('market_id', 'size'),
                signals_score_sum_hour=('_match_score', 'sum'),
            )
            .sort_values(['market_id', 'timestamp_hour'])
        )
        for market_id, market_rows in signal_hourly.groupby('market_id'):
            market_rows = market_rows.sort_values('timestamp_hour').copy()
            market_rows['timestamp_hour'] = pd.to_datetime(
                market_rows['timestamp_hour'], utc=True, errors='coerce'
            )
            market_rows = market_rows.dropna(subset=['timestamp_hour'])
            if market_rows.empty:
                continue
            market_rows['key_ts'] = _to_unix_seconds(market_rows['timestamp_hour'])
            market_rows['cum_count'] = market_rows['signals_count_hour'].cumsum()
            market_rows['cum_score'] = market_rows['signals_score_sum_hour'].cumsum()

            frame_idx = frame.index[frame['market_id'] == market_id]
            if len(frame_idx) == 0:
                continue
            market_frame = frame.loc[frame_idx, ['timestamp_hour']].copy().sort_values('timestamp_hour')
            market_frame['timestamp_hour'] = pd.to_datetime(
                market_frame['timestamp_hour'], utc=True, errors='coerce'
            )
            market_frame = market_frame.dropna(subset=['timestamp_hour'])
            if market_frame.empty:
                continue
            market_frame['key_ts'] = _to_unix_seconds(market_frame['timestamp_hour'])

            end = pd.merge_asof(
                market_frame,
                market_rows[['key_ts', 'cum_count', 'cum_score']],
                on='key_ts',
                direction='backward',
            ).fillna({'cum_count': 0.0, 'cum_score': 0.0})

            start_6 = market_frame.copy()
            start_6['timestamp_hour'] = start_6['timestamp_hour'] - pd.Timedelta(hours=6)
            start_6['key_ts'] = _to_unix_seconds(start_6['timestamp_hour'])
            start_6 = pd.merge_asof(
                start_6,
                market_rows[['key_ts', 'cum_count']],
                on='key_ts',
                direction='backward',
            ).fillna({'cum_count': 0.0})
            signals_6h = (end['cum_count'] - start_6['cum_count']).clip(lower=0.0).to_numpy()

            start_24 = market_frame.copy()
            start_24['timestamp_hour'] = start_24['timestamp_hour'] - pd.Timedelta(hours=24)
            start_24['key_ts'] = _to_unix_seconds(start_24['timestamp_hour'])
            start_24 = pd.merge_asof(
                start_24,
                market_rows[['key_ts', 'cum_count', 'cum_score']],
                on='key_ts',
                direction='backward',
            ).fillna({'cum_count': 0.0, 'cum_score': 0.0})
            signals_24h = (end['cum_count'] - start_24['cum_count']).clip(lower=0.0).to_numpy()
            score_24h = (end['cum_score'] - start_24['cum_score']).clip(lower=0.0).to_numpy()

            ordered_idx = frame.loc[frame_idx].sort_values('timestamp_hour').index
            frame.loc[ordered_idx, 'signals_last_6h'] = signals_6h
            frame.loc[ordered_idx, 'signals_last_24h'] = signals_24h
            frame.loc[ordered_idx, 'signals_score_sum_last_24h'] = score_24h
    else:
        frame['signals_count'] = 0
        frame['signals_score_mean'] = pd.NA
        frame['signals_last_6h'] = 0.0
        frame['signals_last_24h'] = 0.0
        frame['signals_score_sum_last_24h'] = 0.0

    if not orderbook.empty:
        ob = orderbook.copy()
        ob['market_id'] = ob['market_id'].astype(str)
        ob = ob[['market_id', 'spread', 'mid_price', 'bid_depth_top10', 'ask_depth_top10']].drop_duplicates(
            subset=['market_id']
        )
        frame = frame.merge(ob, on='market_id', how='left')

    linked_market_ids: set[str] = set()
    if not links.empty and 'market_id' in links.columns:
        linked_market_ids = set(links['market_id'].astype(str).tolist())
    frame['is_uma_linked'] = frame['market_id'].astype(str).isin(linked_market_ids)

    frame = frame.sort_values(['market_id', 'timestamp_unix']).reset_index(drop=True)
    frame.to_parquet(output_dir / 'market_hourly_features.parquet', index=False)

    market_summary = (
        frame.groupby('market_id', as_index=False)
        .agg(
            rows=('market_id', 'size'),
            avg_abs_return=('price_return_1', lambda s: float(s.abs().mean()) if len(s) else 0.0),
            signals_total=('signals_count', 'sum'),
            trades_total=('trades_count', 'sum'),
        )
        .sort_values('signals_total', ascending=False)
    )
    market_summary.to_parquet(output_dir / 'market_summary.parquet', index=False)

    manifest = {
        'dataset': 'curated',
        'created_at_utc': datetime.now(UTC).isoformat(),
        'source_dir': str(input_dir),
        'row_counts': {
            'market_hourly_features': int(len(frame)),
            'market_summary': int(len(market_summary)),
        },
        'interval': preferred_interval,
    }
    (output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description='Build curated dataset for notebook analysis')
    parser.add_argument('--input-dir', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    manifest = build_curated(args.input_dir, args.output_dir)
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
