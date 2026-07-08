"""market_volume_cache: pre-aggregated trade volume per chart interval

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-07

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = '0012'
down_revision: str | None = '0011'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'market_volume_cache',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('market_id', sa.BigInteger(), nullable=False),
        sa.Column('interval', sa.String(length=10), nullable=False),
        sa.Column('buckets', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('total_volume_usd', sa.Numeric(precision=20, scale=2), nullable=False),
        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['market_id'], ['markets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('market_id', 'interval', name='uq_market_volume_cache_market_interval'),
    )
    op.create_index('ix_market_volume_cache_market_id', 'market_volume_cache', ['market_id'])
    op.create_index('ix_market_volume_cache_interval', 'market_volume_cache', ['interval'])


def downgrade() -> None:
    op.drop_index('ix_market_volume_cache_interval', table_name='market_volume_cache')
    op.drop_index('ix_market_volume_cache_market_id', table_name='market_volume_cache')
    op.drop_table('market_volume_cache')
