"""Markets data-source selection (live Polymarket API vs local PostgreSQL cache)."""

from __future__ import annotations

from app.config.settings import settings


def markets_source() -> str:
    return (settings.MARKETS_DATA_SOURCE or 'auto').strip().lower()


def prefer_local() -> bool:
    return markets_source() == 'local'


def allow_local_fallback() -> bool:
    return markets_source() in ('auto', 'local')
