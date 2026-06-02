"""Pydantic schemas for the resolutions endpoints.

These mirror EXACTLY the frontend contract in
`frontend/app/lib/api/types.ts` (ResolutionListItem, ResolutionDetail, ...),
which is the single source of truth for the FE↔BE shapes.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

ResolutionStatus = Literal['pending', 'proposed', 'disputed', 'resolved']
ResolutionPhase = Literal['initialized', 'proposed', 'challenge', 'dvm_vote', 'resolved']


class ResolutionListItem(BaseModel):
    id: int
    question_id: str
    market_id: int
    market_question: str
    market_slug: str
    adapter_version: str
    adapter_address: str
    status: ResolutionStatus
    proposer_address: str | None = None
    disputer_address: str | None = None
    proposed_outcome: str | None = None
    resolved_outcome: str | None = None
    bond_usd: float
    counter_bond_usd: float | None = None
    request_timestamp: str
    proposal_timestamp: str | None = None
    challenge_deadline: str | None = None
    seconds_remaining: int | None = None
    uma_oracle_url: str
    is_urgent: bool


class PaginatedResolutions(BaseModel):
    items: list[ResolutionListItem]
    total: int | None = None
    limit: int
    offset: int
    has_more: bool


class ResolutionTimelineEntry(BaseModel):
    phase: ResolutionPhase
    timestamp: str | None = None
    completed: bool
    data: dict[str, Any] | None = None
    tx_hash: str | None = None


class ResolutionDispute(BaseModel):
    disputer_address: str
    counter_bond_usd: float
    disputed_at: str
    reason: str | None = None


class PricePoint(BaseModel):
    t: str
    v: float


class ResolutionMarketImpactChart(BaseModel):
    from_time: str
    to_time: str
    price_series_yes: list[PricePoint]


class ResolutionDetail(BaseModel):
    question_id: str
    market: dict[str, Any] | None = None
    current_phase: ResolutionPhase
    is_disputed: bool
    is_resolved: bool
    resolved_outcome: str | None = None
    ancillary_data_decoded: str
    timeline: list[ResolutionTimelineEntry]
    dispute: ResolutionDispute | None = None
    market_impact_chart: ResolutionMarketImpactChart
    uma_oracle_url: str


class BondHistogramBucket(BaseModel):
    bucket: str
    count: int


class ResolutionStats(BaseModel):
    window: str
    total_resolutions: int
    disputed_count: int
    dispute_rate_pct: float
    avg_resolution_seconds: int
    bond_histogram: list[BondHistogramBucket]
