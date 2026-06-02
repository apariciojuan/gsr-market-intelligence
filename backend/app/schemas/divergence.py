"""Pydantic schemas for the signals (divergences) endpoints.

These mirror EXACTLY the frontend contract in
`frontend/app/lib/api/types.ts` (DivergenceRead, SignalListItem, SignalDetail,
DivergenceCard, ...), which is the single source of truth for the FE↔BE shapes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.market import MarketRead, NewsItemRead, PricePoint

DivergenceType = Literal[
    'price_gap_vs_chainlink',
    'news_not_reflected',
    'sudden_move_no_signal',
    'chainlink_move_no_market',
]
DivergenceDirection = Literal['market_below', 'market_above']
DivergenceStatus = Literal['active', 'closed']


class DivergenceRead(BaseModel):
    id: int
    market_id: int
    divergence_type: DivergenceType
    detected_at: str
    last_updated_at: str
    severity: int
    magnitude_pct: float
    direction: DivergenceDirection
    market_value: float
    external_value: float
    external_source: str
    time_window_minutes: int
    status: DivergenceStatus


class MarketRef(BaseModel):
    id: int
    slug: str
    question: str
    category: str


class SignalMiniChart(BaseModel):
    market_series: list[PricePoint]
    external_series: list[PricePoint]


class SignalListItem(BaseModel):
    divergence: DivergenceRead
    market: MarketRef
    mini_chart_data: SignalMiniChart


class DivergenceCard(BaseModel):
    divergence: DivergenceRead
    market: MarketRef
    mini_chart_data: SignalMiniChart


class DetectionPoint(BaseModel):
    t: str
    market_value: float
    external_value: float
    magnitude_pct: float


class SignalDetail(BaseModel):
    divergence: DivergenceRead
    market: MarketRead
    market_series: list[PricePoint]
    external_series: list[PricePoint]
    detection_point: DetectionPoint
    related_news: list[NewsItemRead]


class PaginatedSignals(BaseModel):
    items: list[SignalListItem]
    total: int | None = None
    limit: int
    offset: int
    has_more: bool
