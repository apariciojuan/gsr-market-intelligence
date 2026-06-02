"""Real markets endpoints backed by Polymarket (Gamma + CLOB) and Chainlink.

Replaces the raw proxy handlers. Every response matches EXACTLY the frontend
contract in ``frontend/app/lib/api/types.ts`` (mirrored by ``app.schemas.market``).

Gamma returns string-encoded JSON for several fields (``outcomes``,
``outcomePrices``, ``clobTokenIds``, ``tags``); they are parsed defensively here.
The CLOB price history returns ``{'history': [{'t': <unix>, 'p': <price>}]}`` and
is converted to ISO-8601 UTC (``...Z``) points to match the ``PricePoint`` shape.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.config.log import get_logger
from app.schemas.market import (
    ChainlinkOverlay,
    Holder,
    MarketCurrentPrices,
    MarketDetail,
    MarketListItem,
    MarketOutcomePrice,
    MarketRead,
    MarketStats,
    Orderbook,
    OrderbookLevel,
    PaginatedHolders,
    PaginatedMarkets,
    PaginatedTrades,
    PriceHistory,
    PriceHistoryStats,
    PricePoint,
    Sparkline,
    TopMarketsNews,
    Trade,
)
from app.services import PolymarketClient
from app.services.chainlink_client import ChainlinkClient

router = APIRouter()
logger = get_logger('markets')


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


def _to_float(value: Any) -> float:
    """Best-effort float conversion (Gamma sends numeric strings or None)."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_int(value: Any) -> int:
    """Best-effort int conversion for Gamma's string numeric ids."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _first_market(payload: Any) -> dict | None:
    """Normalize a Gamma single-market response (dict or one-element list)."""
    if isinstance(payload, list):
        return payload[0] if payload else None
    if isinstance(payload, dict):
        return payload
    return None


def _extract_markets(payload: Any) -> list[dict]:
    """Pull a flat list of market dicts out of a Gamma list/search response."""
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


def _to_list_item(market: dict) -> MarketListItem:
    return MarketListItem(
        id=_to_int(market.get('id')),
        condition_id=market.get('conditionId') or '',
        slug=market.get('slug') or '',
        question=market.get('question') or '',
        category=market.get('category') or '',
        tags=_parse_json_list(market.get('tags')),
        outcomes=_parse_json_list(market.get('outcomes')),
        end_date=market.get('endDate') or '',
        volume_total=_to_float(market.get('volume')),
        liquidity=_to_float(market.get('liquidity')),
        active=bool(market.get('active')),
        resolved=bool(market.get('closed')),
    )


def _to_market_read(market: dict) -> MarketRead:
    return MarketRead(
        id=_to_int(market.get('id')),
        condition_id=market.get('conditionId') or '',
        question_id=market.get('questionID') or '',
        slug=market.get('slug') or '',
        question=market.get('question') or '',
        description=market.get('description') or '',
        category=market.get('category') or '',
        tags=_parse_json_list(market.get('tags')),
        outcomes=_parse_json_list(market.get('outcomes')),
        outcome_token_ids=_parse_json_list(market.get('clobTokenIds')),
        market_address='',
        image_url=market.get('image') or '',
        start_date=market.get('startDate') or '',
        end_date=market.get('endDate') or '',
        resolved=bool(market.get('closed')),
        active=bool(market.get('active')),
        volume_total=_to_float(market.get('volume')),
        liquidity=_to_float(market.get('liquidity')),
        uma_adapter_version='',
        uma_adapter_address='',
        last_synced_at='',
    )


def _to_stats(market: dict) -> MarketStats:
    volume = _to_float(market.get('volume'))
    liquidity = _to_float(market.get('liquidity'))
    return MarketStats(
        volume_24h_usd=volume,
        volume_7d_usd=volume,
        trader_count=0,
        holder_count=0,
        open_interest_usd=liquidity,
    )


def _to_current_prices(market: dict) -> MarketCurrentPrices:
    prices = _parse_json_list(market.get('outcomePrices'))
    yes_price = _to_float(prices[0]) if len(prices) >= 1 else 0.0
    no_price = _to_float(prices[1]) if len(prices) >= 2 else max(0.0, 1.0 - yes_price)
    return MarketCurrentPrices(
        yes=MarketOutcomePrice(
            price=yes_price, bid=yes_price, ask=yes_price, midpoint=yes_price, spread=0.0
        ),
        no=MarketOutcomePrice(
            price=no_price, bid=no_price, ask=no_price, midpoint=no_price, spread=0.0
        ),
    )


def _overlay_text(market: dict) -> str:
    """Concatenate the fields used to resolve a Chainlink feed for a market."""
    tags = _parse_json_list(market.get('tags'))
    return f'{market.get("question") or ""} {" ".join(tags)}'.strip()


def _unix_to_iso(value: Any) -> str:
    """Convert a unix timestamp (seconds) to an ISO-8601 UTC string ending in 'Z'."""
    return datetime.fromtimestamp(int(value), tz=UTC).isoformat().replace('+00:00', 'Z')


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat().replace('+00:00', 'Z')


def _history_to_series(payload: Any) -> list[PricePoint]:
    history = payload.get('history') if isinstance(payload, dict) else None
    if not isinstance(history, list):
        return []
    series: list[PricePoint] = []
    for point in history:
        if not isinstance(point, dict) or 't' not in point or 'p' not in point:
            continue
        series.append(PricePoint(t=_unix_to_iso(point['t']), v=_to_float(point['p'])))
    return series


@router.get(
    '',
    response_model=PaginatedMarkets,
    status_code=200,
    operation_id='list_markets',
    tags=['markets'],
    summary='List markets',
    description='Live list of Polymarket markets mapped to the frontend contract.',
)
async def list_markets(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    resolved: bool | None = Query(default=None),
) -> PaginatedMarkets:
    client = PolymarketClient()
    query_params: dict[str, Any] = {'limit': limit, 'offset': offset}
    if resolved is not None:
        query_params['closed'] = str(resolved).lower()
    response = await client.get_markets(query_params=query_params)
    markets = _extract_markets(response.json())

    items = [_to_list_item(market) for market in markets]
    if category:
        wanted = category.lower()
        items = [item for item in items if item.category.lower() == wanted]
    if active is not None:
        items = [item for item in items if item.active == active]
    if resolved is not None:
        items = [item for item in items if item.resolved == resolved]

    return PaginatedMarkets(
        items=items,
        total=None,
        limit=limit,
        offset=offset,
        has_more=len(markets) >= limit,
    )


@router.get(
    '/search',
    response_model=PaginatedMarkets,
    status_code=200,
    operation_id='search_markets',
    tags=['markets'],
    summary='Search markets',
    description='Full-text market search via the Gamma public-search endpoint.',
)
async def search_markets(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> PaginatedMarkets:
    client = PolymarketClient()
    response = await client.get_markets_search(query_params={'q': q, 'limit_per_type': limit})
    markets = _extract_markets(response.json())

    items = [_to_list_item(market) for market in markets][:limit]
    return PaginatedMarkets(
        items=items,
        total=len(items),
        limit=limit,
        offset=0,
        has_more=False,
    )


@router.get(
    '/{slug}',
    response_model=MarketDetail,
    status_code=200,
    operation_id='get_market_detail',
    tags=['markets'],
    summary='Get market detail by slug',
    description='Market detail with stats, current prices and Chainlink overlay flag.',
)
async def get_market_detail(slug: str) -> MarketDetail:
    client = PolymarketClient()
    response = await client.get_market_by_slug(market_slug=slug)
    market = _first_market(response.json())
    if market is None:
        raise HTTPException(status_code=404, detail=f'Market "{slug}" not found.')

    feed = ChainlinkClient().resolve_feed_for_market(_overlay_text(market))
    return MarketDetail(
        market=_to_market_read(market),
        stats=_to_stats(market),
        current_prices=_to_current_prices(market),
        linked_contracts=[],
        has_chainlink_overlay=feed is not None,
        chainlink_asset_pair=feed.asset_pair if feed is not None else None,
    )


@router.get(
    '/{market_id}/prices',
    response_model=PriceHistory,
    status_code=200,
    operation_id='get_market_prices',
    tags=['markets'],
    summary='Get market price history',
    description='YES/NO CLOB price history with an optional Chainlink spot overlay.',
)
async def get_market_prices(
    market_id: str,
    interval: str = Query(default='1d'),
    include_chainlink: bool = Query(default=True),
) -> PriceHistory:
    client = PolymarketClient()
    response = await client.get_market_by_id(market_id=market_id)
    market = _first_market(response.json())
    if market is None:
        raise HTTPException(status_code=404, detail=f'Market "{market_id}" not found.')

    token_ids = _parse_json_list(market.get('clobTokenIds'))

    series_yes: list[PricePoint] = []
    if token_ids:
        yes_response = await client.get_prices_history_by_market(
            {'market': token_ids[0], 'interval': interval}
        )
        series_yes = _history_to_series(yes_response.json())

    series_no: list[PricePoint] = []
    if len(token_ids) >= 2:
        no_response = await client.get_prices_history_by_market(
            {'market': token_ids[1], 'interval': interval}
        )
        series_no = _history_to_series(no_response.json())

    yes_values = [point.v for point in series_yes]
    stats = PriceHistoryStats(
        min_yes=min(yes_values) if yes_values else 0.0,
        max_yes=max(yes_values) if yes_values else 0.0,
        avg_yes=sum(yes_values) / len(yes_values) if yes_values else 0.0,
        total_volume_usd=0.0,
    )

    chainlink_overlay: ChainlinkOverlay | None = None
    if include_chainlink:
        overlay = await ChainlinkClient().build_overlay(
            _overlay_text(market), [point.t for point in series_yes]
        )
        if overlay is not None:
            chainlink_overlay = ChainlinkOverlay(**overlay)

    from_time = series_yes[0].t if series_yes else _now_iso()
    to_time = series_yes[-1].t if series_yes else _now_iso()

    return PriceHistory(
        market_id=_to_int(market.get('id')),
        interval=interval,
        from_time=from_time,
        to_time=to_time,
        series_yes=series_yes,
        series_no=series_no,
        volume_series=[],
        chainlink_overlay=chainlink_overlay,
        markers=[],
        stats=stats,
    )


def _ms_to_iso(value: Any) -> str:
    """Convert a unix-millisecond timestamp to an ISO-8601 UTC string ending in 'Z'."""
    try:
        return (
            datetime.fromtimestamp(int(value) / 1000, tz=UTC).isoformat().replace('+00:00', 'Z')
        )
    except (TypeError, ValueError):
        return _now_iso()


def _orderbook_levels(raw_levels: Any, depth: int) -> list[OrderbookLevel]:
    levels: list[OrderbookLevel] = []
    cumulative = 0.0
    if isinstance(raw_levels, list):
        for entry in raw_levels[:depth]:
            if not isinstance(entry, dict):
                continue
            size = _to_float(entry.get('size'))
            cumulative += size
            levels.append(
                OrderbookLevel(
                    price=_to_float(entry.get('price')), size=size, cumulative_size=cumulative
                )
            )
    return levels


async def _resolve_market(client: PolymarketClient, market_id: str) -> dict:
    market = _first_market((await client.get_market_by_id(market_id=market_id)).json())
    if market is None:
        raise HTTPException(status_code=404, detail=f'Market "{market_id}" not found.')
    return market


@router.get(
    '/{market_id}/orderbook',
    response_model=Orderbook,
    status_code=200,
    operation_id='get_market_orderbook',
    tags=['markets'],
    summary='Get market order book',
    description='CLOB order book (bids/asks) for a market outcome.',
)
async def get_market_orderbook(
    market_id: str,
    outcome: str = Query(default='yes'),
    depth: int = Query(default=20, ge=1, le=200),
) -> Orderbook:
    client = PolymarketClient()
    market = await _resolve_market(client, market_id)
    token_ids = _parse_json_list(market.get('clobTokenIds'))
    index = 1 if outcome == 'no' else 0
    token = token_ids[index] if len(token_ids) > index else (token_ids[0] if token_ids else None)
    if not token:
        raise HTTPException(status_code=404, detail='Market has no CLOB token.')

    book = (await client.get_book({'token_id': token})).json()
    bids = _orderbook_levels(book.get('bids'), depth)
    asks = _orderbook_levels(book.get('asks'), depth)
    best_bid = max((lvl.price for lvl in bids), default=0.0)
    best_ask = min((lvl.price for lvl in asks), default=0.0)
    if best_bid and best_ask:
        midpoint = (best_bid + best_ask) / 2
        spread = best_ask - best_bid
    else:
        midpoint = _to_float(book.get('last_trade_price')) or best_bid or best_ask
        spread = 0.0

    return Orderbook(
        market_id=_to_int(market.get('id')),
        outcome='no' if index == 1 else 'yes',
        token_id=str(token),
        midpoint=midpoint,
        spread=spread,
        bids=bids,
        asks=asks,
        last_updated_at=_ms_to_iso(book.get('timestamp')),
    )


@router.get(
    '/{market_id}/holders',
    response_model=PaginatedHolders,
    status_code=200,
    operation_id='get_market_holders',
    tags=['markets'],
    summary='Get market holders',
    description='Top holders per outcome from the Polymarket Data API.',
)
async def get_market_holders(
    market_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    outcome: str | None = Query(default=None),
) -> PaginatedHolders:
    client = PolymarketClient()
    market = await _resolve_market(client, market_id)
    condition_id = market.get('conditionId') or ''
    raw = (await client.get_holders({'market': condition_id, 'limit': limit})).json()

    holders: list[Holder] = []
    rank = 1
    for group in raw if isinstance(raw, list) else []:
        entries = group.get('holders') if isinstance(group, dict) else None
        for holder in entries if isinstance(entries, list) else []:
            if not isinstance(holder, dict):
                continue
            side = 'no' if _to_int(holder.get('outcomeIndex')) == 1 else 'yes'
            if outcome and side != outcome:
                continue
            holders.append(
                Holder(
                    rank=rank,
                    address=str(holder.get('proxyWallet') or '').lower(),
                    address_label=holder.get('name') or holder.get('pseudonym') or None,
                    shares=str(holder.get('amount') or 0),
                    side=side,
                    avg_buy_price=0.0,
                    value_usd=0.0,
                    realized_pnl_usd=0.0,
                    unrealized_pnl_usd=0.0,
                    first_buy_at='',
                )
            )
            rank += 1

    holders = holders[:limit]
    return PaginatedHolders(
        items=holders, total=len(holders), limit=limit, offset=0, has_more=False
    )


@router.get(
    '/{market_id}/trades',
    response_model=PaginatedTrades,
    status_code=200,
    operation_id='get_market_trades',
    tags=['markets'],
    summary='Get market trades',
    description='Recent trades from the Polymarket Data API.',
)
async def get_market_trades(
    market_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    side: str | None = Query(default=None),
) -> PaginatedTrades:
    client = PolymarketClient()
    market = await _resolve_market(client, market_id)
    condition_id = market.get('conditionId') or ''
    raw = (
        await client.get_trades({'market': condition_id, 'limit': limit, 'offset': offset})
    ).json()

    trades: list[Trade] = []
    for row in raw if isinstance(raw, list) else []:
        if not isinstance(row, dict):
            continue
        trade_side = 'buy' if str(row.get('side') or '').upper() == 'BUY' else 'sell'
        if side and trade_side != side:
            continue
        price = _to_float(row.get('price'))
        size = _to_float(row.get('size'))
        trades.append(
            Trade(
                tx_hash=str(row.get('transactionHash') or ''),
                time=_unix_to_iso(row.get('timestamp') or 0),
                side=trade_side,
                outcome='yes' if str(row.get('outcome') or '').lower() == 'yes' else 'no',
                price=price,
                size=size,
                value_usd=price * size,
                trader_address=str(row.get('proxyWallet') or '').lower(),
                block_number=0,
            )
        )

    return PaginatedTrades(
        items=trades, total=len(trades), limit=limit, offset=offset, has_more=False
    )


@router.get(
    '/{market_id}/sparkline',
    response_model=Sparkline,
    status_code=200,
    operation_id='get_market_sparkline',
    tags=['markets'],
    summary='Get market sparkline',
    description='Compact YES price series for the markets list mini-chart.',
)
async def get_market_sparkline(
    market_id: str,
    points: int = Query(default=30, ge=2, le=200),
    window: str | None = Query(default=None),
) -> Sparkline:
    client = PolymarketClient()
    market = await _resolve_market(client, market_id)
    token_ids = _parse_json_list(market.get('clobTokenIds'))
    values: list[float] = []
    if token_ids:
        history = (
            await client.get_prices_history_by_market({'market': token_ids[0], 'interval': '1d'})
        ).json()
        values = [point.v for point in _history_to_series(history)][-points:]
    direction = 'up' if len(values) >= 2 and values[-1] >= values[0] else 'down'
    return Sparkline(values=values, direction=direction)


@router.get(
    '/{market_id}/news',
    response_model=TopMarketsNews,
    status_code=200,
    operation_id='get_market_news',
    tags=['markets'],
    summary='Get market news',
    description='News signals for a market. News ingestion is a later phase (empty for now).',
)
async def get_market_news(
    market_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    min_relevance: float | None = Query(default=None),
) -> TopMarketsNews:
    # RSS + embeddings ingestion is a later phase; return an honest empty set.
    return TopMarketsNews(items=[], total=0)
