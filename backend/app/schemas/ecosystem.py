"""Pydantic schemas for the ecosystem endpoints.

These mirror EXACTLY the frontend contract in
`frontend/app/lib/api/types.ts` (EcosystemKpis, EcoSparkline, EcoVolume,
EcoActiveMarkets, EcoByCategory, Calibration, ActivityHeatmap, TopWallet,
PaginatedTopWallets), which is the single source of truth for the FE<->BE
shapes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.dashboard import KpiItem

EcoInterval = Literal['1d', '1w', '1m']
VolumeDirection = Literal['up', 'down']
TopWalletsOrderBy = Literal['volume', 'pnl', 'trades', 'success_rate']
CalibrationWindow = Literal['90d', '1y', 'all']


class EcosystemKpis(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kpis: list[KpiItem]


class EcoSparkline(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    values: list[float]
    direction: VolumeDirection


class EcoVolumeBucket(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    t: str
    volume_usd: float
    new_markets: int


class EcoVolume(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    interval: EcoInterval
    from_time: str
    to_time: str
    buckets: list[EcoVolumeBucket]


class EcoActiveMarketsBucket(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    t: str
    active_count: int


class EcoActiveMarkets(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    interval: EcoInterval
    buckets: list[EcoActiveMarketsBucket]


class EcoCategory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    volume_usd: float
    share_pct: float
    color: str


class EcoByCategory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    window: str
    total_volume_usd: float
    categories: list[EcoCategory]


class CalibrationMarket(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    question: str
    implied_prob_avg: float
    outcome: int
    category: str
    volume_usd: float


class CalibrationBucket(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    range: str
    predicted_avg: float
    actual_rate: float
    count: int


class Calibration(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    window: str
    category: str
    markets_count: int
    markets: list[CalibrationMarket]
    buckets: list[CalibrationBucket]
    overall_brier_score: float


class ActivityHeatmapCell(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    day: int
    hour: int
    tx_count: int


class ActivityHeatmap(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    window: str
    matrix: list[ActivityHeatmapCell]


class TopWallet(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    address: str
    address_label: str | None = None
    total_volume_usd: float
    trade_count: int
    market_count: int
    realized_pnl_usd: float
    success_rate_pct: float
    first_seen_at: str


class PaginatedTopWallets(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[TopWallet]
    total: int | None = None
    limit: int
    offset: int
    has_more: bool
