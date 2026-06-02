"""Pydantic schemas for the markets endpoints.

These mirror EXACTLY the frontend contract in
`frontend/app/lib/api/types.ts` (MarketListItem, MarketRead, MarketDetail,
PriceHistory, ...), which is the single source of truth for the FE↔BE shapes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

PriceInterval = Literal['1m', '1h', '4h', '1d', '1w', 'max']
VolumeDirection = Literal['up', 'down']
PriceMarkerType = Literal['news', 'oracle_proposal']


class PricePoint(BaseModel):
    t: str
    v: float


PriceSeries = list[PricePoint]


class VolumePoint(BaseModel):
    t: str
    v: float
    direction: VolumeDirection


class ChainlinkOverlay(BaseModel):
    asset_pair: str
    feed_address: str
    series: PriceSeries


class PriceMarkerNews(BaseModel):
    t: str
    type: Literal['news']
    title: str
    url: str
    source: str


class PriceMarkerOracle(BaseModel):
    t: str
    type: Literal['oracle_proposal']
    proposer_address: str
    bond_usd: float
    outcome: str


PriceMarker = PriceMarkerNews | PriceMarkerOracle


class PriceHistoryStats(BaseModel):
    min_yes: float
    max_yes: float
    avg_yes: float
    total_volume_usd: float


class PriceHistory(BaseModel):
    market_id: int
    interval: PriceInterval
    from_time: str
    to_time: str
    series_yes: PriceSeries
    series_no: PriceSeries
    volume_series: list[VolumePoint]
    chainlink_overlay: ChainlinkOverlay | None = None
    markers: list[PriceMarker]
    stats: PriceHistoryStats


class MarketListItem(BaseModel):
    id: int
    condition_id: str
    slug: str
    question: str
    category: str
    tags: list[str]
    outcomes: list[str]
    end_date: str
    volume_total: float
    liquidity: float
    active: bool
    resolved: bool


class MarketRead(BaseModel):
    id: int
    condition_id: str
    question_id: str
    slug: str
    question: str
    description: str
    category: str
    tags: list[str]
    outcomes: list[str]
    outcome_token_ids: list[str]
    market_address: str
    image_url: str
    start_date: str
    end_date: str
    resolved: bool
    active: bool
    volume_total: float
    liquidity: float
    uma_adapter_version: str
    uma_adapter_address: str
    last_synced_at: str


class MarketStats(BaseModel):
    volume_24h_usd: float
    volume_7d_usd: float
    trader_count: int
    holder_count: int
    open_interest_usd: float


class MarketOutcomePrice(BaseModel):
    price: float
    bid: float
    ask: float
    midpoint: float
    spread: float


class MarketCurrentPrices(BaseModel):
    yes: MarketOutcomePrice
    no: MarketOutcomePrice


class LinkedContract(BaseModel):
    address: str
    type: str
    name: str


class MarketDetail(BaseModel):
    market: MarketRead
    stats: MarketStats
    current_prices: MarketCurrentPrices
    linked_contracts: list[LinkedContract]
    has_chainlink_overlay: bool
    chainlink_asset_pair: str | None = None


class Sparkline(BaseModel):
    values: list[float]
    direction: str


class PaginatedMarkets(BaseModel):
    items: list[MarketListItem]
    total: int | None = None
    limit: int
    offset: int
    has_more: bool


OutcomeSide = Literal['yes', 'no']
TradeSide = Literal['buy', 'sell']


class OrderbookLevel(BaseModel):
    price: float
    size: float
    cumulative_size: float


class Orderbook(BaseModel):
    market_id: int
    outcome: OutcomeSide
    token_id: str
    midpoint: float
    spread: float
    bids: list[OrderbookLevel]
    asks: list[OrderbookLevel]
    last_updated_at: str


class Holder(BaseModel):
    rank: int
    address: str
    address_label: str | None = None
    shares: str
    side: OutcomeSide
    avg_buy_price: float
    value_usd: float
    realized_pnl_usd: float
    unrealized_pnl_usd: float
    first_buy_at: str


class PaginatedHolders(BaseModel):
    items: list[Holder]
    total: int | None = None
    limit: int
    offset: int
    has_more: bool


class Trade(BaseModel):
    tx_hash: str
    time: str
    side: TradeSide
    outcome: OutcomeSide
    price: float
    size: float
    value_usd: float
    trader_address: str
    block_number: int


class PaginatedTrades(BaseModel):
    items: list[Trade]
    total: int | None = None
    limit: int
    offset: int
    has_more: bool


class NewsItemRead(BaseModel):
    id: int
    source: str
    url: str
    title: str
    summary: str
    published_at: str
    language: str


class NewsSignalRead(BaseModel):
    relevance_score: float
    method: str


class NewsWithSignal(BaseModel):
    news: NewsItemRead
    signal: NewsSignalRead


class TopMarketsNews(BaseModel):
    items: list[NewsWithSignal]
    total: int
