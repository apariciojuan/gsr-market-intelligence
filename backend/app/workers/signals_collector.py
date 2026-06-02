"""``signals-collector`` worker — live Chainlink price-feed ingestion.

One cycle reads ``latestRoundData()`` for every active row in ``chainlink_feeds``
through :class:`~app.services.chainlink_client.ChainlinkClient` (Etherscan ``eth_call``
proxy, no RPC node) and upserts the answer into the ``chainlink_prices`` hypertable.
The observation block (``block_number``) is resolved once per cycle. Per-feed read
failures warn and continue (the cycle never aborts); transient rate limits are retried
inside ``EtherscanLogSource._request_json``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config.log import get_logger
from app.models import ChainlinkFeed, ChainlinkPrice, SyncState
from app.services.chainlink_client import CHAINLINK_FEEDS, ChainlinkClient

logger = get_logger('signals_collector')


async def collect_chainlink_signals(ctx: dict) -> int:
    """Poll active Chainlink feeds once and upsert their latest answers.

    Returns the number of ``chainlink_prices`` rows inserted this cycle.
    """
    inserted_total = 0
    client = ChainlinkClient()
    feed_defs_by_address = {feed_def.feed_address: feed_def for feed_def in CHAINLINK_FEEDS}

    async with ctx['session_factory']() as session:
        # Observation block for the whole cycle (one extra request, not one per feed).
        block_number = await client._source.latest_block()

        feeds = (await session.scalars(select(ChainlinkFeed).where(ChainlinkFeed.active))).all()

        for feed_db in feeds:
            feed_def = feed_defs_by_address.get(feed_db.feed_address)
            if feed_def is None:
                logger.warning('no ChainlinkFeedDef for %s; skipping', feed_db.feed_address)
                continue

            try:
                reading = await client.get_latest(feed_def)
            except RuntimeError:
                logger.warning('chainlink read failed for %s; skipping', feed_db.asset_pair)
                continue

            now = datetime.now(tz=UTC)
            insert_stmt = (
                pg_insert(ChainlinkPrice)
                .values(
                    time=datetime.fromtimestamp(reading.updated_at, tz=UTC),
                    feed_id=feed_db.id,
                    round_id=reading.round_id,
                    answer_raw=reading.answer_raw,
                    answer_usd=Decimal(str(reading.price_usd)),
                    block_number=block_number,
                    polled_at=now,
                )
                .on_conflict_do_nothing(index_elements=['time', 'feed_id', 'round_id'])
            )
            result = await session.execute(insert_stmt)
            inserted = result.rowcount or 0
            inserted_total += inserted

            checkpoint = (
                pg_insert(SyncState)
                .values(
                    entity_type='chainlink_feed',
                    entity_key=feed_db.feed_address,
                    last_block_processed=block_number,
                    last_synced_at=now,
                    sync_status='completed',
                    total_items_processed=inserted,
                )
                .on_conflict_do_update(
                    constraint='uq_sync_state_entity',
                    set_={
                        'last_block_processed': block_number,
                        'last_synced_at': now,
                        'sync_status': 'completed',
                        'total_items_processed': (SyncState.total_items_processed + inserted),
                    },
                )
            )
            await session.execute(checkpoint)

        await session.commit()

    logger.info('chainlink signals collected: %d new rows', inserted_total)
    return inserted_total
