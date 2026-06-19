"""Content fingerprinting and source priority for external signal deduplication."""

from __future__ import annotations

import hashlib
import re

_TAG_RE = re.compile(r'<[^>]+>')
_WHITESPACE_RE = re.compile(r'\s+')

# Lower number = preferred when the same story appears on multiple channels.
SOURCE_PRIORITY: dict[str, int] = {
    'x_profile': 1,
    'x_search': 2,
    'telegram_scrape': 3,
    'telegram_channel': 4,
    'keyword_rss': 5,
    'resolution_source': 6,
    'x_feed': 7,
    'telegram_feed': 8,
}


def content_fingerprint(text: str) -> str:
    """Stable hash for near-duplicate detection across X / Telegram / RSS."""
    cleaned = _TAG_RE.sub(' ', text or '')
    cleaned = _WHITESPACE_RE.sub(' ', cleaned).strip().casefold()
    if len(cleaned) > 500:
        cleaned = cleaned[:500]
    if not cleaned:
        return ''
    return hashlib.sha256(cleaned.encode()).hexdigest()[:32]


def source_priority(source: str) -> int:
    return SOURCE_PRIORITY.get(source, 99)
