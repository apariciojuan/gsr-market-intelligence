"""Helpers to build free social feed URLs (X and Telegram)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote_plus

from app.config.settings import settings
from app.services.external_signals.matcher import market_keywords


def _slug_terms(market: dict[str, Any]) -> list[str]:
    slug = str(market.get('slug') or '').strip()
    if not slug:
        return []
    parts = [part.strip() for part in slug.replace('_', '-').split('-') if part.strip()]
    return [part for part in parts if len(part) >= 4][:2]


def _terms_for_market(market: dict[str, Any]) -> list[str]:
    terms: list[str] = []
    for keyword in market_keywords(market):
        clean = keyword.strip()
        if len(clean) >= 3 and clean.lower() not in {'yes', 'no', 'market', 'polymarket'}:
            terms.append(clean)
    terms.extend(_slug_terms(market))
    deduped: list[str] = []
    seen: set[str] = set()
    for term in terms:
        key = term.casefold()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(term)
    return deduped[: max(1, settings.EXTERNAL_SIGNALS_X_MAX_TERMS_PER_MARKET)]


def build_social_feed_specs(market: dict[str, Any]) -> list[dict[str, str]]:
    """Return feed specs with source labels for social signals."""
    if not settings.EXTERNAL_SIGNALS_SOCIAL_ENABLED:
        return []

    specs: list[dict[str, str]] = []

    bases = settings.external_signals_x_nitter_bases()
    selected_bases = bases[: max(1, settings.EXTERNAL_SIGNALS_X_MAX_BASES)] if bases else []

    if settings.EXTERNAL_SIGNALS_X_PROFILE_ENABLED and selected_bases:
        for base in selected_bases:
            base_url = base.rstrip('/')
            for account in settings.external_signals_x_accounts():
                handle = account.lstrip('@').strip()
                if not handle:
                    continue
                specs.append(
                    {
                        'url': f'{base_url}/{handle}/rss',
                        'source': 'x_profile',
                    }
                )

    if settings.EXTERNAL_SIGNALS_X_SEARCH_ENABLED:
        if selected_bases:
            for base in selected_bases:
                base_url = base.rstrip('/')
                for term in _terms_for_market(market):
                    query = quote_plus(term)
                    specs.append(
                        {
                            'url': f'{base_url}/search/rss?f=tweets&q={query}',
                            'source': 'x_search',
                        }
                    )

    for feed in settings.external_signals_x_additional_feeds():
        specs.append({'url': feed, 'source': 'x_feed'})

    if settings.EXTERNAL_SIGNALS_TELEGRAM_ENABLED:
        for channel in settings.external_signals_telegram_channels():
            clean = channel.replace('https://t.me/', '').replace('http://t.me/', '').strip('/')
            if not clean:
                continue
            if settings.EXTERNAL_SIGNALS_TELEGRAM_SCRAPE_ENABLED:
                specs.append({'url': f'telegram://{clean}', 'source': 'telegram_scrape'})
            else:
                specs.append(
                    {
                        'url': f'https://rsshub.app/telegram/channel/{clean}',
                        'source': 'telegram_channel',
                    }
                )

    for feed in settings.external_signals_telegram_additional_feeds():
        specs.append({'url': feed, 'source': 'telegram_feed'})

    deduped: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for spec in specs:
        url = spec['url']
        if url in seen_urls:
            continue
        seen_urls.add(url)
        deduped.append(spec)
    return deduped
