"""ecosystem_metrics: append-only aggregated ecosystem metric snapshots

Creates the ``ecosystem_metrics`` table. Each aggregation cycle appends one row
per ``metric_key`` with the computed ``metric_value`` and an optional
``metric_metadata`` JSONB payload. Keeping the history of snapshots enables real
deltas (current vs previous) and sparklines (the series over time). This is a
plain table (NOT a TimescaleDB hypertable); the composite index orders
``computed_at`` DESC for the "latest snapshot per key" lookups.

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'ecosystem_metrics',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('metric_key', sa.String(length=100), nullable=False),
        sa.Column('metric_value', sa.Numeric(precision=30, scale=6), nullable=False),
        sa.Column('metric_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True),
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
    )
    op.create_index('ix_ecosystem_metrics_metric_key', 'ecosystem_metrics', ['metric_key'])
    op.create_index('ix_ecosystem_metrics_computed_at', 'ecosystem_metrics', ['computed_at'])
    op.create_index(
        'ix_ecosystem_metrics_key_computed',
        'ecosystem_metrics',
        ['metric_key', sa.text('computed_at DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_ecosystem_metrics_key_computed', table_name='ecosystem_metrics')
    op.drop_index('ix_ecosystem_metrics_computed_at', table_name='ecosystem_metrics')
    op.drop_index('ix_ecosystem_metrics_metric_key', table_name='ecosystem_metrics')
    op.drop_table('ecosystem_metrics')
