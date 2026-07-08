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
from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.core.database import get_session
from app.models import Market
from app.schemas.external_signal import PaginatedExternalSignals, external_signal_to_read
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
from app.services.external_signals.news_mapper import external_signals_to_news_list
from app.services.external_signals.service import ExternalSignalsService
from app.services.markets import (
    MarketsLocalStore,
    VolumeCacheStore,
    allow_local_fallback,
    extract_market_category,
    market_to_gamma_dict,
    normalize_market_tags,
    prefer_local,
)
from app.services.markets.gamma_ingest import upsert_gamma_market
from app.workers.market_volume_collector import refresh_market_volume_interval
from app.workers.queue import enqueue_market_volume_refresh

router = APIRouter()
logger = get_logger('markets')

MarketOrderBy = Literal['volume_total', 'liquidity', 'end_date', 'created_at']
SortOrder = Literal['asc', 'desc']

_GAMMA_ORDER_BY = {
    'volume_total': 'volume_num',
    'liquidity': 'liquidity_num',
    'end_date': 'endDate',
    'created_at': 'createdAt',
}


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


def _first_float(payload: dict, keys: tuple[str, ...]) -> float:
    """Return the first positive-ish numeric field found in a payload."""
    for key in keys:
        if key in payload and payload.get(key) is not None:
            return _to_float(payload.get(key))
    return 0.0


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
                    event_tags = event.get('tags')
                    event_category = event.get('category')
                    for market in event['markets']:
                        if not isinstance(market, dict):
                            continue
                        merged = dict(market)
                        if not merged.get('tags') and event_tags:
                            merged['tags'] = event_tags
                        if not merged.get('category') and event_category:
                            merged['category'] = event_category
                        markets.append(merged)
            return markets
    return []


def _to_list_item(market: dict) -> MarketListItem:
    tags = normalize_market_tags(market.get('tags'))
    return MarketListItem(
        id=_to_int(market.get('id')),
        condition_id=market.get('conditionId') or '',
        slug=market.get('slug') or '',
        question=market.get('question') or '',
        category=extract_market_category(market),
        tags=tags,
        outcomes=_parse_json_list(market.get('outcomes')),
        end_date=market.get('endDate') or '',
        volume_total=_to_float(market.get('volume')),
        liquidity=_to_float(market.get('liquidity')),
        active=bool(market.get('active')),
        resolved=bool(market.get('closed')),
    )


def _market_sort_value(market: dict, order_by: MarketOrderBy) -> Any:
    if order_by == 'volume_total':
        return _to_float(
            market.get('volume') or market.get('volumeNum') or market.get('volume_num')
        )
    if order_by == 'liquidity':
        return _to_float(
            market.get('liquidity') or market.get('liquidityNum') or market.get('liquidity_num')
        )
    if order_by == 'end_date':
        return market.get('endDate') or ''
    if order_by == 'created_at':
        return market.get('createdAt') or market.get('created_at') or ''
    return 0


def _sort_live_markets(
    markets: list[dict], *, order_by: MarketOrderBy, order: SortOrder
) -> list[dict]:
    return sorted(
        markets,
        key=lambda market: (_market_sort_value(market, order_by), _to_int(market.get('id'))),
        reverse=order == 'desc',
    )


