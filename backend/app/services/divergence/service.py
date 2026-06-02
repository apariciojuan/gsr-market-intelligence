"""Divergence calculator service (Fase D, sheet 73 section 3).

``run_once`` walks every active market, matches it to a Chainlink feed
(:class:`~app.services.divergence.feed_matcher.FeedMatcher`), pulls the market and
external series over the configured window
(:class:`~app.services.divergence.series_provider.SeriesProvider`), normalizes both
min-max and runs every detector in
:data:`~app.services.divergence.detectors.DETECTORS`. Each detector result drives a
SELECT-then-write lifecycle keyed by ``(market_id, divergence_type,
external_source)`` over the single ``status='active'`` row:

  - active row exists and the detector still fires → UPDATE the live fields
    (``last_updated_at``/``magnitude_pct``/``severity``/``market_value``/
    ``external_value``), keeping the original ``detected_at``;
  - active row exists and the detector stops firing → UPDATE ``status='closed'``;
  - no active row and the detector fires → INSERT a new ``status='active'`` row.

There is no unique constraint for the active row (per spec), so the upsert is an
explicit SELECT then INSERT/UPDATE — no ``on_conflict``. ``false_positive`` is never
written. The service is defensive: a failure on one market is logged and skipped, never
aborting the cycle.

Normalization: the market series is a probability (0..1) and the external series is
USD; each is min-max normalized to ``[0, 1]`` over the window, then both are aligned to
the same length (trailing common window, ascending). With the current data (no clean
crypto markets, shallow ``chainlink_prices``) the run will usually touch 0 divergences —
honest empty, not an error.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.config.settings import settings
from app.models import ChainlinkFeed, Divergence, Market
from app.services.chainlink_client import ChainlinkFeedDef
from app.services.divergence.detectors import (
    DETECTORS,
    DetectionContext,
    DivergenceSignal,
    parse_severity_buckets,
)
from app.services.divergence.feed_matcher import FeedMatcher
from app.services.divergence.series_provider import SeriesProvider

logger = get_logger('divergence.service')

# A detector needs at least two aligned points to evaluate a move.
MIN_POINTS = 2


def _normalize(values: list[float]) -> list[float]:
    """Min-max normalize ``values`` to ``[0, 1]`` over the window.

    A flat series (``max == min``) normalizes to all-zeros, which keeps a flat
    market correctly "flat" for the ``chainlink_move_no_market`` detector.
    """
    if not values:
        return []
    low = min(values)
    high = max(values)
    span = high - low
    if span == 0:
        return [0.0 for _ in values]
    return [(value - low) / span for value in values]


def _align(market: list[float], external: list[float]) -> tuple[list[float], list[float]]:
    """Trim both series to the same length (trailing common window, ascending)."""
    size = min(len(market), len(external))
    return market[-size:], external[-size:]


class DivergenceService:
    """Detect and persist divergences between markets and Chainlink feeds."""

    def __init__(self, series_provider: SeriesProvider, feed_matcher: FeedMatcher) -> None:
        self.series_provider = series_provider
        self.feed_matcher = feed_matcher
        self.window_minutes = settings.DIVERGENCE_WINDOW_MINUTES
        self.severity_buckets = parse_severity_buckets(settings.DIVERGENCE_SEVERITY_BUCKETS)

    async def run_once(self, session: AsyncSession) -> int:
        """Evaluate every active market once; return the number of divergences touched."""
        now = datetime.now(tz=UTC)
        frm = now - timedelta(minutes=self.window_minutes)
        touched = 0

        try:
            markets = list(
                (await session.scalars(select(Market).where(Market.active.is_(True)))).all()
            )
        except Exception:
            logger.exception('divergence_service: failed to load active markets')
            return 0

        for market in markets:
            try:
                touched += await self._process_market(session, market, frm, now)
            except Exception:
                logger.exception(
                    'divergence_service: failed to process market (id=%s)', market.id
                )
                continue

        await session.commit()
        logger.info(
            'divergence_service: touched %d divergences across %d markets',
            touched,
            len(markets),
        )
        return touched

    async def _process_market(
        self,
        session: AsyncSession,
        market: Market,
        frm: datetime,
        now: datetime,
    ) -> int:
        """Match, fetch, normalize and run detectors for one market."""
        feed_def = self.feed_matcher.match(market)
        if feed_def is None:
            return 0

        feed_id = await self._resolve_feed_id(session, feed_def)
        if feed_id is None:
            return 0

        token_id = self._yes_token_id(market)
        market_series = await self.series_provider.get_market_series(
            token_id, frm, now, settings.MARKET_PRICE_INTERVAL
        )
        external_series = await self.series_provider.get_external_series(feed_id, frm, now)
        if len(market_series) < MIN_POINTS or len(external_series) < MIN_POINTS:
            return 0

        market_norm, external_norm = _align(
            _normalize([point.v for point in market_series]),
            _normalize([point.v for point in external_series]),
        )
        if len(market_norm) < MIN_POINTS or len(external_norm) < MIN_POINTS:
            return 0

        ctx = DetectionContext(
            market_norm=market_norm,
            external_norm=external_norm,
            market_raw_last=market_series[-1].v,
            time_window_minutes=self.window_minutes,
            external_source=feed_def.asset_pair,
            gap_min_pct=settings.DIVERGENCE_GAP_MIN_PCT,
            ext_move_min_pct=settings.DIVERGENCE_EXT_MOVE_MIN_PCT,
            mkt_flat_max_pct=settings.DIVERGENCE_MKT_FLAT_MAX_PCT,
            severity_buckets=self.severity_buckets,
        )

        touched = 0
        for detector in DETECTORS:
            signal = detector.detect(ctx)
            touched += await self._apply_lifecycle(
                session, market.id, detector.divergence_type, feed_def.asset_pair, signal, now
            )
        return touched

    @staticmethod
    def _yes_token_id(market: Market) -> str:
        """The market's "Yes" ``clobTokenId`` (``outcome_token_ids[0]``), or ``''``."""
        token_ids = market.outcome_token_ids
        if isinstance(token_ids, list) and token_ids and token_ids[0]:
            return str(token_ids[0])
        return ''

    async def _resolve_feed_id(
        self, session: AsyncSession, feed_def: ChainlinkFeedDef
    ) -> int | None:
        """Map a matched ``ChainlinkFeedDef`` to its ``chainlink_feeds.id`` (or ``None``)."""
        stmt = select(ChainlinkFeed.id).where(ChainlinkFeed.feed_address == feed_def.feed_address)
        return (await session.scalars(stmt)).first()

    async def _apply_lifecycle(
        self,
        session: AsyncSession,
        market_id: int,
        divergence_type: str,
        external_source: str,
        signal: DivergenceSignal | None,
        now: datetime,
    ) -> int:
        """Run the SELECT-then-write lifecycle for one ``(market, type, source)`` key."""
        stmt = select(Divergence).where(
            Divergence.market_id == market_id,
            Divergence.divergence_type == divergence_type,
            Divergence.external_source == external_source,
            Divergence.status == 'active',
        )
        active = (await session.scalars(stmt)).first()

        if signal is not None:
            if active is None:
                session.add(self._build_row(market_id, divergence_type, signal, now))
            else:
                active.last_updated_at = now
                active.magnitude_pct = _to_decimal(signal.magnitude_pct)
                active.severity = signal.severity
                active.direction = signal.direction
                active.market_value = _to_decimal(signal.market_value)
                active.external_value = _to_decimal(signal.external_value)
                active.time_window_minutes = signal.time_window_minutes
                active.metadata_json = signal.metadata
            return 1

        if active is not None:
            active.status = 'closed'
            active.last_updated_at = now
            return 1

        return 0

    @staticmethod
    def _build_row(
        market_id: int,
        divergence_type: str,
        signal: DivergenceSignal,
        now: datetime,
    ) -> Divergence:
        """Build a fresh ``status='active'`` divergence row from a fired signal."""
        return Divergence(
            market_id=market_id,
            divergence_type=divergence_type,
            detected_at=now,
            last_updated_at=now,
            severity=signal.severity,
            magnitude_pct=_to_decimal(signal.magnitude_pct),
            direction=signal.direction,
            market_value=_to_decimal(signal.market_value),
            external_value=_to_decimal(signal.external_value),
            external_source=signal.external_source,
            time_window_minutes=signal.time_window_minutes,
            status='active',
            metadata_json=signal.metadata,
        )


def _to_decimal(value: Any) -> Decimal | None:
    """Convert a float into a ``Decimal`` for a Numeric column, or ``None``."""
    try:
        return Decimal(str(value))
    except (TypeError, ValueError):
        return None
