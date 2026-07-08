"""Shared category helpers for ecosystem aggregations."""

from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Any

from app.models import Market
from app.services.markets.categories import extract_market_category

OTHER_CATEGORY = 'Other'


def category_color(name: str) -> str:
    """Deterministic HSL color for a category name (stable across cycles)."""
    digest = hashlib.md5(name.lower().encode()).hexdigest()  # noqa: S324
    hue = int(digest, 16) % 360
    return f'hsl({hue}, 65%, 55%)'


def market_category(market: Market) -> str:
    """Return the display category stored on the market, deriving it if absent."""
    explicit = (market.category or '').strip()
    if explicit:
        return explicit

    derived = extract_market_category(
        {
            'category': market.category,
            'tags': market.tags,
            'question': market.question,
            'slug': market.slug,
            'description': market.description,
        }
    )
    return derived or OTHER_CATEGORY


def build_by_category(markets: list[Market]) -> tuple[Decimal, list[dict[str, Any]]]:
    """Split total volume by display category.

    ``categories`` is ordered by descending volume; each entry carries
    ``name``/``volume_usd``/``share_pct``/``color`` (matching ``EcoCategory``).
    """
    volume_by_category: dict[str, Decimal] = {}
    total = Decimal('0')
    for market in markets:
        volume = market.volume_total or Decimal('0')
        category = market_category(market)
        volume_by_category[category] = volume_by_category.get(category, Decimal('0')) + volume
        total += volume

    categories: list[dict[str, Any]] = []
    for name, volume in sorted(
        volume_by_category.items(), key=lambda item: item[1], reverse=True
    ):
        share_pct = round(float(volume / total * 100), 1) if total > 0 else 0.0
        categories.append(
            {
                'name': name,
                'volume_usd': float(volume),
                'share_pct': share_pct,
                'color': category_color(name),
            }
        )
    return total, categories
