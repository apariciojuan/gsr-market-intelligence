"""``chainlink_move_no_market`` detector (Fase D, sheet 73 section 3).

Fires when the external (Chainlink) normalized series moved meaningfully over the
window (``ext_move >= ext_move_min_pct``) while the market stayed essentially flat
(``mkt_move <= mkt_flat_max_pct``): the external signal moved but the market did
not react. ``direction`` is derived from the end-of-window levels
(``'market_below'`` when the external level is above the market), consistent with
``price_gap``.
"""

from __future__ import annotations

from app.services.divergence.detectors import (
    DetectionContext,
    DivergenceSignal,
    severity_from_buckets,
)


class ChainlinkMoveNoMarketDetector:
    """Detect an external move the market failed to follow."""

    divergence_type = 'chainlink_move_no_market'

    def detect(self, ctx: DetectionContext) -> DivergenceSignal | None:
        """Return a signal when the external series moved but the market stayed flat."""
        if len(ctx.market_norm) < 2 or len(ctx.external_norm) < 2:  # noqa: PLR2004
            return None

        ext_move = abs(ctx.external_norm[-1] - ctx.external_norm[0])
        mkt_move = abs(ctx.market_norm[-1] - ctx.market_norm[0])
        if ext_move < ctx.ext_move_min_pct / 100 or mkt_move > ctx.mkt_flat_max_pct / 100:
            return None

        market_last = ctx.market_norm[-1]
        external_last = ctx.external_norm[-1]
        magnitude_pct = ext_move * 100
        direction = 'market_below' if external_last > market_last else 'market_above'
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
