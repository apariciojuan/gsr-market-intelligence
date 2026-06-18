"""External signals collector — RSS / resolution_source feeds."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config.log import get_logger
from app.config.settings import settings
from app.models import SyncState
from app.services.external_signals.service import ExternalSignalsService

logger = get_logger('workers.external_signals_collector')


async def collect_external_signals(ctx: dict) -> int:
    """Collect RSS signals for active markets. Returns upsert count."""
    if not settings.EXTERNAL_SIGNALS_ENABLED:
        return 0

    async with ctx['session_factory']() as session:
        service = ExternalSignalsService(session)
        count = await service.collect_for_market_ids()
        now = datetime.now(UTC)
        stmt = (
            pg_insert(SyncState)
            .values(
                entity_type='external_signal',
                entity_key='rss',
                last_synced_at=now,
                sync_status='completed',
                total_items_processed=count,
            )
            .on_conflict_do_update(
                constraint='uq_sync_state_entity',
                set_={
                    'last_synced_at': now,
                    'sync_status': 'completed',
                    'total_items_processed': SyncState.total_items_processed + count,
                },
            )
        )
        await session.execute(stmt)
        await session.commit()
    logger.info('external_signals_collector upserted %d rows', count)
    return count
