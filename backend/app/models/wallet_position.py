from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WalletPosition(Base, TimestampMixin):
    """Aggregated wallet position per market outcome (schema-only in Phase B)."""

    __tablename__ = 'wallet_positions'
    __table_args__ = (
        UniqueConstraint(
            'wallet_address',
            'market_id',
            'outcome_token_id',
            name='uq_wallet_positions_wallet_market_token',
        ),
        Index('ix_wallet_positions_wallet_activity', 'wallet_address', 'last_activity_at'),
        Index('ix_wallet_positions_market_shares', 'market_id', 'shares'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    wallet_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    market_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey('markets.id'), nullable=False, index=True
    )
    outcome_token_id: Mapped[str] = mapped_column(String(80), nullable=False)
    outcome: Mapped[str] = mapped_column(String(50), nullable=False)
    shares: Mapped[Decimal] = mapped_column(Numeric(30, 6), nullable=False)
    avg_buy_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    total_bought_usd: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    total_sold_usd: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    realized_pnl_usd: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    unrealized_pnl_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
