"""Market → Chainlink feed matcher (Fase D, sheet 73 section 3).

Reuses :meth:`~app.services.chainlink_client.ChainlinkClient.resolve_feed_for_market`
and :data:`~app.services.chainlink_client.CHAINLINK_FEEDS` **as-is** (whole-word
keyword match, which avoids the substring false positives such as
"Netherlands"→eth). The match text is built from the market's ``question`` and
``slug`` (plus ``tags`` when present as a list); ``category`` is **not** used (it is
NULL in the DB). This module does not touch ``chainlink_client`` and does not
reimplement the regex.

A market with no matching feed yields ``None`` and is skipped by the service. When a
match is found it is recorded in ``divergence.metadata_json`` for traceability.
"""

from __future__ import annotations

from typing import Any

from app.config.log import get_logger
from app.models import Market
from app.services.chainlink_client import ChainlinkClient, ChainlinkFeedDef

logger = get_logger('divergence.feed_matcher')


class FeedMatcher:
    """Resolve the Chainlink feed a market refers to (or ``None``)."""

    def __init__(self, client: ChainlinkClient | None = None) -> None:
        self._client = client or ChainlinkClient()

    def _build_text(self, market: Market) -> str:
        """Compose the lowercase haystack from question, slug and (list) tags."""
        parts: list[str] = [market.question or '', market.slug or '']
        tags: Any = market.tags
        if isinstance(tags, list):
            parts.extend(str(tag) for tag in tags if tag is not None)
        return ' '.join(parts).lower()

    def match(self, market: Market) -> ChainlinkFeedDef | None:
        """Return the first Chainlink feed the market maps to, or ``None``."""
        text = self._build_text(market)
        return self._client.resolve_feed_for_market(text)
