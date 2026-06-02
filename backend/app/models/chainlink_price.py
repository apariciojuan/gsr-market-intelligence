from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ChainlinkPrice(Base):
    """TimescaleDB hypertable with Chainlink round answers per feed over time."""

    __tablename__ = 'chainlink_prices'
    __table_args__ = (Index('ix_chainlink_prices_feed_time', 'feed_id', 'time'),)

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    feed_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey('chainlink_feeds.id'), primary_key=True, index=True
    )
    round_id: Mapped[Decimal] = mapped_column(Numeric(78, 0), primary_key=True)
    answer_raw: Mapped[Decimal] = mapped_column(Numeric(78, 0), nullable=False)
    answer_usd: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    block_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    polled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
