"""Collect external signals for a list of market dicts (no DB required)."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from app.config.log import get_logger
from app.config.settings import settings
from app.services.external_signals.dedup import content_fingerprint, source_priority
from app.services.external_signals.matcher import market_keywords, match_score
from app.services.external_signals.rss import (
    discover_feed_url,
    fetch_feed_entries,
    looks_like_feed_url,
)
from app.services.external_signals.social import build_social_feed_specs
from app.services.external_signals.telegram_scraper import fetch_telegram_channel_entries

logger = get_logger('external_signals.collector')


def _normalize_market(market: dict[str, Any]) -> dict[str, Any]:
    """Coerce pandas/JSON field types (NaN floats) into strings for matching."""
    out = dict(market)
    for field in ('resolution_source', 'description', 'title', 'question', 'slug'):
        val = out.get(field)
        if val is None:
            continue
        if isinstance(val, float) and val != val:  # NaN
            out[field] = None
        elif not isinstance(val, str):
            out[field] = str(val)
    return out


def _parquet_row(market_id: str, source: str, text: str, published_at: datetime, url: str) -> dict:
    ts = published_at.astimezone(UTC).isoformat().replace('+00:00', 'Z')
    return {
        'market_id': market_id,
        'source': source,
        'text': text,
        'timestamp': ts,
        'url': url,
    }


async def _resolve_feed_urls(resolution_source: str | None, timeout: float) -> list[str]:
    if not resolution_source:
        return []
    url = str(resolution_source).strip()
    if not url or url.lower() == 'nan':
        return []
    if looks_like_feed_url(url):
        return [url]
    discovered = await discover_feed_url(url, timeout)
    return [discovered] if discovered else []


async def collect_signals_for_markets(
    markets: list[dict[str, Any]],
    *,
    global_feeds: list[str] | None = None,
    max_age_days: int | None = None,
    min_match_score: float | None = None,
    max_per_market: int | None = None,
    request_delay: float | None = None,
) -> list[dict[str, str]]:
    """Fetch RSS feeds and match entries to markets; returns parquet-shaped rows."""
    if not settings.EXTERNAL_SIGNALS_ENABLED and global_feeds is None:
        return []

    timeout = float(settings.EXTERNAL_SIGNALS_RSS_TIMEOUT_SECONDS)
    max_age = max_age_days if max_age_days is not None else settings.EXTERNAL_SIGNALS_MAX_AGE_DAYS
    min_score = (
        min_match_score if min_match_score is not None else settings.EXTERNAL_SIGNALS_MIN_MATCH_SCORE
    )
    cap = max_per_market if max_per_market is not None else settings.EXTERNAL_SIGNALS_MAX_PER_MARKET
    delay = (
        request_delay
        if request_delay is not None
        else settings.EXTERNAL_SIGNALS_REQUEST_DELAY_SECONDS
    )
    feeds = list(global_feeds if global_feeds is not None else settings.external_signals_global_feed_list())
    cutoff = datetime.now(UTC) - timedelta(days=max_age)

    feed_cache: dict[str, list[dict[str, Any]]] = {}
    rows: list[dict[str, str]] = []
    seen_urls: set[tuple[str, str]] = set()
    seen_fingerprints: set[tuple[str, str]] = set()

    async def load_feed(feed_url: str) -> list[dict[str, Any]]:
        if feed_url in feed_cache:
            return feed_cache[feed_url]
        if feed_url.startswith('telegram://'):
            channel = feed_url.replace('telegram://', '', 1)
            entries = await fetch_telegram_channel_entries(
                channel,
                timeout=timeout,
                max_age_days=max_age,
                max_posts=settings.EXTERNAL_SIGNALS_TELEGRAM_SCRAPE_MAX_POSTS_PER_CHANNEL,
            )
        else:
            entries = await fetch_feed_entries(feed_url, timeout)
        feed_cache[feed_url] = entries
        await asyncio.sleep(delay)
        return entries

    for feed_url in feeds:
        await load_feed(feed_url)

    for raw_market in markets:
        market = _normalize_market(raw_market)
        market_id = str(market.get('market_id') or market.get('id') or '')
        if not market_id:
            continue
        keywords = market_keywords(market)
        market_feed_specs = [{'url': feed_url, 'source': 'keyword_rss'} for feed_url in feeds]
        social_feed_specs = build_social_feed_specs(market)
        market_feed_specs.extend(social_feed_specs)
        res_src = market.get('resolution_source')
        for extra in await _resolve_feed_urls(res_src, timeout):
            if not any(spec['url'] == extra for spec in market_feed_specs):
                market_feed_specs.append({'url': extra, 'source': 'resolution_source'})
            await asyncio.sleep(delay)

        matched: list[tuple[float, dict[str, Any], str]] = []

        for spec in market_feed_specs:
            feed_url = spec['url']
            source = spec['source']
            for entry in await load_feed(feed_url):
                if entry['published_at'] < cutoff:
                    continue
                score = match_score(keywords, entry.get('title', ''), entry.get('text', ''))
                if score < min_score:
                    continue
                matched.append((score, entry, source))

        matched.sort(key=lambda item: (item[0], -source_priority(item[2])), reverse=True)
        count = 0
        for score, entry, source in matched:
            url = entry['url']
            title = entry.get('title') or ''
            text = entry.get('text') or title
            fingerprint = content_fingerprint(text)
            if not fingerprint:
                continue
            fp_key = (market_id, fingerprint)
            if fp_key in seen_fingerprints:
                continue
            url_key = (market_id, url)
            if url_key in seen_urls:
                continue
            seen_fingerprints.add(fp_key)
            seen_urls.add(url_key)
            rows.append(
                {
                    **_parquet_row(market_id, source, text, entry['published_at'], url),
                    '_match_score': score,
                    '_matched_by': source,
                    '_content_fingerprint': fingerprint,
                }
            )
            count += 1
            if count >= cap:
                break

    logger.info('Collected %d external signal rows for %d markets', len(rows), len(markets))
    return rows
