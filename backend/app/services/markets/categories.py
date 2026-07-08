"""Market category helpers.

Gamma often leaves ``category`` empty. The UI still needs a stable, human-readable
category, so derive one from tags/text using the same coarse buckets exposed in
the frontend filters.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from typing import Any

_CATEGORY_ALIASES = {
    'politics': 'Politics',
    'sport': 'Sports',
    'sports': 'Sports',
    'crypto': 'Crypto',
    'economics': 'Economics',
    'economy': 'Economics',
    'business': 'Economics',
    'pop': 'Pop Culture',
    'pop-culture': 'Pop Culture',
    'pop culture': 'Pop Culture',
    'culture': 'Pop Culture',
    'science': 'Science',
    'technology': 'Science',
    'tech': 'Science',
}

_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        'Politics',
        (
            'president',
            'trump',
            'biden',
            'election',
            'senate',
            'congress',
            'minister',
            'government',
            'china',
            'taiwan',
            'ukraine',
            'russia',
            'war',
            'ceasefire',
            'tariff',
        ),
    ),
    (
        'Sports',
        (
            'nba',
            'nfl',
            'mlb',
            'nhl',
            'soccer',
            'football',
            'ufc',
            'fifa',
            'world cup',
            'tennis',
            'golf',
            'olympic',
        ),
    ),
    (
        'Crypto',
        (
            'bitcoin',
            'btc',
            'ethereum',
            'eth',
            'solana',
            'sol',
            'crypto',
            'token',
            'memecoin',
            'coinbase',
            'binance',
            'defi',
            'nft',
        ),
    ),
    (
        'Economics',
        (
            'fed',
            'fomc',
            'rate cut',
            'interest rate',
            'inflation',
            'cpi',
            'gdp',
            'recession',
            'unemployment',
            'stock',
            'nasdaq',
            's&p',
            'oil',
        ),
    ),
    (
        'Science',
        (
            'spacex',
            'nasa',
            'starship',
            'rocket',
            'ai',
            'openai',
            'science',
            'vaccine',
            'climate',
            'earthquake',
            'hurricane',
        ),
    ),
    (
        'Pop Culture',
        (
            'gta',
            'album',
            'song',
            'movie',
            'oscars',
            'grammy',
            'taylor swift',
            'rihanna',
            'carti',
            'celebrity',
            'netflix',
            'disney',
            'youtube',
        ),
    ),
)


def _clean_label(value: Any) -> str:
    if value is None:
        return ''
    text = str(value).strip()
    if not text:
        return ''
    return re.sub(r'[-_]+', ' ', text).strip()


def _canonical_category(value: Any) -> str:
    label = _clean_label(value)
    if not label:
        return ''
    key = label.lower()
    return _CATEGORY_ALIASES.get(key, label.title())


def _tag_labels(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except (TypeError, ValueError):
            return [text]
        return _tag_labels(parsed)
    if isinstance(value, list):
        labels: list[str] = []
        for item in value:
            labels.extend(_tag_labels(item))
        return labels
    if isinstance(value, Mapping):
        for key in ('label', 'name', 'slug'):
            label = _clean_label(value.get(key))
            if label:
                return [label]
        return []
    return [_clean_label(value)]


def _has_keyword(haystack: str, keyword: str) -> bool:
    if keyword.replace(' ', '').isalnum():
        pattern = rf'(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])'
        return re.search(pattern, haystack) is not None
    return keyword in haystack


def extract_market_category(market: Mapping[str, Any]) -> str:
    """Return a display category for a Gamma/local market payload."""
    explicit = _canonical_category(market.get('category'))
    if explicit:
        return explicit

    tags = [tag for tag in _tag_labels(market.get('tags')) if tag]
    for tag in tags:
        canonical = _canonical_category(tag)
        if canonical in {'Politics', 'Sports', 'Crypto', 'Economics', 'Pop Culture', 'Science'}:
            return canonical

    haystack = ' '.join(
        _clean_label(part)
        for part in (
            market.get('question'),
            market.get('slug'),
            market.get('description'),
            *tags,
        )
        if _clean_label(part)
    ).lower()
    for category, keywords in _KEYWORDS:
        if any(_has_keyword(haystack, keyword) for keyword in keywords):
            return category

    return 'Other'
