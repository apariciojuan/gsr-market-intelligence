"""Trade volume aggregator (background).

Fetches Polymarket trades per active market and stores aligned volume buckets
in ``market_volume_cache`` so ``GET /markets/{id}/prices`` returns instantly.
Also snapshots ``kpi_active_wallets_24h`` into ``ecosystem_metrics``.

Each cron cycle processes a small batch of markets (rotating cursor) so the job
finishes within the worker timeout while the full universe is refreshed over time.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config.log import get_logger
from app.config.settings import settings
from app.models import EcosystemMetric, Market, SyncState
from app.services import PolymarketClient
from app.services.markets.gamma_ingest import upsert_gamma_market
from app.services.markets.live_prices import fetch_gamma_market, fetch_live_price_series
from app.services.markets.local_store import MarketsLocalStore, market_to_gamma_dict
from app.services.markets.trades_analytics import (
    build_volume_series,
    count_active_wallets_24h,
    fetch_market_trades,
    resolve_volume_bucket_timestamps,
    window_start_for_interval,
)
from app.services.markets.volume_cache import VolumeCacheStore, volume_intervals

logger = get_logger('workers.market_volume_collector')

SNAPSHOT_TTL = timedelta(hours=1)
_SYNC_ENTITY = ('market_volume', 'all')


async def _load_cursor(session) -> int:
    row = await session.scalar(
        select(SyncState).where(
            SyncState.entity_type == _SYNC_ENTITY[0],
            SyncState.entity_key == _SYNC_ENTITY[1],
        )
    )
    if row is None or not row.metadata_json:
        return 0
    try:
        return int(row.metadata_json.get('cursor', 0))
    except (TypeError, ValueError):
        return 0


async def _checkpoint(session, processed: int, cursor: int, now: datetime) -> None:
    stmt = (
        pg_insert(SyncState)
        .values(
            entity_type=_SYNC_ENTITY[0],
            entity_key=_SYNC_ENTITY[1],
            last_synced_at=now,
            sync_status='completed',
            total_items_processed=processed,
            metadata_json={'cursor': cursor},
        )
        .on_conflict_do_update(
            constraint='uq_sync_state_entity',
            set_={
                'last_synced_at': now,
                'sync_status': 'completed',
                'total_items_processed': SyncState.total_items_processed + processed,
                'metadata_json': {'cursor': cursor},
            },
        )
    )
    await session.execute(stmt)


async def _store_active_wallets(session, count: int, now: datetime) -> None:
    stmt = pg_insert(EcosystemMetric).values(
        metric_key='kpi_active_wallets_24h',
        metric_value=Decimal(count),
        metric_metadata={'value_formatted': f'{count:,}'},
        computed_at=now,
        valid_until=now + SNAPSHOT_TTL,
    )
    await session.execute(stmt)


async def _refresh_market_intervals(
    session,
    market: Market,
    *,
    client: PolymarketClient,
    local_store: MarketsLocalStore,
    cache: VolumeCacheStore,
    now: datetime,
    max_trades: int,
    gamma_market: dict | None = None,
) -> int:
    if not market.condition_id:
        return 0

    processed = 0
    for interval in volume_intervals():
        try:
            refreshed = await refresh_market_volume_interval(
                session,
                market,
                interval,
                client=client,
                local_store=local_store,
                cache=cache,
                now=now,
                max_trades=max_trades,
                gamma_market=gamma_market,
            )
            if refreshed:
                processed += 1
        except Exception:
            logger.exception(
                'market_volume_collector: failed market=%s interval=%s',
                market.id,
                interval,
            )
    return processed


async def refresh_market_volume_interval(
    session,
    market: Market,
    interval: str,
    *,
    client: PolymarketClient | None = None,
    local_store: MarketsLocalStore | None = None,
    cache: VolumeCacheStore | None = None,
    now: datetime | None = None,
    max_trades: int | None = None,
    gamma_market: dict | None = None,
) -> bool:
    """Refresh cached volume buckets for one market interval."""
    if not market.condition_id:
        return False

    client = client or PolymarketClient()
    local_store = local_store or MarketsLocalStore(session)
    cache = cache or VolumeCacheStore(session)
    now = now or datetime.now(tz=UTC)
    max_trades = max_trades if max_trades is not None else settings.MARKET_VOLUME_MAX_TRADES

    series_yes = await local_store.get_price_series(market.id, 'Yes', interval=interval)
    if not series_yes and gamma_market is not None:
        series_yes = await fetch_live_price_series(client, gamma_market, interval=interval)
    price_ts = [point.t for point in series_yes] if series_yes else None
    bucket_ts = resolve_volume_bucket_timestamps(interval, price_ts)
    if not bucket_ts:
        return False

    trades = await fetch_market_trades(
        client,
        market.condition_id,
        since=window_start_for_interval(interval),
        max_trades=max_trades,
    )
    bucket_ts = resolve_volume_bucket_timestamps(interval, price_ts)
    volume = build_volume_series(trades, bucket_ts)
    await cache.upsert(market.id, interval, volume, computed_at=now)
    return True


async def collect_market_volume_for_market(ctx: dict, market_id: int) -> int:
    """Refresh cached volume buckets for one market (on-demand from the API)."""
    session_factory = ctx['session_factory']
    now = datetime.now(tz=UTC)
    max_trades = settings.MARKET_VOLUME_MAX_TRADES

    async with session_factory() as session:
        client = PolymarketClient()
        cache = VolumeCacheStore(session)
        market = await session.scalar(select(Market).where(Market.id == market_id))

        if market is not None:
            local_store = MarketsLocalStore(session)
            processed = await _refresh_market_intervals(
                session,
                market,
                client=client,
                local_store=local_store,
                cache=cache,
                now=now,
                max_trades=max_trades,
                gamma_market=market_to_gamma_dict(market),
            )
        else:
            gamma_market = await fetch_gamma_market(client, market_id)
            if gamma_market is None:
                logger.warning(
                    'market_volume_collector: market_id=%s not in DB or Gamma',
                    market_id,
                )
                return 0
            market = await upsert_gamma_market(session, gamma_market)
            if market is None:
                logger.warning(
                    'market_volume_collector: could not upsert gamma market_id=%s',
                    market_id,
                )
                return 0
            local_store = MarketsLocalStore(session)
            processed = await _refresh_market_intervals(
                session,
                market,
                client=client,
                local_store=local_store,
                cache=cache,
                now=now,
                max_trades=max_trades,
                gamma_market=gamma_market,
            )

        await session.commit()

    logger.info(
        'market_volume_collector: on-demand cached %s rows for market_id=%s',
        processed,
        market_id,
    )
    return processed


async def collect_market_volumes(ctx: dict) -> int:
    """Refresh cached volume buckets for the next batch of active markets."""
    session_factory = ctx['session_factory']
    now = datetime.now(tz=UTC)
    universe_limit = settings.MARKET_VOLUME_MARKETS_LIMIT
    batch_size = settings.MARKET_VOLUME_BATCH_SIZE
    max_trades = settings.MARKET_VOLUME_MAX_TRADES
    processed = 0

    async with session_factory() as session:
        query = (
            select(Market)
            .where(Market.active.is_(True), Market.resolved.is_(False))
            .order_by(Market.volume_total.desc().nullslast(), Market.id.asc())
        )
        if universe_limit > 0:
            query = query.limit(universe_limit)
        markets = list((await session.scalars(query)).all())

        if not markets:
            logger.info('market_volume_collector: no active markets — skipping')
            await _checkpoint(session, 0, 0, now)
            await session.commit()
            return 0

        cursor = await _load_cursor(session)
        if cursor >= len(markets):
            cursor = 0
        batch = markets[cursor : cursor + batch_size]
        next_cursor = (cursor + len(batch)) % len(markets)

        client = PolymarketClient()
        local_store = MarketsLocalStore(session)
        cache = VolumeCacheStore(session)

        for market in batch:
            processed += await _refresh_market_intervals(
                session,
                market,
                client=client,
                local_store=local_store,
                cache=cache,
                now=now,
                max_trades=max_trades,
                gamma_market=market_to_gamma_dict(market),
            )

        if cursor == 0:
            try:
                wallets = await count_active_wallets_24h(client)
                await _store_active_wallets(session, wallets, now)
            except Exception:
                logger.exception('market_volume_collector: active wallets snapshot failed')

        await _checkpoint(session, processed, next_cursor, now)
        await session.commit()

    logger.info(
        'market_volume_collector: cached %s rows (batch %s..%s, next cursor %s)',
        processed,
        cursor,
        cursor + len(batch) - 1,
        next_cursor,
    )
    return processed
