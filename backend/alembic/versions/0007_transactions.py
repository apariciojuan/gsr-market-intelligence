"""transactions: decoded on-chain event hypertable (schema-only)

Creates the ``transactions`` TimescaleDB hypertable. Schema-only in Phase B (no
ingestor yet), so it stays empty until a later phase. The primary key includes
``time`` (required by create_hypertable); the hypertable conversion is inlined as
op.execute to avoid importing the alembic/helpers module (the ``alembic`` package
name collides with the pip distribution). ``contract_id`` is a nullable column
WITHOUT a foreign key (the ``contracts`` table is not persisted).

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'transactions',
        sa.Column('time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('tx_hash', sa.String(length=66), nullable=False),
        sa.Column('log_index', sa.Integer(), nullable=False),
        sa.Column('block_number', sa.BigInteger(), nullable=False),
        sa.Column('contract_id', sa.BigInteger(), nullable=True),
        sa.Column('contract_address', sa.String(length=42), nullable=False),
        sa.Column('from_address', sa.String(length=42), nullable=True),
        sa.Column('to_address', sa.String(length=42), nullable=True),
        sa.Column('event_name', sa.String(length=100), nullable=True),
        sa.Column('event_signature', sa.String(length=66), nullable=False),
        sa.Column('decoded_args', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('value_raw', sa.Numeric(precision=78, scale=0), nullable=True),
        sa.Column('value_usd', sa.Numeric(precision=20, scale=6), nullable=True),
        sa.Column('gas_used', sa.BigInteger(), nullable=True),
        sa.Column('chain_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('time', 'tx_hash', 'log_index'),
    )
    op.execute(
        "SELECT create_hypertable('transactions', 'time', "
        "chunk_time_interval => INTERVAL '7 days')"
    )
    op.create_index('ix_transactions_block_number', 'transactions', ['block_number'])
    op.create_index('ix_transactions_contract_address', 'transactions', ['contract_address'])
    op.create_index('ix_transactions_from_address', 'transactions', ['from_address'])
    op.create_index('ix_transactions_to_address', 'transactions', ['to_address'])
    op.create_index('ix_transactions_event_name', 'transactions', ['event_name'])
    op.create_index(
        'ix_transactions_contract_time',
        'transactions',
        ['contract_address', sa.text('time DESC')],
    )
    op.create_index(
        'ix_transactions_from_time',
        'transactions',
        ['from_address', sa.text('time DESC')],
    )
    op.create_index(
        'ix_transactions_to_time',
        'transactions',
        ['to_address', sa.text('time DESC')],
    )
    op.create_index(
        'ix_transactions_event_time',
        'transactions',
        ['event_name', sa.text('time DESC')],
    )


def downgrade() -> None:
    op.drop_index('ix_transactions_event_time', table_name='transactions')
    op.drop_index('ix_transactions_to_time', table_name='transactions')
    op.drop_index('ix_transactions_from_time', table_name='transactions')
    op.drop_index('ix_transactions_contract_time', table_name='transactions')
    op.drop_index('ix_transactions_event_name', table_name='transactions')
    op.drop_index('ix_transactions_to_address', table_name='transactions')
    op.drop_index('ix_transactions_from_address', table_name='transactions')
    op.drop_index('ix_transactions_contract_address', table_name='transactions')
    op.drop_index('ix_transactions_block_number', table_name='transactions')
    op.drop_table('transactions')
