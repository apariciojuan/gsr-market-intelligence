"""Lightweight arq enqueue helpers for the API layer."""

from __future__ import annotations

from arq import create_pool

from app.config.log import get_logger
from app.workers.settings import get_redis_settings

logger = get_logger('workers.queue')


async def enqueue_market_volume_refresh(market_id: int) -> None:
    """Queue a single-market volume refresh (deduped per market id)."""
    try:
        redis = await create_pool(get_redis_settings())
        try:
            await redis.enqueue_job(
                'collect_market_volume_for_market',
                market_id,
                _job_id=f'market-volume-{market_id}',
            )
        finally:
            await redis.aclose()
    except Exception:
        logger.warning(
            'enqueue_market_volume_refresh failed for market_id=%s',
            market_id,
            exc_info=True,
        )
