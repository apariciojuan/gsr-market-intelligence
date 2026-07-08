"""Fetch CLOB price history for Gamma/Polymarket markets not in the local DB."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from app.schemas.market import PricePoint
from app.services import PolymarketClient


def _to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _unix_to_iso(value: Any) -> str:
    return datetime.fromtimestamp(int(value), tz=UTC).isoformat().replace('+00:00', 'Z')


def parse_json_list(value: Any) -> list[str]:
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


def first_market(payload: Any) -> dict | None:
    if isinstance(payload, list):
        return payload[0] if payload else None
    if isinstance(payload, dict):
        return payload
    return None


def history_to_series(payload: Any) -> list[PricePoint]:
    history = payload.get('history') if isinstance(payload, dict) else None
    if not isinstance(history, list):
        return []
    series: list[PricePoint] = []
    for point in history:
        if not isinstance(point, dict) or 't' not in point or 'p' not in point:
            continue
        series.append(PricePoint(t=_unix_to_iso(point['t']), v=_to_float(point['p'])))
    return series


async def fetch_gamma_market(client: PolymarketClient, market_id: int) -> dict | None:
    try:
        response = await client.get_market_by_id(market_id=market_id)
        return first_market(response.json())
    except Exception:
        return None


async def fetch_live_price_series(
    client: PolymarketClient,
    market: dict,
    *,
    interval: str,
) -> list[PricePoint]:
    token_ids = parse_json_list(market.get('clobTokenIds'))
    if not token_ids:
        return []
    try:
        response = await client.get_prices_history_by_market(
            {'market': token_ids[0], 'interval': interval}
        )
        return history_to_series(response.json())
    except Exception:
        return []
