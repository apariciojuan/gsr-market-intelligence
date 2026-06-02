"""CLOB price history collector (Fase B, sheet 71 section 5.2).

For every active market and each ``(token_id, outcome)`` pair, calls
``PolymarketClient.get_prices_history_by_market`` and upserts the returned
points into the ``price_history`` hypertable. If there are no active markets
(the ``markets`` table is empty because the ingestor has not run yet) the
worker returns ``0`` — honest degradation, not an error.

The CLOB endpoint returns ``{'history': [{'t': <unix s>, 'p': <float 0..1>}]}``
with no token id, so we issue one call per token. Points are mapped to
``PriceHistory`` with ``source='clob'`` and the optional fields left ``None``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config.log import get_logger
from app.config.settings import settings
from app.models import Market, PriceHistory, SyncState
from app.services import PolymarketClient

logger = get_logger('workers.market_price_collector')


def _to_price(value: Any) -> Decimal | None:
    """Convert a CLOB price into a Decimal in the [0, 1] range, or None."""
    try:
        price = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if price < 0 or price > 1:
        return None
    return price


def _to_time(value: Any) -> datetime | None:
    """Convert a unix-second timestamp into a tz-aware datetime, or None."""
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def _history_points(payload: Any) -> list[dict]:
    """Pull the ``history`` list out of a CLOB prices-history response."""
    if not isinstance(payload, dict):
        return []
    history = payload.get('history')
    if not isinstance(history, list):
        return []
    return [point for point in history if isinstance(point, dict)]


async def _checkpoint(session: Any, market_id: int, processed: int, now: datetime) -> None:
    """Upsert the ``sync_state`` row for this market's price collection."""
    stmt = (
        pg_insert(SyncState)
        .values(
            entity_type='market_price',
            entity_key=str(market_id),
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


async def _collect_token(
    session: Any,
    client: PolymarketClient,
    market_id: int,
    token_id: str,
    outcome: str,
) -> int:
    """Fetch and upsert one token's price history; return rows inserted."""
    try:
        response = await client.get_prices_history_by_market(
            {
                'market': token_id,
                'interval': settings.MARKET_PRICE_INTERVAL,
                'fidelity': settings.MARKET_PRICE_FIDELITY,
            }
        )
        points = _history_points(response.json())
    except Exception:
        logger.exception(
            'market_price_collector: failed to fetch history (market=%s token=%s)',
            market_id,
            token_id,
        )
        return 0

    inserted = 0
    for point in points:
        time_value = _to_time(point.get('t'))
        price = _to_price(point.get('p'))
        if time_value is None or price is None:
            continue
        stmt = (
            pg_insert(PriceHistory)
            .values(
                time=time_value,
                market_id=market_id,
                token_id=token_id,
                outcome=outcome,
                price=price,
                bid=None,
                ask=None,
                midpoint=None,
                spread=None,
                volume_1h=None,
                source='clob',
            )
            .on_conflict_do_nothing(index_elements=['time', 'market_id', 'token_id'])
        )
        await session.execute(stmt)
        inserted += 1
    return inserted


async def collect_market_prices(ctx: dict) -> int:
    """Collect CLOB price history for active markets; return points upserted.

    Returns ``0`` (no error) when there are no active markets to process.
    """
    session_factory = ctx['session_factory']
    client = PolymarketClient()
    total_inserted = 0
    now = datetime.now(tz=UTC)

    async with session_factory() as session:
        result = await session.execute(
            select(Market.id, Market.outcomes, Market.outcome_token_ids).where(
                Market.active.is_(True)
            )
        )
        rows = result.all()
        if not rows:
            logger.info('market_price_collector: no active markets, skipping (degraded)')
            return 0

        for market_id, outcomes, token_ids in rows:
            outcomes = outcomes if isinstance(outcomes, list) else []
            token_ids = token_ids if isinstance(token_ids, list) else []
            market_inserted = 0
            try:
                for token_id, outcome in zip(token_ids, outcomes, strict=False):
                    if not token_id:
                        continue
                    market_inserted += await _collect_token(
                        session, client, market_id, str(token_id), str(outcome)
                    )
                await _checkpoint(session, market_id, market_inserted, now)
            except Exception:
                logger.exception(
                    'market_price_collector: failed to collect market (id=%s)',
                    market_id,
                )
                continue
            total_inserted += market_inserted

        await session.commit()

    logger.info('market_price_collector: upserted %d price points', total_inserted)
    return total_inserted
