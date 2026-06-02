"""``price_gap_vs_chainlink`` detector (Fase D, sheet 73 section 3).

Fires when the market's normalized probability has drifted away from the
external (Chainlink) normalized level at the end of the window by at least
``gap_min_pct``. ``direction`` follows the sign of the gap, consistent with
``chainlink_move``: a negative gap (market below the external level) is
``'market_below'``.
"""

from __future__ import annotations

from app.services.divergence.detectors import (
    DetectionContext,
    DivergenceSignal,
    severity_from_buckets,
)


class PriceGapDetector:
    """Detect a sustained gap between the market and the external level."""

    divergence_type = 'price_gap_vs_chainlink'

    def detect(self, ctx: DetectionContext) -> DivergenceSignal | None:
        """Return a signal when ``|market_norm[-1] - external_norm[-1]|`` clears the threshold."""
        if not ctx.market_norm or not ctx.external_norm:
            return None

        market_last = ctx.market_norm[-1]
        external_last = ctx.external_norm[-1]
        gap = market_last - external_last
        if abs(gap) < ctx.gap_min_pct / 100:
            return None

        magnitude_pct = abs(gap) * 100
        direction = 'market_below' if gap < 0 else 'market_above'
        return DivergenceSignal(
            severity=severity_from_buckets(magnitude_pct, ctx.severity_buckets),
            magnitude_pct=magnitude_pct,
            direction=direction,
            market_value=ctx.market_raw_last,
            external_value=external_last,
            external_source=ctx.external_source,
            time_window_minutes=ctx.time_window_minutes,
            metadata={'detector': self.divergence_type},
        )
