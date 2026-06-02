from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class EcosystemMetric(Base, TimestampMixin):
    """Append-only snapshot of an aggregated ecosystem metric.

    Each aggregation cycle appends one row per ``metric_key`` with the computed
    ``metric_value`` and an optional ``metric_metadata`` payload (formatting hints,
    category breakdowns, ...). Keeping the history of snapshots enables real deltas
    (current vs previous) and sparklines (the series of snapshots over time).
    """

    __tablename__ = 'ecosystem_metrics'
    __table_args__ = (Index('ix_ecosystem_metrics_key_computed', 'metric_key', 'computed_at'),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    metric_value: Mapped[Decimal] = mapped_column(Numeric(30, 6), nullable=False)
    metric_metadata: Mapped[dict | None] = mapped_column(JSONB)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
