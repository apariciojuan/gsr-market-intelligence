"""external_signals table + markets.resolution_source

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = '0010'
down_revision: str | None = '0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('markets', sa.Column('resolution_source', sa.Text(), nullable=True))

    op.create_table(
        'external_signals',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('market_id', sa.BigInteger(), nullable=False),
        sa.Column('slug', sa.String(length=255), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=True),
        sa.Column('url', sa.String(length=2000), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'language',
            sa.String(length=10),
            server_default=sa.text("'en'"),
            nullable=False,
        ),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
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
            name='fk_external_signals_market_id_markets',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('market_id', 'url', name='uq_external_signals_market_url'),
    )
    op.create_index('ix_external_signals_market_id', 'external_signals', ['market_id'])
    op.create_index('ix_external_signals_slug', 'external_signals', ['slug'])
    op.create_index(
        'ix_external_signals_market_published',
        'external_signals',
        ['market_id', sa.text('published_at DESC')],
    )
    op.create_index(
        'ix_external_signals_source_published',
        'external_signals',
        ['source', sa.text('published_at DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_external_signals_source_published', table_name='external_signals')
    op.drop_index('ix_external_signals_market_published', table_name='external_signals')
    op.drop_index('ix_external_signals_slug', table_name='external_signals')
    op.drop_index('ix_external_signals_market_id', table_name='external_signals')
    op.drop_table('external_signals')
    op.drop_column('markets', 'resolution_source')
