"""Lightweight Telegram public channel scraping via t.me/s pages."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

import httpx

from app.config.log import get_logger

logger = get_logger('external_signals.telegram_scraper')

_MESSAGE_BLOCK_RE = re.compile(
    r'<div class="tgme_widget_message[^"]*"[\s\S]*?</div>\s*</div>\s*</div>',
    re.I,
)
_DATETIME_RE = re.compile(r'<time[^>]*datetime="([^"]+)"', re.I)
_LINK_RE = re.compile(r'<a class="tgme_widget_message_date" href="([^"]+)"', re.I)
_TEXT_RE = re.compile(r'<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)</div>', re.I)
_TAG_RE = re.compile(r'<[^>]+>')
_WHITESPACE_RE = re.compile(r'\s+')


def _clean_html_text(raw: str) -> str:
    no_tags = _TAG_RE.sub(' ', raw)
    return _WHITESPACE_RE.sub(' ', no_tags).strip()


def _parse_datetime(value: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


async def fetch_telegram_channel_entries(
    channel: str,
    *,
    timeout: float,
    max_age_days: int,
    max_posts: int,
) -> list[dict]:
    channel = channel.strip().replace('https://t.me/', '').replace('http://t.me/', '').strip('/')
    if not channel:
        return []

    url = f'https://t.me/s/{channel}'
    cutoff = datetime.now(UTC) - timedelta(days=max_age_days)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, headers={'User-Agent': 'GSR-MI/0.2'})
            response.raise_for_status()
            html = response.text
    except Exception as exc:  # noqa: BLE001
        logger.warning('Telegram scrape failed %s: %s', channel, exc)
        return []

    entries: list[dict] = []
    for block in _MESSAGE_BLOCK_RE.findall(html):
        dt_match = _DATETIME_RE.search(block)
        if not dt_match:
            continue
        published_at = _parse_datetime(dt_match.group(1))
        if published_at is None or published_at < cutoff:
            continue

        link_match = _LINK_RE.search(block)
        msg_url = link_match.group(1) if link_match else url

        text_match = _TEXT_RE.search(block)
        text = _clean_html_text(text_match.group(1)) if text_match else ''
        if not text:
            continue

        entries.append(
            {
                'title': f'telegram:{channel}',
                'url': msg_url,
                'text': text[:8000],
                'published_at': published_at,
                'feed_url': f'telegram://{channel}',
            }
        )
        if len(entries) >= max_posts:
            break
    return entries
