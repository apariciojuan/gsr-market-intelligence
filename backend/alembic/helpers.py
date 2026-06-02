"""Reusable migration helpers.

TimescaleDB hypertables are not produced by --autogenerate; domain migrations
(plans 20/30/40) create the plain table with op.create_table and then convert it
with this helper. Kept here so every domain migration shares one definition.
"""

from alembic import op


def create_hypertable(
    table: str,
    time_column: str = 'time',
    interval: str = '7 days',
) -> None:
    """Convert an existing table into a TimescaleDB hypertable.

    The table's primary key MUST include ``time_column`` or create_hypertable fails.
    """
    op.execute(
        f"SELECT create_hypertable('{table}', '{time_column}', "
        f"chunk_time_interval => INTERVAL '{interval}')"
    )
