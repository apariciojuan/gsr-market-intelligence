"""Pydantic schemas for the dashboard endpoints.

These mirror EXACTLY the frontend contract in
`frontend/app/lib/api/types.ts` (KpiItem, DashboardActiveResolution,
DashboardSummary, TopMarketItem, TopMarketsResponse), which is the single
source of truth for the FE<->BE shapes.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.resolution import ResolutionStatus

DeltaDirection = Literal['up', 'down', 'neutral']


class KpiItem(BaseModel):
    key: str
    label: str
    value: float
    value_formatted: str
    delta_pct: float | None = None
    delta_direction: DeltaDirection


class DashboardActiveResolution(BaseModel):
    question_id: str
    market_question: str
    status: ResolutionStatus
    bond_usd: float
    ends_in_seconds: int
    challenge_deadline: str


class DashboardSummary(BaseModel):
    kpis: list[KpiItem]
    active_resolutions: list[DashboardActiveResolution]


class TopMarketItem(BaseModel):
    id: int
    slug: str
    question: str
    category: str
    price_yes: float
    price_no: float
    delta_pct_24h: float
    volume_24h_usd: float
    end_date: str
    sparkline: list[float]


class TopMarketsResponse(BaseModel):
    items: list[TopMarketItem]
    total: int
