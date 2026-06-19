"""external_signals content_fingerprint deduplication

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-19

"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0011'
down_revision: str | None = '0010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TAG_RE = re.compile(r'<[^>]+>')
_WHITESPACE_RE = re.compile(r'\s+')


def _content_fingerprint(text: str) -> str:
    cleaned = _TAG_RE.sub(' ', text or '')
    cleaned = _WHITESPACE_RE.sub(' ', cleaned).strip().casefold()
    if len(cleaned) > 500:
        cleaned = cleaned[:500]
    if not cleaned:
        return hashlib.sha256(b'').hexdigest()[:32]
    return hashlib.sha256(cleaned.encode()).hexdigest()[:32]


def upgrade() -> None:
    op.add_column(
        'external_signals',
        sa.Column('content_fingerprint', sa.String(length=32), nullable=True),
    )

    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id, text FROM external_signals')).fetchall()
    for row_id, text in rows:
        conn.execute(
            sa.text('UPDATE external_signals SET content_fingerprint = :fp WHERE id = :id'),
            {'fp': _content_fingerprint(text), 'id': row_id},
        )

    conn.execute(
        sa.text(
            """
            DELETE FROM external_signals
            WHERE id IN (
                SELECT id FROM (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY market_id, content_fingerprint
                               ORDER BY id DESC
                           ) AS rn
                    FROM external_signals
                ) ranked
                WHERE rn > 1
            )
            """
        )
    )

    op.alter_column('external_signals', 'content_fingerprint', nullable=False)
    op.drop_constraint('uq_external_signals_market_url', 'external_signals', type_='unique')
    op.create_unique_constraint(
        'uq_external_signals_market_fingerprint',
        'external_signals',
        ['market_id', 'content_fingerprint'],
    )
    op.create_index(
        'ix_external_signals_content_fingerprint',
        'external_signals',
        ['content_fingerprint'],
    )


def downgrade() -> None:
    op.drop_index('ix_external_signals_content_fingerprint', table_name='external_signals')
    op.drop_constraint('uq_external_signals_market_fingerprint', 'external_signals', type_='unique')
    op.create_unique_constraint(
        'uq_external_signals_market_url',
        'external_signals',
        ['market_id', 'url'],
    )
    op.drop_column('external_signals', 'content_fingerprint')
