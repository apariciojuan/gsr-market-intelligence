"""Idempotent seed for the ``chainlink_feeds`` registry.

Reads the canonical feed list from :data:`app.services.chainlink_client.CHAINLINK_FEEDS`
(addresses are not duplicated here) and upserts one row per ``feed_address`` using the
shared async ``SessionLocal``. ``heartbeat_seconds`` comes from a hardcoded mapping
(``data_sources.md``); ``description`` and ``deviation_threshold_pct`` are left ``None``.

Run as a module from ``backend/`` (Postgres on host: ``localhost:5432``)::

    POSTGRES_HOST=localhost POSTGRES_PORT=5432 uv run python -m scripts.seed_chainlink_feeds
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.config.log import get_logger
from app.core.database import SessionLocal
from app.models import ChainlinkFeed
from app.services.chainlink_client import CHAINLINK_FEEDS

logger = get_logger('seed_chainlink_feeds')

# Heartbeat per feed address (seconds), hardcoded per data_sources.md.
HEARTBEAT_SECONDS_BY_ADDRESS: dict[str, int] = {
    '0xc907e116054ad103354f2d350fd2514433d57f6f': 27,  # BTC/USD
    '0xf9680d99d6c9589e2a93a78a04a279e509205945': 27,  # ETH/USD
    '0xab594600376ec9fd91f8e885dadf0ce036862de0': 27,  # MATIC/USD
    '0x10c8264c0935b3b9870013e057f330ff3e9c56dc': 60,  # SOL/USD
    '0xfe4a8cc5b5b2366c1b58bea3858e81843581b2f7': 86400,  # USDC/USD
}


async def seed_chainlink_feeds() -> int:
    """Upsert the Chainlink feed registry by ``feed_address``; return rows touched."""
    touched = 0
    async with SessionLocal() as session:
        for feed_def in CHAINLINK_FEEDS:
            existing = await session.scalar(
                select(ChainlinkFeed).where(ChainlinkFeed.feed_address == feed_def.feed_address)
            )
            heartbeat = HEARTBEAT_SECONDS_BY_ADDRESS.get(feed_def.feed_address)
            if existing is None:
                session.add(
                    ChainlinkFeed(
                        feed_address=feed_def.feed_address,
                        asset_pair=feed_def.asset_pair,
                        decimals=feed_def.decimals,
                        description=None,
                        heartbeat_seconds=heartbeat,
                        deviation_threshold_pct=None,
                        active=True,
                    )
                )
                logger.info('chainlink feed inserted: %s', feed_def.asset_pair)
            else:
                existing.asset_pair = feed_def.asset_pair
                existing.decimals = feed_def.decimals
                existing.heartbeat_seconds = heartbeat
                existing.active = True
                logger.info('chainlink feed updated: %s', feed_def.asset_pair)
            touched += 1
        await session.commit()
    logger.info('chainlink feeds seeded: %d', touched)
    return touched


if __name__ == '__main__':
    asyncio.run(seed_chainlink_feeds())
