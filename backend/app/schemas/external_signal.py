"""Pydantic schemas for external signals endpoints."""

from __future__ import annotations

from datetime import UTC

from pydantic import BaseModel, Field

from app.models import ExternalSignal


class ExternalSignalRead(BaseModel):
    id: int
    market_id: str
    slug: str
    source: str
    text: str
    title: str | None = None
    timestamp: str
    url: str
    language: str = 'en'


class PaginatedExternalSignals(BaseModel):
    items: list[ExternalSignalRead]
    total: int
    limit: int
    offset: int
    has_more: bool


class ExternalSignalsCollectRequest(BaseModel):
    market_ids: list[int] | None = Field(default=None, description='Gamma market ids')
    slugs: list[str] | None = Field(default=None, description='Market slugs')


class ExternalSignalsCollectResponse(BaseModel):
    markets_processed: int
    signals_upserted: int


def external_signal_to_read(signal: ExternalSignal) -> ExternalSignalRead:
    ts = signal.published_at.astimezone(UTC).isoformat().replace('+00:00', 'Z')
    return ExternalSignalRead(
        id=signal.id,
        market_id=str(signal.market_id),
        slug=signal.slug,
        source=signal.source,
        text=signal.text,
        title=signal.title,
        timestamp=ts,
        url=signal.url,
        language=signal.language,
    )
