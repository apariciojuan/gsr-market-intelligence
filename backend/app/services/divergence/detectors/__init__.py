"""Divergence detectors (Fase D, sheet 73 section 3).

Each detector is a small, stateless strategy that inspects a
:class:`DetectionContext` (two min-max normalized, length-aligned, ascending
series plus thresholds) and either returns a :class:`DivergenceSignal` or
``None`` when nothing fires. The :data:`DETECTORS` registry is the single
source of truth for which detectors :class:`~app.services.divergence.service.DivergenceService`
runs each cycle; the router and worker import from here.

Severity (1..5) is derived from ``magnitude_pct`` via :func:`severity_from_buckets`
over an ordered ``(threshold_pct, severity)`` ladder parsed from a settings string
by :func:`parse_severity_buckets` (with an implicit ``∞:5`` top bucket).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

# Severity is clamped to this inclusive range (DATABASE_SPEC: CHECK 1..5).
MIN_SEVERITY = 1
MAX_SEVERITY = 5


@dataclass
class DetectionContext:
    """Inputs shared by every detector for one ``(market, feed)`` evaluation.

    ``market_norm`` and ``external_norm`` are min-max normalized to ``[0, 1]`` per
    series over the window, aligned to the same length and in ascending time order
    (oldest first). ``market_raw_last`` is the market's raw implied probability
    (0..1) at the end of the window — reported as ``market_value`` so the UI shows
    a meaningful probability instead of a min-max artifact. Thresholds are
    percentages (0..100); ``severity_buckets`` is the parsed ladder used by
    :func:`severity_from_buckets`.
    """

    market_norm: list[float]
    external_norm: list[float]
    market_raw_last: float
    time_window_minutes: int
    external_source: str
    gap_min_pct: float
    ext_move_min_pct: float
    mkt_flat_max_pct: float
    severity_buckets: list[tuple[float, int]]


@dataclass
class DivergenceSignal:
    """A fired divergence, ready to persist by the service.

    ``market_value`` is the market's raw implied probability (0..1) and
    ``external_value`` is the external series' min-max normalized level (0..1) at
    the end of the window — both are 0..1 fractions the UI renders as percentages.
    ``metadata`` carries internal trace data and is never serialized by the API.
    """

    severity: int
    magnitude_pct: float
    direction: str
    market_value: float
    external_value: float
    external_source: str
    time_window_minutes: int
    metadata: dict = field(default_factory=dict)


@runtime_checkable
class DivergenceDetector(Protocol):
    """A divergence-detection strategy keyed by its ``divergence_type``."""

    divergence_type: str

    def detect(self, ctx: DetectionContext) -> DivergenceSignal | None:
        """Return a :class:`DivergenceSignal` when the divergence fires, else ``None``."""
        ...


def parse_severity_buckets(raw: str) -> list[tuple[float, int]]:
    """Parse a ``'5:1,8:2,12:3,20:4'`` ladder into ``[(threshold_pct, severity)]``.

    Each entry maps an upper magnitude threshold (percent) to a severity. The
    list is returned sorted ascending by threshold; an implicit ``(inf, 5)`` top
    bucket is always appended so any magnitude above the last threshold clamps to
    the maximum severity. Malformed entries are skipped defensively.
    """
    buckets: list[tuple[float, int]] = []
    for chunk in raw.split(','):
        chunk = chunk.strip()
        if not chunk or ':' not in chunk:
            continue
        threshold_str, severity_str = chunk.split(':', 1)
        try:
            threshold = float(threshold_str.strip())
            severity = int(severity_str.strip())
        except ValueError:
            continue
        severity = max(MIN_SEVERITY, min(MAX_SEVERITY, severity))
        buckets.append((threshold, severity))
    buckets.sort(key=lambda item: item[0])
    buckets.append((float('inf'), MAX_SEVERITY))
    return buckets


def severity_from_buckets(magnitude_pct: float, buckets: list[tuple[float, int]]) -> int:
    """Map ``magnitude_pct`` to a severity (clamped 1..5) over an ordered ladder.

    Returns the severity of the first bucket whose threshold is ``>= magnitude_pct``;
    falls back to :data:`MAX_SEVERITY` if no bucket matches.
    """
    for threshold, severity in buckets:
        if magnitude_pct <= threshold:
            return max(MIN_SEVERITY, min(MAX_SEVERITY, severity))
    return MAX_SEVERITY


# Imported after the shared types so the detector modules can import from here.
from app.services.divergence.detectors.chainlink_move import (  # noqa: E402
    ChainlinkMoveNoMarketDetector,
)
from app.services.divergence.detectors.price_gap import PriceGapDetector  # noqa: E402

# Single source of truth for the detectors the service runs each cycle.
DETECTORS: list[DivergenceDetector] = [PriceGapDetector(), ChainlinkMoveNoMarketDetector()]

__all__ = [
    'DETECTORS',
    'DetectionContext',
    'DivergenceDetector',
    'DivergenceSignal',
    'ChainlinkMoveNoMarketDetector',
    'PriceGapDetector',
    'parse_severity_buckets',
    'severity_from_buckets',
]
