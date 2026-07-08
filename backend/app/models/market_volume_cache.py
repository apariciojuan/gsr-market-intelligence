from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MarketVolumeCache(Base, TimestampMixin):
    """Pre-aggregated per-market volume buckets keyed by chart interval."""

    __tablename__ = 'market_volume_cache'
    __table_args__ = (
        UniqueConstraint('market_id', 'interval', name='uq_market_volume_cache_market_interval'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    market_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey('markets.id'), nullable=False, index=True
    )
    interval: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    buckets: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    total_volume_usd: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False, default=0)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
