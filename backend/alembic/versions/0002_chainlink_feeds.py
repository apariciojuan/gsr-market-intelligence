"""chainlink_feeds: Chainlink price feed registry

Creates the ``chainlink_feeds`` table (Chainlink aggregator metadata). Parent of
``chainlink_prices`` (0003).

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'chainlink_feeds',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('feed_address', sa.String(length=42), nullable=False),
        sa.Column('asset_pair', sa.String(length=50), nullable=False),
        sa.Column('decimals', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=200), nullable=True),
        sa.Column('heartbeat_seconds', sa.Integer(), nullable=True),
        sa.Column('deviation_threshold_pct', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False),
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
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('feed_address', name='uq_chainlink_feeds_feed_address'),
    )
    op.create_index('ix_chainlink_feeds_asset_pair', 'chainlink_feeds', ['asset_pair'])


def downgrade() -> None:
    op.drop_index('ix_chainlink_feeds_asset_pair', table_name='chainlink_feeds')
    op.drop_table('chainlink_feeds')
