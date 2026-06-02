"""chainlink_prices: Chainlink reading hypertable

Creates the ``chainlink_prices`` TimescaleDB hypertable (one row per feed round).
The primary key includes ``time`` (required by create_hypertable). The hypertable
conversion is inlined as op.execute to avoid importing the alembic/helpers module
(the package name ``alembic`` collides with the pip distribution).

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'chainlink_prices',
        sa.Column('time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('feed_id', sa.BigInteger(), nullable=False),
        sa.Column('round_id', sa.Numeric(precision=78, scale=0), nullable=False),
        sa.Column('answer_raw', sa.Numeric(precision=78, scale=0), nullable=False),
        sa.Column('answer_usd', sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column('block_number', sa.BigInteger(), nullable=False),
        sa.Column('polled_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['feed_id'],
            ['chainlink_feeds.id'],
            name='fk_chainlink_prices_feed_id_chainlink_feeds',
        ),
        sa.PrimaryKeyConstraint('time', 'feed_id', 'round_id'),
    )
    op.execute(
        "SELECT create_hypertable('chainlink_prices', 'time', "
        "chunk_time_interval => INTERVAL '7 days')"
    )
    op.create_index('ix_chainlink_prices_feed_id', 'chainlink_prices', ['feed_id'])
    op.create_index(
        'ix_chainlink_prices_feed_time',
        'chainlink_prices',
        ['feed_id', sa.text('time DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_chainlink_prices_feed_time', table_name='chainlink_prices')
    op.drop_index('ix_chainlink_prices_feed_id', table_name='chainlink_prices')
    op.drop_table('chainlink_prices')
