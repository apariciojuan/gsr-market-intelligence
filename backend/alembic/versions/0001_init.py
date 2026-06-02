"""init: extensions and sync_state

Creates the Postgres extensions required by the data layer (timescaledb, vector,
pgcrypto) and the shared checkpoint table ``sync_state``. Domain hypertables
(chainlink_prices, transactions, price_history, ...) belong to later migrations.

Revision ID: 0001
Revises:
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Extensions are idempotent; they mirror postgresql/init.sql for environments
    # whose database is created without that init script.
    op.execute('CREATE EXTENSION IF NOT EXISTS timescaledb')
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    op.create_table(
        'sync_state',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_key', sa.String(length=255), nullable=False),
        sa.Column('last_block_processed', sa.BigInteger(), nullable=True),
        sa.Column('last_timestamp_processed', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('sync_status', sa.String(length=20), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('total_items_processed', sa.BigInteger(), nullable=False),
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
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entity_type', 'entity_key', name='uq_sync_state_entity'),
    )
    op.create_index(
        'ix_sync_state_type_status',
        'sync_state',
        ['entity_type', 'sync_status'],
    )


def downgrade() -> None:
    # Extensions are not dropped (they may be shared by other objects / databases).
    op.drop_index('ix_sync_state_type_status', table_name='sync_state')
    op.drop_table('sync_state')
