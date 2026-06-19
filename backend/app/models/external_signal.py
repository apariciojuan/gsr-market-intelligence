from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ExternalSignal(Base, TimestampMixin):
    """Textual external signal linked to a Polymarket market (RSS, resolution source, etc.)."""

    __tablename__ = 'external_signals'
    __table_args__ = (
        UniqueConstraint(
            'market_id',
            'content_fingerprint',
            name='uq_external_signals_market_fingerprint',
        ),
        Index('ix_external_signals_market_published', 'market_id', text('published_at DESC')),
        Index('ix_external_signals_source_published', 'source', text('published_at DESC')),
        Index('ix_external_signals_content_fingerprint', 'content_fingerprint'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    market_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey('markets.id'), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    content_fingerprint: Mapped[str] = mapped_column(String(32), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default='en')
    metadata_json: Mapped[dict | None] = mapped_column('metadata', JSONB)
