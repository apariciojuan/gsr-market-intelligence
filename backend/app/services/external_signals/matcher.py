"""Keyword extraction and relevance scoring for external signal matching."""

from __future__ import annotations

import re
from typing import Any

_STOPWORDS = frozenset(
    {
        'a',
        'an',
        'the',
        'and',
        'or',
        'of',
        'to',
        'in',
        'on',
        'for',
        'is',
        'will',
        'be',
        'by',
        'at',
        'as',
        'it',
        'this',
        'that',
        'with',
        'from',
        'before',
        'after',
        'than',
        'more',
        'less',
        'yes',
        'no',
        'market',
        'polymarket',
    }
)


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r'[a-z0-9]{3,}', (text or '').lower())
    return [t for t in tokens if t not in _STOPWORDS]


def market_keywords(market: dict[str, Any]) -> list[str]:
    """Build search keywords from slug, question/title and description."""
    parts: list[str] = []
    slug = market.get('slug') or ''
    if slug:
        parts.extend(slug.replace('-', ' ').split())
    title = market.get('question') or market.get('title') or ''
    parts.extend(_tokenize(title))
    desc = market.get('description') or ''
    parts.extend(_tokenize(desc[:500]))
    seen: set[str] = set()
    keywords: list[str] = []
    for token in parts:
        if token and token not in seen and len(token) >= 3:
            seen.add(token)
            keywords.append(token)
    return keywords[:40]


def match_score(keywords: list[str], title: str, summary: str) -> float:
    """Fraction of keywords found in title+summary (0..1)."""
    if not keywords:
        return 0.0
    haystack = f'{title} {summary}'.lower()
    hits = sum(1 for kw in keywords if kw in haystack)
    return hits / len(keywords)
