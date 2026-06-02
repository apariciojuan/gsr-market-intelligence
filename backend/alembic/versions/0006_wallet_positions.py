"""wallet_positions: per-wallet market positions (schema-only)

Creates the ``wallet_positions`` table. Schema-only in Phase B (no ingestor yet),
so it stays empty until a later phase. Child of ``markets`` (0004).

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'wallet_positions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('wallet_address', sa.String(length=42), nullable=False),
        sa.Column('market_id', sa.BigInteger(), nullable=False),
        sa.Column('outcome_token_id', sa.String(length=80), nullable=False),
        sa.Column('outcome', sa.String(length=50), nullable=False),
        sa.Column('shares', sa.Numeric(precision=30, scale=6), nullable=False),
        sa.Column('avg_buy_price', sa.Numeric(precision=10, scale=8), nullable=True),
        sa.Column('total_bought_usd', sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column('total_sold_usd', sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column('realized_pnl_usd', sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column('unrealized_pnl_usd', sa.Numeric(precision=20, scale=6), nullable=True),
        sa.Column('last_activity_at', sa.DateTime(timezone=True), nullable=False),
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
        sa.ForeignKeyConstraint(
            ['market_id'],
            ['markets.id'],
            name='fk_wallet_positions_market_id_markets',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'wallet_address',
            'market_id',
            'outcome_token_id',
            name='uq_wallet_positions_wallet_market_token',
        ),
    )
    op.create_index('ix_wallet_positions_wallet_address', 'wallet_positions', ['wallet_address'])
    op.create_index('ix_wallet_positions_market_id', 'wallet_positions', ['market_id'])
    op.create_index(
        'ix_wallet_positions_wallet_activity',
        'wallet_positions',
        ['wallet_address', 'last_activity_at'],
    )
    op.create_index(
        'ix_wallet_positions_market_shares',
        'wallet_positions',
        ['market_id', 'shares'],
    )


def downgrade() -> None:
    op.drop_index('ix_wallet_positions_market_shares', table_name='wallet_positions')
    op.drop_index('ix_wallet_positions_wallet_activity', table_name='wallet_positions')
    op.drop_index('ix_wallet_positions_market_id', table_name='wallet_positions')
    op.drop_index('ix_wallet_positions_wallet_address', table_name='wallet_positions')
    op.drop_table('wallet_positions')
