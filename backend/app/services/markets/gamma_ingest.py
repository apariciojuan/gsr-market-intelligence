"""Upsert a single Gamma/Polymarket market into the local ``markets`` table."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Market


def _parse_json_list(value: Any) -> list[str]:
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
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _to_datetime(value: Any) -> datetime | None:
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


def map_gamma_market(market: dict, now: datetime) -> dict | None:
    condition_id = market.get('conditionId') or None
    slug = market.get('slug') or None
    question = market.get('question') or None
    if not slug or not question:
        return None
    if not condition_id:
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


async def upsert_gamma_market(session: AsyncSession, gamma_market: dict) -> Market | None:
    """Insert or refresh a Gamma market row; return the local DB ``Market``."""
    now = datetime.now(tz=UTC)
    values = map_gamma_market(gamma_market, now)
    if values is None:
        return None

    insert_stmt = pg_insert(Market).values(**values)
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

    condition_id = values['condition_id']
    return await session.scalar(select(Market).where(Market.condition_id == condition_id))
