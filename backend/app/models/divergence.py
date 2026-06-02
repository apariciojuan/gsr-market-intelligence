from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Divergence(Base, TimestampMixin):
    """A detected divergence between a Polymarket market and an external signal.

    One row per active/closed divergence for a ``(market_id, divergence_type,
    external_source)`` logical key. Rows are upserted by the divergence calculator
    via SELECT-then-write: an active divergence is updated while it keeps holding,
    closed when the detector stops firing, and inserted when a new one appears.
    This is a plain table (NOT a TimescaleDB hypertable).
    """

    __tablename__ = 'divergences'
    __table_args__ = (
        Index('ix_divergences_market_detected', 'market_id', text('detected_at DESC')),
        Index(
            'ix_divergences_type_status_severity',
            'divergence_type',
            'status',
            text('severity DESC'),
        ),
        Index('ix_divergences_detected_at', text('detected_at DESC')),
        CheckConstraint('severity BETWEEN 1 AND 5', name='ck_divergences_severity'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    market_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey('markets.id'), nullable=False, index=True
    )
    divergence_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    magnitude_pct: Mapped[Decimal | None] = mapped_column(Numeric(10, 4))
    direction: Mapped[str | None] = mapped_column(String(20))
    market_value: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    external_value: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    external_source: Mapped[str | None] = mapped_column(String(100))
    time_window_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='active')
    # 'metadata' is reserved on the declarative base; map the physical column under an alias.
    metadata_json: Mapped[dict | None] = mapped_column('metadata', JSONB)
