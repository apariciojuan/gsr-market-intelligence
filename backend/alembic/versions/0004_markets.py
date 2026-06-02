"""markets: Polymarket market catalog

Creates the ``markets`` table (one row per Polymarket condition). Parent of
``price_history`` (0005) and ``wallet_positions`` (0006). Includes a GIN index
over the JSONB ``tags`` column.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'markets',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('condition_id', sa.String(length=66), nullable=False),
        sa.Column('question_id', sa.String(length=66), nullable=True),
        sa.Column('slug', sa.String(length=255), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('outcomes', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('outcome_token_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('market_address', sa.String(length=42), nullable=True),
        sa.Column('image_url', sa.String(length=500), nullable=True),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved', sa.Boolean(), nullable=False),
        sa.Column('resolved_outcome', sa.String(length=50), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('volume_total', sa.Numeric(precision=20, scale=2), nullable=True),
        sa.Column('liquidity', sa.Numeric(precision=20, scale=2), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('closed', sa.Boolean(), nullable=False),
        sa.Column('uma_adapter_version', sa.String(length=10), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('raw_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
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
        sa.UniqueConstraint('condition_id', name='uq_markets_condition_id'),
        sa.UniqueConstraint('slug', name='uq_markets_slug'),
    )
    op.create_index('ix_markets_condition_id', 'markets', ['condition_id'])
    op.create_index('ix_markets_question_id', 'markets', ['question_id'])
    op.create_index('ix_markets_slug', 'markets', ['slug'])
    op.create_index('ix_markets_category', 'markets', ['category'])
    op.create_index('ix_markets_market_address', 'markets', ['market_address'])
    op.create_index('ix_markets_end_date', 'markets', ['end_date'])
    op.create_index('ix_markets_resolved', 'markets', ['resolved'])
    op.create_index('ix_markets_active', 'markets', ['active'])
    op.create_index('ix_markets_active_end_date', 'markets', ['active', 'end_date'])
    op.create_index('ix_markets_category_active', 'markets', ['category', 'active'])
    op.create_index('ix_markets_tags', 'markets', ['tags'], postgresql_using='gin')


def downgrade() -> None:
    op.drop_index('ix_markets_tags', table_name='markets')
    op.drop_index('ix_markets_category_active', table_name='markets')
    op.drop_index('ix_markets_active_end_date', table_name='markets')
    op.drop_index('ix_markets_active', table_name='markets')
    op.drop_index('ix_markets_resolved', table_name='markets')
    op.drop_index('ix_markets_end_date', table_name='markets')
    op.drop_index('ix_markets_market_address', table_name='markets')
    op.drop_index('ix_markets_category', table_name='markets')
    op.drop_index('ix_markets_slug', table_name='markets')
    op.drop_index('ix_markets_question_id', table_name='markets')
    op.drop_index('ix_markets_condition_id', table_name='markets')
    op.drop_table('markets')
