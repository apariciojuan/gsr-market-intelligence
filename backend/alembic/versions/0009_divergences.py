"""divergences: detected market-vs-external-signal divergences

Creates the ``divergences`` table. Each row is an active/closed divergence for a
``(market_id, divergence_type, external_source)`` logical key, upserted by the
divergence calculator via SELECT-then-write. This is a plain table (NOT a
TimescaleDB hypertable); the indexes order ``detected_at`` / ``severity`` DESC for
the "most severe / most recent first" lookups. ``severity`` is constrained to the
1..5 range and the physical ``metadata`` JSONB column holds FeedMatcher
traceability (never serialized by the API).

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0009'
down_revision: str | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'divergences',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('market_id', sa.BigInteger(), nullable=False),
        sa.Column('divergence_type', sa.String(length=50), nullable=False),
        sa.Column('detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('severity', sa.Integer(), nullable=False),
        sa.Column('magnitude_pct', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('direction', sa.String(length=20), nullable=True),
        sa.Column('market_value', sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column('external_value', sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column('external_source', sa.String(length=100), nullable=True),
        sa.Column('time_window_minutes', sa.Integer(), nullable=True),
        sa.Column(
            'status',
            sa.String(length=20),
            server_default=sa.text("'active'"),
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
            name='fk_divergences_market_id_markets',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            'severity BETWEEN 1 AND 5',
            name='ck_divergences_severity',
        ),
    )
    op.create_index('ix_divergences_market_id', 'divergences', ['market_id'])
    op.create_index('ix_divergences_divergence_type', 'divergences', ['divergence_type'])
    op.create_index(
        'ix_divergences_market_detected',
        'divergences',
        ['market_id', sa.text('detected_at DESC')],
    )
    op.create_index(
        'ix_divergences_type_status_severity',
        'divergences',
        ['divergence_type', 'status', sa.text('severity DESC')],
    )
    op.create_index(
        'ix_divergences_detected_at',
        'divergences',
        [sa.text('detected_at DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_divergences_detected_at', table_name='divergences')
    op.drop_index('ix_divergences_type_status_severity', table_name='divergences')
    op.drop_index('ix_divergences_market_detected', table_name='divergences')
    op.drop_index('ix_divergences_divergence_type', table_name='divergences')
    op.drop_index('ix_divergences_market_id', table_name='divergences')
    op.drop_table('divergences')