def _to_market_read(market: dict) -> MarketRead:
    tags = normalize_market_tags(market.get('tags'))
    return MarketRead(
        id=_to_int(market.get('id')),
        condition_id=market.get('conditionId') or '',
        question_id=market.get('questionID') or '',
        slug=market.get('slug') or '',
        question=market.get('question') or '',
        description=market.get('description') or '',
        category=extract_market_category(market),
        tags=tags,
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
        holder_count=_to_int(
            market.get('holderCount') or market.get('holdersCount') or market.get('holder_count')
        ),
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
    tags = normalize_market_tags(market.get('tags'))
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


async def _fetch_clob_prices(
    client: PolymarketClient,
    market: dict,
    interval: str,
) -> tuple[list[PricePoint], list[PricePoint]]:
    """Load YES/NO CLOB history using token ids from a Gamma-shaped market dict."""
    token_ids = _parse_json_list(market.get('clobTokenIds'))
    if not token_ids:
        return [], []
    try:
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
        return series_yes, series_no
    except Exception as exc:
        logger.warning(
            'CLOB price history unavailable for market=%s (%s)',
            market.get('id'),
            exc,
        )
        return [], []


async def _list_markets_local(
    session: AsyncSession,
    *,
    limit: int,
    offset: int,
    category: str | None,
    active: bool | None,
    resolved: bool | None,
    order_by: MarketOrderBy,
    order: SortOrder,
) -> PaginatedMarkets:
    store = MarketsLocalStore(session)
    rows, total = await store.list_markets(
        limit=limit,
        offset=offset,
        category=category,
        active=active,
        resolved=resolved,
        order_by=order_by,
        order=order,
    )
    items = [_to_list_item(market_to_gamma_dict(market)) for market in rows]
    return PaginatedMarkets(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + len(rows)) < total,
    )


async def _search_markets_local(session: AsyncSession, *, q: str, limit: int) -> PaginatedMarkets:
    store = MarketsLocalStore(session)
    rows = await store.search(q, limit=limit)
    items = [_to_list_item(market_to_gamma_dict(market)) for market in rows]
    return PaginatedMarkets(
        items=items,
        total=len(items),
        limit=limit,
        offset=0,
        has_more=False,
    )


async def _resolve_market_local(session: AsyncSession, market_id: str) -> dict:
    store = MarketsLocalStore(session)
    market = await store.get_by_id(market_id)
    if market is None:
        raise HTTPException(status_code=404, detail=f'Market "{market_id}" not found.')
    return market_to_gamma_dict(market)


async def _resolve_local_db_id(
    session: AsyncSession,
    market: dict | None,
    market_id_param: str,
) -> int:
    """Map a Gamma/Polymarket id to the local ``markets.id`` used by workers/cache."""
    store = MarketsLocalStore(session)
    row = await store.get_by_id(market_id_param)
    if row is not None:
        return row.id
    row = await store.get_by_gamma_id(market_id_param)
    if row is not None:
        return row.id
    if market:
        slug = str(market.get('slug') or '').strip()
        if slug:
            row = await store.get_by_slug(slug)
            if row is not None:
                return row.id
        condition_id = str(market.get('conditionId') or market.get('condition_id') or '').strip()
        if condition_id:
            row = await store.get_by_condition_id(condition_id)
            if row is not None:
                return row.id
    return _to_int(market.get('id') if market else market_id_param)


async def _load_market_row(
    session: AsyncSession, market_id: str
) -> tuple[Market | None, MarketsLocalStore]:
    store = MarketsLocalStore(session)
    row = await store.get_by_id(market_id)
    if row is None:
        row = await store.get_by_gamma_id(market_id)
    return row, store


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
    order_by: Annotated[MarketOrderBy, Query()] = 'volume_total',
    order: Annotated[SortOrder, Query()] = 'desc',
    session: AsyncSession = Depends(get_session),
) -> PaginatedMarkets:
    if prefer_local():
        return await _list_markets_local(
            session,
            limit=limit,
            offset=offset,
            category=category,
            active=active,
            resolved=resolved,
            order_by=order_by,
            order=order,
        )
    try:
        client = PolymarketClient()
        query_params: dict[str, Any] = {
            'limit': limit,
            'offset': offset,
            'include_tag': 'true',
            'order': _GAMMA_ORDER_BY[order_by],
            'ascending': str(order == 'asc').lower(),
        }
        if resolved is not None:
            query_params['closed'] = str(resolved).lower()
        response = await client.get_markets(query_params=query_params)
        markets = _extract_markets(response.json())
        fetched_count = len(markets)

        if category:
            wanted = category.lower()
            markets = [
                market
                for market in markets
                if extract_market_category(market).lower() == wanted
            ]
        if active is not None:
            markets = [market for market in markets if bool(market.get('active')) == active]
        if resolved is not None:
            markets = [market for market in markets if bool(market.get('closed')) == resolved]

        markets = _sort_live_markets(markets, order_by=order_by, order=order)
        items = [_to_list_item(market) for market in markets]

        return PaginatedMarkets(
            items=items,
            total=None,
            limit=limit,
            offset=offset,
            has_more=fetched_count >= limit,
        )
    except Exception as exc:
        if not allow_local_fallback():
            raise
        logger.warning('Polymarket unavailable (%s), falling back to local markets cache', exc)
        return await _list_markets_local(
            session,
            limit=limit,
            offset=offset,
            category=category,
            active=active,
            resolved=resolved,
            order_by=order_by,
            order=order,
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
    session: AsyncSession = Depends(get_session),
) -> PaginatedMarkets:
    if prefer_local():
        return await _search_markets_local(session, q=q, limit=limit)
    try:
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
    except Exception as exc:
        if not allow_local_fallback():
            raise
        logger.warning('Polymarket search unavailable (%s), falling back to local cache', exc)
        return await _search_markets_local(session, q=q, limit=limit)


