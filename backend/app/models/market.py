from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Market(Base, TimestampMixin):
    """Polymarket market indexed from the Gamma API (condition, outcomes, status)."""

    __tablename__ = 'markets'
    __table_args__ = (
        Index('ix_markets_active_end_date', 'active', 'end_date'),
        Index('ix_markets_category_active', 'category', 'active'),
        Index('ix_markets_tags', 'tags', postgresql_using='gin'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    condition_id: Mapped[str] = mapped_column(String(66), nullable=False, unique=True, index=True)
    question_id: Mapped[str | None] = mapped_column(String(66), index=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(100), index=True)
    tags: Mapped[dict | None] = mapped_column(JSONB)
    outcomes: Mapped[dict] = mapped_column(JSONB, nullable=False)
    outcome_token_ids: Mapped[dict] = mapped_column(JSONB, nullable=False)
    market_address: Mapped[str | None] = mapped_column(String(42), index=True)
    image_url: Mapped[str | None] = mapped_column(String(500))
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    resolved_outcome: Mapped[str | None] = mapped_column(String(50))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    volume_total: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    liquidity: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    uma_adapter_version: Mapped[str | None] = mapped_column(String(10))
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    raw_data: Mapped[dict | None] = mapped_column(JSONB)
