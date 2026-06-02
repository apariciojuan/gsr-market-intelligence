from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PriceHistory(Base):
    """TimescaleDB hypertable with per-token outcome prices over time (CLOB)."""

    __tablename__ = 'price_history'
    __table_args__ = (
        CheckConstraint('price >= 0 AND price <= 1', name='ck_price_history_price_range'),
        Index('ix_price_history_market_time', 'market_id', 'time'),
        Index('ix_price_history_token_time', 'token_id', 'time'),
    )

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    market_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey('markets.id'), primary_key=True, index=True
    )
    token_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    outcome: Mapped[str] = mapped_column(String(50), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    bid: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    ask: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    midpoint: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    spread: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    volume_1h: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    source: Mapped[str] = mapped_column(String(50), nullable=False, default='clob')
