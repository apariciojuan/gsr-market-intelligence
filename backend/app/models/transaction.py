from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Transaction(Base):
    """TimescaleDB hypertable of decoded on-chain events (schema-only in Phase B)."""

    __tablename__ = 'transactions'
    __table_args__ = (
        Index('ix_transactions_contract_address_time', 'contract_address', 'time'),
        Index('ix_transactions_from_address_time', 'from_address', 'time'),
        Index('ix_transactions_to_address_time', 'to_address', 'time'),
        Index('ix_transactions_event_name_time', 'event_name', 'time'),
    )

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    tx_hash: Mapped[str] = mapped_column(String(66), primary_key=True)
    log_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    block_number: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    contract_id: Mapped[int | None] = mapped_column(BigInteger)
    contract_address: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    from_address: Mapped[str | None] = mapped_column(String(42), index=True)
    to_address: Mapped[str | None] = mapped_column(String(42), index=True)
    event_name: Mapped[str | None] = mapped_column(String(100), index=True)
    event_signature: Mapped[str] = mapped_column(String(66), nullable=False)
    decoded_args: Mapped[dict | None] = mapped_column(JSONB)
    value_raw: Mapped[Decimal | None] = mapped_column(Numeric(78, 0))
    value_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    gas_used: Mapped[int | None] = mapped_column(BigInteger)
    chain_id: Mapped[int] = mapped_column(Integer, nullable=False, default=137)
