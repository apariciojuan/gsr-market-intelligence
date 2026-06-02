from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SyncState(Base, TimestampMixin):
    """Shared checkpoint table for every ingestion worker.

    Each worker reads/creates its row by ``(entity_type, entity_key)``, processes
    from ``last_block_processed`` / ``last_timestamp_processed`` and, on completion,
    updates the checkpoint plus ``total_items_processed`` and ``sync_status``.
    """

    __tablename__ = 'sync_state'
    __table_args__ = (
        UniqueConstraint('entity_type', 'entity_key', name='uq_sync_state_entity'),
        Index('ix_sync_state_type_status', 'entity_type', 'sync_status'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_key: Mapped[str] = mapped_column(String(255), nullable=False)
    last_block_processed: Mapped[int | None] = mapped_column(BigInteger)
    last_timestamp_processed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sync_status: Mapped[str] = mapped_column(String(20), nullable=False, default='idle')
    error_message: Mapped[str | None] = mapped_column(Text)
    total_items_processed: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # 'metadata' is reserved on the declarative base; map the physical column under an alias.
    metadata_json: Mapped[dict | None] = mapped_column('metadata', JSONB)