@router.get(
    '/{slug}',
    response_model=MarketDetail,
    status_code=200,
    operation_id='get_market_detail',
    tags=['markets'],
    summary='Get market detail by slug',
    description='Market detail with stats, current prices and Chainlink overlay flag.',
)
async def get_market_detail(
    slug: str,
    session: AsyncSession = Depends(get_session),
) -> MarketDetail:
    market: dict | None = None
    fetched_live = False
    if prefer_local():
        store = MarketsLocalStore(session)
        row = await store.get_by_slug(slug)
        if row is None:
            raise HTTPException(status_code=404, detail=f'Market "{slug}" not found.')
        market = market_to_gamma_dict(row)
    else:
        try:
            client = PolymarketClient()
            response = await client.get_market_by_slug(
                market_slug=slug,
                query_params={'include_tag': 'true'},
            )
            market = _first_market(response.json())
            fetched_live = market is not None
        except Exception as exc:
            if not allow_local_fallback():
                raise
            logger.warning('Polymarket detail unavailable (%s), falling back to local cache', exc)
            store = MarketsLocalStore(session)
            row = await store.get_by_slug(slug)
            if row is None:
                raise HTTPException(
                    status_code=404, detail=f'Market "{slug}" not found.'
                ) from exc
            market = market_to_gamma_dict(row)

    if market is None:
        raise HTTPException(status_code=404, detail=f'Market "{slug}" not found.')

    if fetched_live and not prefer_local():
        local_row = await upsert_gamma_market(session, market)
        if local_row is not None:
            market['id'] = local_row.id
            await session.commit()

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
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    interval: str = Query(default='1d'),
    include_chainlink: bool = Query(default=True),
) -> PriceHistory:
    market: dict | None = None
    series_yes: list[PricePoint] = []
    series_no: list[PricePoint] = []
    fetched_live = False
    local_row, store = await _load_market_row(session, market_id)

    if prefer_local():
        market = await _resolve_market_local(session, market_id)
        mid = _to_int(market.get('id'))
        series_yes = await store.get_price_series(mid, 'Yes', interval=interval)
        series_no = await store.get_price_series(mid, 'No', interval=interval)
    else:
        client = PolymarketClient()
        if local_row is not None:
            market = market_to_gamma_dict(local_row)
            series_yes, series_no = await _fetch_clob_prices(client, market, interval)
            if not series_yes and allow_local_fallback():
                series_yes = await store.get_price_series(local_row.id, 'Yes', interval=interval)
                series_no = await store.get_price_series(local_row.id, 'No', interval=interval)
        else:
            try:
                response = await client.get_market_by_id(
                    market_id=market_id,
                    query_params={'include_tag': 'true'},
                )
                market = _first_market(response.json())
                if market is None:
                    raise HTTPException(
                        status_code=404, detail=f'Market "{market_id}" not found.'
                    )
                fetched_live = True
                series_yes, series_no = await _fetch_clob_prices(client, market, interval)
            except HTTPException:
                raise
            except Exception as exc:
                if not allow_local_fallback():
                    raise
                logger.warning(
                    'Polymarket prices unavailable (%s), falling back to local cache',
                    exc,
                )
                market = await _resolve_market_local(session, market_id)
                mid = _to_int(market.get('id'))
                series_yes = await store.get_price_series(mid, 'Yes', interval=interval)
                series_no = await store.get_price_series(mid, 'No', interval=interval)

        if not series_yes and allow_local_fallback() and local_row is None:
            try:
                local_market = await _resolve_market_local(session, market_id)
                mid = _to_int(local_market.get('id'))
                local_yes = await store.get_price_series(mid, 'Yes', interval=interval)
                if local_yes:
                    market = local_market
                    series_yes = local_yes
                    if not series_no:
                        series_no = await store.get_price_series(mid, 'No', interval=interval)
            except HTTPException:
                pass

    if market is None:
        raise HTTPException(status_code=404, detail=f'Market "{market_id}" not found.')

    if fetched_live and not prefer_local():
        local_row = await upsert_gamma_market(session, market)
        if local_row is not None:
            market['id'] = local_row.id
            await session.commit()

    volume_cache = VolumeCacheStore(session)
    cache_market_id = await _resolve_local_db_id(session, market, market_id)
    volume_series, total_volume = await volume_cache.get_volume_series(cache_market_id, interval)
    if not volume_series:
        volume_market = await store.get_by_id(cache_market_id)
        if volume_market is not None:
            try:
                refreshed = await refresh_market_volume_interval(
                    session,
                    volume_market,
                    interval,
                    cache=volume_cache,
                    local_store=store,
                    gamma_market=market,
                )
                if refreshed:
                    await session.commit()
                    volume_series, total_volume = await volume_cache.get_volume_series(
                        cache_market_id, interval
                    )
            except Exception as exc:
                await session.rollback()
                logger.warning(
                    'On-demand volume refresh failed for market_id=%s interval=%s (%s)',
                    cache_market_id,
                    interval,
                    exc,
                )
        if not volume_series:
            background_tasks.add_task(enqueue_market_volume_refresh, cache_market_id)

    yes_values = [point.v for point in series_yes]
    stats = PriceHistoryStats(
        min_yes=min(yes_values) if yes_values else 0.0,
        max_yes=max(yes_values) if yes_values else 0.0,
        avg_yes=sum(yes_values) / len(yes_values) if yes_values else 0.0,
        total_volume_usd=total_volume,
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
        market_id=cache_market_id,
        interval=interval,
        from_time=from_time,
        to_time=to_time,
        series_yes=series_yes,
        series_no=series_no,
        volume_series=volume_series,
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


def _holder_side(holder: dict, group: dict) -> str:
    outcome_index = holder.get('outcomeIndex', group.get('outcomeIndex'))
    if outcome_index is not None:
        return 'no' if _to_int(outcome_index) == 1 else 'yes'
    outcome = str(holder.get('outcome') or group.get('outcome') or '').strip().lower()
    return 'no' if outcome == 'no' else 'yes'


def _holder_address(holder: dict) -> str:
    return str(
        holder.get('proxyWallet')
        or holder.get('address')
        or holder.get('wallet')
        or holder.get('user')
        or ''
    ).lower()


async def _resolve_market(
    client: PolymarketClient, market_id: str, session: AsyncSession | None = None
) -> dict:
    """Resolve a Gamma-shaped market dict from local DB id, gamma id, or live API."""
    if session is not None:
        local_row, _store = await _load_market_row(session, market_id)
        if local_row is not None:
            return market_to_gamma_dict(local_row)

    try:
        market = _first_market(
            (
                await client.get_market_by_id(
                    market_id=market_id,
                    query_params={'include_tag': 'true'},
                )
            ).json()
        )
        if market is not None:
            if session is not None and not prefer_local():
                local_row = await upsert_gamma_market(session, market)
                if local_row is not None:
                    market['id'] = local_row.id
                    await session.commit()
            return market
    except Exception as exc:
        if session is None or not allow_local_fallback():
            raise
        logger.warning('Polymarket resolve unavailable (%s), falling back to local cache', exc)
        return await _resolve_market_local(session, market_id)
    raise HTTPException(status_code=404, detail=f'Market "{market_id}" not found.')


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
    session: AsyncSession = Depends(get_session),
) -> Orderbook:
    if prefer_local():
        market = await _resolve_market_local(session, market_id)
        prices = _to_current_prices(market)
        selected = prices.no if outcome == 'no' else prices.yes
        return Orderbook(
            market_id=_to_int(market.get('id')),
            outcome='no' if outcome == 'no' else 'yes',
            token_id='',
            midpoint=selected.midpoint,
            spread=selected.spread,
            bids=[],
            asks=[],
            last_updated_at=_now_iso(),
        )
    try:
        client = PolymarketClient()
        market = await _resolve_market(client, market_id, session)
        token_ids = _parse_json_list(market.get('clobTokenIds'))
        index = 1 if outcome == 'no' else 0
        token = (
            token_ids[index] if len(token_ids) > index else (token_ids[0] if token_ids else None)
        )
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
    except HTTPException:
        raise
    except Exception as exc:
        if not allow_local_fallback():
            raise
        logger.warning('Polymarket orderbook unavailable (%s), returning cached snapshot', exc)
        market = await _resolve_market_local(session, market_id)
        prices = _to_current_prices(market)
        selected = prices.no if outcome == 'no' else prices.yes
        return Orderbook(
            market_id=_to_int(market.get('id')),
            outcome='no' if outcome == 'no' else 'yes',
            token_id='',
            midpoint=selected.midpoint,
            spread=selected.spread,
            bids=[],
            asks=[],
            last_updated_at=_now_iso(),
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
    session: AsyncSession = Depends(get_session),
) -> PaginatedHolders:
    selected_outcome = outcome.lower() if outcome else None
    if selected_outcome is not None and selected_outcome not in {'yes', 'no'}:
        raise HTTPException(status_code=422, detail='outcome must be "yes" or "no".')
    if prefer_local():
        return PaginatedHolders(items=[], total=0, limit=limit, offset=0, has_more=False)
    try:
        client = PolymarketClient()
        market = await _resolve_market(client, market_id, session)
        condition_id = market.get('conditionId') or ''
        raw = (await client.get_holders({'market': condition_id, 'limit': limit})).json()
        prices = _to_current_prices(market)
        side_prices = {'yes': prices.yes.price, 'no': prices.no.price}

        rows: list[dict[str, Any]] = []
        for group in raw if isinstance(raw, list) else []:
            entries = group.get('holders') if isinstance(group, dict) else None
            for holder in entries if isinstance(entries, list) else []:
                if not isinstance(holder, dict):
                    continue
                side = _holder_side(holder, group)
                if selected_outcome and side != selected_outcome:
                    continue
                address = _holder_address(holder)
                if not address:
                    continue
                shares = _first_float(holder, ('amount', 'shares', 'balance'))
                value_usd = _first_float(
                    holder,
                    ('value_usd', 'valueUsd', 'current_value_usd', 'currentValueUsd', 'value'),
                )
                if value_usd == 0.0:
                    value_usd = shares * side_prices[side]
                rows.append(
                    {
                        'address': address,
                        'address_label': holder.get('name') or holder.get('pseudonym') or None,
                        'shares': str(holder.get('amount') or holder.get('shares') or 0),
                        'shares_num': shares,
                        'side': side,
                        'avg_buy_price': _first_float(
                            holder,
                            ('avg_buy_price', 'avgBuyPrice', 'avgPrice', 'averagePrice'),
                        ),
                        'value_usd': value_usd,
                        'realized_pnl_usd': _first_float(
                            holder, ('realized_pnl_usd', 'realizedPnlUsd', 'realizedPnl')
                        ),
                        'unrealized_pnl_usd': _first_float(
                            holder,
                            ('unrealized_pnl_usd', 'unrealizedPnlUsd', 'unrealizedPnl'),
                        ),
                        'first_buy_at': str(
                            holder.get('first_buy_at')
                            or holder.get('firstBuyAt')
                            or holder.get('firstTradeAt')
                            or ''
                        ),
                    }
                )

        rows.sort(key=lambda row: (row['value_usd'], row['shares_num']), reverse=True)
        holders = [
            Holder(
                rank=rank,
                address=row['address'],
                address_label=row['address_label'],
                shares=row['shares'],
                side=row['side'],
                avg_buy_price=row['avg_buy_price'],
                value_usd=row['value_usd'],
                realized_pnl_usd=row['realized_pnl_usd'],
                unrealized_pnl_usd=row['unrealized_pnl_usd'],
                first_buy_at=row['first_buy_at'],
            )
            for rank, row in enumerate(rows[:limit], start=1)
        ]
        return PaginatedHolders(
            items=holders, total=len(holders), limit=limit, offset=0, has_more=False
        )
    except HTTPException:
        raise
    except Exception as exc:
        if not allow_local_fallback():
            raise
        logger.warning('Polymarket holders unavailable (%s), returning empty list', exc)
        return PaginatedHolders(items=[], total=0, limit=limit, offset=0, has_more=False)


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
    session: AsyncSession = Depends(get_session),
) -> PaginatedTrades:
    if prefer_local():
        return PaginatedTrades(items=[], total=0, limit=limit, offset=offset, has_more=False)
    try:
        client = PolymarketClient()
        market = await _resolve_market(client, market_id, session)
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
    except HTTPException:
        raise
    except Exception as exc:
        if not allow_local_fallback():
            raise
        logger.warning('Polymarket trades unavailable (%s), returning empty list', exc)
        return PaginatedTrades(items=[], total=0, limit=limit, offset=offset, has_more=False)


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
    session: AsyncSession = Depends(get_session),
) -> Sparkline:
    values: list[float] = []
    if prefer_local():
        store = MarketsLocalStore(session)
        mid = _to_int(market_id)
        series = await store.get_price_series(mid, 'Yes', interval='1d')
        values = [point.v for point in series][-points:]
    else:
        try:
            client = PolymarketClient()
            market = await _resolve_market(client, market_id, session)
            token_ids = _parse_json_list(market.get('clobTokenIds'))
            if token_ids:
                history = (
                    await client.get_prices_history_by_market(
                        {'market': token_ids[0], 'interval': '1d'}
                    )
                ).json()
                values = [point.v for point in _history_to_series(history)][-points:]
        except Exception as exc:
            if not allow_local_fallback():
                raise
            logger.warning(
                'Polymarket sparkline unavailable (%s), falling back to local cache', exc
            )
            store = MarketsLocalStore(session)
            mid = _to_int(market_id)
            series = await store.get_price_series(mid, 'Yes', interval='1d')
            values = [point.v for point in series][-points:]
    direction = 'up' if len(values) >= 2 and values[-1] >= values[0] else 'down'
    return Sparkline(values=values, direction=direction)


@router.get(
    '/{market_id}/external-signals',
    response_model=PaginatedExternalSignals,
    operation_id='get_market_external_signals',
    tags=['markets'],
    summary='List external signals for a market',
)
async def get_market_external_signals(
    market_id: str,
    source: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> PaginatedExternalSignals:
    mid = _to_int(market_id)
    service = ExternalSignalsService(session)
    items, total = await service.list_signals(
        market_id=mid,
        source=source,
        limit=limit,
        offset=offset,
    )
    reads = [external_signal_to_read(item) for item in items]
    return PaginatedExternalSignals(
        items=reads,
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + len(reads)) < total,
    )


@router.get(
    '/{market_id}/news',
    response_model=TopMarketsNews,
    status_code=200,
    operation_id='get_market_news',
    tags=['markets'],
    summary='Get market news',
    description='News mapped from persisted external_signals (RSS / resolution_source).',
)
async def get_market_news(
    market_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    min_relevance: float | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> TopMarketsNews:
    mid = _to_int(market_id)
    service = ExternalSignalsService(session)
    signals = await service.list_for_market_news(mid, limit=limit)
    items = external_signals_to_news_list(signals, min_relevance=min_relevance)
    return TopMarketsNews(items=items, total=len(items))
