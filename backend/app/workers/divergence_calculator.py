"""Divergence calculator worker (Fase D, sheet 73 section 3).

Each cycle wires up the divergence pipeline and runs it once:
:class:`~app.services.divergence.series_provider.SeriesProvider` (bound to the task
session), :class:`~app.services.divergence.feed_matcher.FeedMatcher` (reuses
``resolve_feed_for_market`` as-is) and
:class:`~app.services.divergence.service.DivergenceService`. ``run_once`` walks every
active market, matches it to a Chainlink feed, pulls both series over the configured
window, normalizes them and runs every detector, persisting divergences through the
SELECT-then-write lifecycle.

With the current data (no clean crypto markets, shallow ``chainlink_prices``) the run
will usually touch 0 divergences — honest empty, never an error. The worker is
defensive: any failure is logged and the cycle returns 0, and it checkpoints
``sync_state`` under ``(entity_type='divergence_calc', entity_key='all')``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config.log import get_logger
from app.models import SyncState
from app.services.divergence import DivergenceService
from app.services.divergence.feed_matcher import FeedMatcher
from app.services.divergence.series_provider import SeriesProvider

logger = get_logger('workers.divergence_calculator')


async def _checkpoint(session: Any, processed: int, now: datetime) -> None:
    """Upsert the ``sync_state`` row for the divergence calculator."""
    stmt = (
        pg_insert(SyncState)
        .values(
            entity_type='divergence_calc',
            entity_key='all',
            last_synced_at=now,
            sync_status='completed',
            total_items_processed=processed,
        )
        .on_conflict_do_update(
            constraint='uq_sync_state_entity',
            set_={
                'last_synced_at': now,
                'sync_status': 'completed',
                'total_items_processed': SyncState.total_items_processed + processed,
            },
        )
    )
    await session.execute(stmt)


async def calculate_divergences(ctx: dict) -> int:
    """Run the divergence pipeline once; return the number of divergences touched."""
    session_factory = ctx['session_factory']
    now = datetime.now(tz=UTC)
    touched = 0

    async with session_factory() as session:
        try:
            service = DivergenceService(SeriesProvider(session), FeedMatcher())
            touched = await service.run_once(session)
        except Exception:
            logger.exception('divergence_calculator: failed to run divergence pipeline')
            return 0

        await _checkpoint(session, touched, now)
        await session.commit()

    logger.info('divergence_calculator: touched %d divergences', touched)
    return touched
