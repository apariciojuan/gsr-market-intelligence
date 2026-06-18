"""RSS/Atom fetch and parse helpers."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urljoin

import feedparser
import httpx

from app.config.log import get_logger

logger = get_logger('external_signals.rss')

_RSS_URL_HINT = re.compile(r'\.(rss|xml|atom)(?:\?|$)', re.I)


def looks_like_feed_url(url: str) -> bool:
    return bool(_RSS_URL_HINT.search(url)) or 'feed' in url.lower()


async def discover_feed_url(page_url: str, timeout: float) -> str | None:
    """Try to find an RSS link in an HTML page."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(page_url, headers={'User-Agent': 'GSR-MI/0.1'})
            response.raise_for_status()
            html = response.text[:100_000]
    except Exception as exc:  # noqa: BLE001
        logger.debug('HTML fetch failed for %s: %s', page_url, exc)
        return None

    match = re.search(
        r'<link[^>]+type=["\']application/(?:rss\+xml|atom\+xml)["\'][^>]*href=["\']([^"\']+)["\']',
        html,
        re.I,
    )
    if match:
        return urljoin(page_url, match.group(1))
    return None


def _entry_published(entry: Any) -> datetime:
    if getattr(entry, 'published_parsed', None):
        try:
            return datetime(*entry.published_parsed[:6], tzinfo=UTC)
        except (TypeError, ValueError):
            pass
    if getattr(entry, 'updated_parsed', None):
        try:
            return datetime(*entry.updated_parsed[:6], tzinfo=UTC)
        except (TypeError, ValueError):
            pass
    published = getattr(entry, 'published', None) or getattr(entry, 'updated', None)
    if published:
        try:
            dt = parsedate_to_datetime(published)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt
        except (TypeError, ValueError):
            pass
    return datetime.now(UTC)


async def fetch_feed_entries(feed_url: str, timeout: float) -> list[dict[str, Any]]:
    """Download and parse a feed; returns normalized entry dicts."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(feed_url, headers={'User-Agent': 'GSR-MI/0.1'})
            response.raise_for_status()
            content = response.content
    except Exception as exc:  # noqa: BLE001
        logger.warning('RSS fetch failed %s: %s', feed_url, exc)
        return []

    parsed = await asyncio.to_thread(feedparser.parse, content)
    entries: list[dict[str, Any]] = []
    for entry in parsed.entries[:100]:
        title = (entry.get('title') or '').strip()
        link = (entry.get('link') or '').strip()
        summary = (entry.get('summary') or entry.get('description') or '').strip()
        if not link:
            continue
        text = summary or title
        if not text:
            continue
        entries.append(
            {
                'title': title,
                'url': link,
                'text': text[:8000],
                'published_at': _entry_published(entry),
                'feed_url': feed_url,
            }
        )
    return entries
