"""Global search endpoint (the ⌘K box).

Composes real sources already wired:
  - markets: Polymarket Gamma public-search
  - tags:    Polymarket Gamma tags (filtered by the query)
  - contracts/wallets: if the query is a Polygon address, echo it as a result
    (there is no wallet/contract index yet — later phase).
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Query

from app.config.log import get_logger
from app.schemas.search import (
    SearchContractResult,
    SearchMarketResult,
    SearchResults,
    SearchResultsGroups,
    SearchTagResult,
    SearchWalletResult,
)
from app.services import PolymarketClient

router = APIRouter()
logger = get_logger('search')

_ADDRESS_RE = re.compile(r'^0x[0-9a-fA-F]{40}$')


def _to_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _extract_markets(payload: Any) -> list[dict]:
    """Flatten Gamma public-search (markets / events[].markets) into market dicts."""
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


def _extract_tags(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [t for t in payload if isinstance(t, dict)]
    if isinstance(payload, dict) and isinstance(payload.get('tags'), list):
        return [t for t in payload['tags'] if isinstance(t, dict)]
    return []


@router.get(
    '',
    response_model=SearchResults,
    status_code=200,
    operation_id='global_search',
    tags=['search'],
    summary='Global search',
    description='Search markets and tags (echoes a contract/wallet if the query is an address).',
)
async def global_search(
    q: str = Query(..., min_length=1),
    limit_per_group: int = Query(default=5, ge=1, le=20),
) -> SearchResults:
    client = PolymarketClient()

    markets: list[SearchMarketResult] = []
    try:
        payload = (
            await client.get_markets_search({'q': q, 'limit_per_type': limit_per_group})
        ).json()
        for market in _extract_markets(payload)[:limit_per_group]:
            markets.append(
                SearchMarketResult(
                    id=_to_int(market.get('id')),
                    slug=market.get('slug') or '',
                    question=market.get('question') or '',
                    category=market.get('category') or '',
                )
            )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning('search: markets lookup failed for q=%r', q)

    tags: list[SearchTagResult] = []
    try:
        payload = (await client.get_tags({'limit': 100})).json()
        needle = q.lower()
        for tag in _extract_tags(payload):
            name = tag.get('label') or tag.get('slug') or ''
            if name and needle in name.lower():
                tags.append(
                    SearchTagResult(name=name, market_count=_to_int(tag.get('marketCount')))
                )
        tags = tags[:limit_per_group]
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning('search: tags lookup failed for q=%r', q)

    contracts: list[SearchContractResult] = []
    wallets: list[SearchWalletResult] = []
    if _ADDRESS_RE.match(q.strip()):
        address = q.strip().lower()
        contracts.append(SearchContractResult(address=address, type='Contract', name=''))
        wallets.append(SearchWalletResult(address=address, label=None, total_volume_usd=0.0))

    return SearchResults(
        query=q,
        results=SearchResultsGroups(
            markets=markets, wallets=wallets, contracts=contracts, tags=tags
        ),
    )
