"""price_history: Polymarket CLOB price hypertable

Creates the ``price_history`` TimescaleDB hypertable (one row per market token
observation). The primary key includes ``time`` (required by create_hypertable);
the hypertable conversion is inlined as op.execute to avoid importing the
alembic/helpers module (the ``alembic`` package name collides with the pip
distribution). ``price`` is constrained to the 0..1 range.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'price_history',
        sa.Column('time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('market_id', sa.BigInteger(), nullable=False),
        sa.Column('token_id', sa.String(length=80), nullable=False),
        sa.Column('outcome', sa.String(length=50), nullable=False),
        sa.Column('price', sa.Numeric(precision=10, scale=8), nullable=False),
        sa.Column('bid', sa.Numeric(precision=10, scale=8), nullable=True),
        sa.Column('ask', sa.Numeric(precision=10, scale=8), nullable=True),
        sa.Column('midpoint', sa.Numeric(precision=10, scale=8), nullable=True),
        sa.Column('spread', sa.Numeric(precision=10, scale=8), nullable=True),
        sa.Column('volume_1h', sa.Numeric(precision=20, scale=2), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(
            ['market_id'],
            ['markets.id'],
            name='fk_price_history_market_id_markets',
        ),
        sa.PrimaryKeyConstraint('time', 'market_id', 'token_id'),
        sa.CheckConstraint(
            'price >= 0 AND price <= 1',
            name='ck_price_history_price_range',
        ),
    )
    op.execute(
        "SELECT create_hypertable('price_history', 'time', "
        "chunk_time_interval => INTERVAL '7 days')"
    )
    op.create_index('ix_price_history_market_id', 'price_history', ['market_id'])
    op.create_index(
        'ix_price_history_market_time',
        'price_history',
        ['market_id', sa.text('time DESC')],
    )
    op.create_index(
        'ix_price_history_token_time',
        'price_history',
        ['token_id', sa.text('time DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_price_history_token_time', table_name='price_history')
    op.drop_index('ix_price_history_market_time', table_name='price_history')
    op.drop_index('ix_price_history_market_id', table_name='price_history')
    op.drop_table('price_history')
