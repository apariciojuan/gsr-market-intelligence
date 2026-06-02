from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ChainlinkFeed(Base, TimestampMixin):
    """Chainlink price feed registry on Polygon (asset pair, address, decimals)."""

    __tablename__ = 'chainlink_feeds'

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    feed_address: Mapped[str] = mapped_column(String(42), nullable=False, unique=True)
    asset_pair: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    decimals: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200))
    heartbeat_seconds: Mapped[int | None] = mapped_column(Integer)
    deviation_threshold_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
