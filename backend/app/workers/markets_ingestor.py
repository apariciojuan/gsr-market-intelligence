"""Lightweight Gamma markets ingestor (Fase B, sheet 71 section 5.1).

Pulls a bounded page of active Polymarket markets from the Gamma API via
``PolymarketClient``, maps each one to the ``Market`` model and upserts by
``condition_id`` (falling back to ``slug`` when ``condition_id`` is missing).
The worker is defensive: a malformed market is skipped with a warning, never
aborting the cycle. It checkpoints ``sync_state`` under
``(entity_type='market', entity_key='gamma')`` so ``market-price-collector``
finds rows with ``outcome_token_ids``.

Gamma encodes several fields as JSON strings (``outcomes``, ``clobTokenIds``,
``tags``); they are parsed the same way as ``app.api.v1.markets``.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config.log import get_logger
from app.config.settings import settings
from app.models import Market, SyncState
from app.services import PolymarketClient

logger = get_logger('workers.markets_ingestor')


def _parse_json_list(value: Any) -> list[str]:
    """Parse a Gamma field that may be a JSON-encoded string list or a real list."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except (ValueError, TypeError):
            return [text]
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
        return [str(parsed)]
    return [str(value)]


def _to_decimal(value: Any) -> Decimal | None:
    """Best-effort Decimal conversion (Gamma sends numeric strings or None)."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _to_datetime(value: Any) -> datetime | None:
    """Parse a Gamma ISO-8601 date string into a tz-aware datetime (or None)."""
    if not value or not isinstance(value, str):
        return None
    text = value.strip().replace('Z', '+00:00')
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _extract_markets(payload: Any) -> list[dict]:
    """Pull a flat list of market dicts out of a Gamma list/dict response."""
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


def _map_market(market: dict, now: datetime) -> dict | None:
    """Map a raw Gamma market into ``Market`` column values, or None if unusable."""
    condition_id = market.get('conditionId') or None
    slug = market.get('slug') or None
    question = market.get('question') or None
    # condition_id, slug and question are NOT NULL in the model; without them
    # the row cannot satisfy the unique keys we upsert on.
    if not slug or not question:
        return None
    if not condition_id:
        # No condition_id: fall back to slug as the conflict key (see upsert).
        condition_id = slug

    return {
        'condition_id': condition_id,
        'question_id': market.get('questionID') or None,
        'slug': slug,
        'question': question,
        'description': market.get('description') or None,
        'resolution_source': market.get('resolutionSource') or None,
        'category': market.get('category') or None,
        'tags': _parse_json_list(market.get('tags')) or None,
        'outcomes': _parse_json_list(market.get('outcomes')),
        'outcome_token_ids': _parse_json_list(market.get('clobTokenIds')),
        'market_address': None,
        'image_url': market.get('image') or None,
        'start_date': _to_datetime(market.get('startDate')),
        'end_date': _to_datetime(market.get('endDate')),
        'resolved': bool(market.get('closed')),
        'resolved_outcome': None,
        'resolved_at': None,
        'volume_total': _to_decimal(market.get('volume')),
        'liquidity': _to_decimal(market.get('liquidity')),
        'active': bool(market.get('active')),
        'closed': bool(market.get('closed')),
        'uma_adapter_version': None,
        'last_synced_at': now,
        'raw_data': market,
    }


async def _checkpoint(session: Any, processed: int, now: datetime) -> None:
    """Upsert the ``sync_state`` row for the Gamma markets ingestor."""
    stmt = (
        pg_insert(SyncState)
        .values(
            entity_type='market',
            entity_key='gamma',
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


async def collect_markets(ctx: dict) -> int:
    """Ingest active Gamma markets into ``markets``; return the number upserted."""
    session_factory = ctx['session_factory']
    client = PolymarketClient()

    try:
        response = await client.get_markets(
            query_params={
                'limit': settings.MARKETS_INGEST_LIMIT,
                'offset': 0,
                'active': 'true',
                'closed': 'false',
            }
        )
        raw = response.json()
    except Exception:
        logger.exception('markets_ingestor: failed to fetch markets from Gamma')
        return 0

    markets = _extract_markets(raw)
    if not markets:
        logger.warning('markets_ingestor: Gamma returned no markets')
        return 0

    now = datetime.now(tz=UTC)
    upserted = 0

    async with session_factory() as session:
        for market in markets:
            try:
                values = _map_market(market, now)
                if values is None:
                    logger.warning(
                        'markets_ingestor: skipping malformed market (id=%s)',
                        market.get('id'),
                    )
                    continue
                insert_stmt = pg_insert(Market).values(**values)
                # Real upsert: refresh the mutable fields on conflict so a market
                # that later flips active/closed or changes volume is kept fresh
                # (ecosystem aggregates in Fase C read markets.active/volume_total).
                # The conflict key (condition_id) and created_at are left untouched;
                # updated_at is bumped explicitly (onupdate does not fire on upsert).
                refreshed = {
                    column: getattr(insert_stmt.excluded, column)
                    for column in values
                    if column != 'condition_id'
                }
                refreshed['updated_at'] = now
                stmt = insert_stmt.on_conflict_do_update(
                    index_elements=['condition_id'],
                    set_=refreshed,
                )
                await session.execute(stmt)
                upserted += 1
            except Exception:
                logger.exception(
                    'markets_ingestor: failed to upsert market (id=%s)',
                    market.get('id'),
                )

        await _checkpoint(session, upserted, now)
        await session.commit()

    logger.info('markets_ingestor: upserted %d markets', upserted)
    return upserted
