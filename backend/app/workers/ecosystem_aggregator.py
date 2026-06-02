"""Ecosystem metrics aggregator (Fase C, sheet 72 section 3).

Each cycle computes a small set of ecosystem-wide metrics from the ``markets``
table and **appends** one snapshot row per ``metric_key`` to ``ecosystem_metrics``
(``computed_at = now (UTC)``, ``valid_until = now + 1h``). Appending — rather than
upserting — keeps the history of snapshots, which is what enables real deltas
(current vs previous snapshot) and sparklines (the series over time); both mature
as more cycles run.

Metrics persisted this cycle:

- scalar KPIs from ``markets``: ``kpi_total_volume`` (Σ ``volume_total``),
  ``kpi_total_liquidity`` (Σ ``liquidity``), ``kpi_active_markets`` (count active),
  ``kpi_total_markets`` (count all), ``kpi_resolved_markets`` (count resolved);
- ``by_category``: volume split by the market's **primary tag** (``markets.tags`` is
  a JSON list; Gamma does not expose a canonical ``category``, so ``markets.category``
  is NULL). The aggregation dimension is therefore the *tag*, not a canonical
  *category*. Markets without tags fall into ``'Otros'``.

The worker is defensive: a malformed/unreadable market is skipped, never aborting
the cycle, and it checkpoints ``sync_state`` under
``(entity_type='ecosystem_agg', entity_key='all')``.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config.log import get_logger
from app.models import EcosystemMetric, Market, SyncState

logger = get_logger('workers.ecosystem_aggregator')

# Snapshots are considered fresh for one hour after they are computed.
SNAPSHOT_TTL = timedelta(hours=1)

# Bucket used for markets that carry no tags (see module docstring).
UNTAGGED_CATEGORY = 'Otros'


def _format_usd(value: Decimal) -> str:
    """Render a USD amount as ``$1,234,567`` (no decimals)."""
    return f'${value:,.0f}'


def _format_count(value: int) -> str:
    """Render an integer count with thousands separators."""
    return f'{value:,}'


def _primary_tag(tags: Any) -> str:
    """Return the first tag of a market, or ``UNTAGGED_CATEGORY`` when absent.

    ``markets.tags`` is stored as a JSON list (``Mapped[dict | None]`` on the model,
    but populated with a list by ``markets_ingestor``); be defensive about shape.
    """
    if isinstance(tags, (list, tuple)) and tags:
        first = tags[0]
        if first is not None:
            text = str(first).strip()
            if text:
                return text
    return UNTAGGED_CATEGORY


def _category_color(name: str) -> str:
    """Deterministic HSL color for a category name (stable across cycles)."""
    digest = hashlib.md5(name.lower().encode()).hexdigest()  # noqa: S324
    hue = int(digest, 16) % 360
    return f'hsl({hue}, 65%, 55%)'


def _build_by_category(markets: list[Market]) -> tuple[Decimal, list[dict]]:
    """Split total volume by primary tag; return ``(total_volume, categories)``.

    ``categories`` is ordered by descending volume; each entry carries
    ``name``/``volume_usd``/``share_pct``/``color`` (matching ``EcoCategory``).
    """
    volume_by_tag: dict[str, Decimal] = {}
    total = Decimal('0')
    for market in markets:
        volume = market.volume_total or Decimal('0')
        tag = _primary_tag(market.tags)
        volume_by_tag[tag] = volume_by_tag.get(tag, Decimal('0')) + volume
        total += volume

    categories: list[dict] = []
    for name, volume in sorted(volume_by_tag.items(), key=lambda item: item[1], reverse=True):
        share_pct = round(float(volume / total * 100), 1) if total > 0 else 0.0
        categories.append(
            {
                'name': name,
                'volume_usd': float(volume),
                'share_pct': share_pct,
                'color': _category_color(name),
            }
        )
    return total, categories


def _build_snapshots(markets: list[Market]) -> list[dict]:
    """Compute every metric snapshot for this cycle from the loaded markets."""
    total_volume = sum((m.volume_total or Decimal('0') for m in markets), Decimal('0'))
    total_liquidity = sum((m.liquidity or Decimal('0') for m in markets), Decimal('0'))
    active_count = sum(1 for m in markets if m.active)
    total_count = len(markets)
    resolved_count = sum(1 for m in markets if m.resolved)

    category_total, categories = _build_by_category(markets)

    return [
        {
            'metric_key': 'kpi_total_volume',
            'metric_value': total_volume,
            'metric_metadata': {
                'label': 'Volumen total',
                'value_formatted': _format_usd(total_volume),
            },
        },
        {
            'metric_key': 'kpi_total_liquidity',
            'metric_value': total_liquidity,
            'metric_metadata': {
                'label': 'Liquidez total',
                'value_formatted': _format_usd(total_liquidity),
            },
        },
        {
            'metric_key': 'kpi_active_markets',
            'metric_value': Decimal(active_count),
            'metric_metadata': {
                'label': 'Mercados activos',
                'value_formatted': _format_count(active_count),
            },
        },
        {
            'metric_key': 'kpi_total_markets',
            'metric_value': Decimal(total_count),
            'metric_metadata': {
                'label': 'Mercados totales',
                'value_formatted': _format_count(total_count),
            },
        },
        {
            'metric_key': 'kpi_resolved_markets',
            'metric_value': Decimal(resolved_count),
            'metric_metadata': {
                'label': 'Mercados resueltos',
                'value_formatted': _format_count(resolved_count),
            },
        },
        {
            'metric_key': 'by_category',
            'metric_value': category_total,
            'metric_metadata': {'categories': categories},
        },
    ]


async def _checkpoint(session: Any, processed: int, now: datetime) -> None:
    """Upsert the ``sync_state`` row for the ecosystem aggregator."""
    stmt = (
        pg_insert(SyncState)
        .values(
            entity_type='ecosystem_agg',
            entity_key='all',
            last_synced_at=now,
            sync_status='completed',
            total_items_processed=processed,
        )
        .on_conflict_do_update(
            constraint='uq_sync_state_entity',
            set_={
                'last_synced_at': now,
                'sync_status': 'completed',
                'total_items_processed': SyncState.total_items_processed + processed,
            },
        )
    )
    await session.execute(stmt)


async def aggregate_ecosystem(ctx: dict) -> int:
    """Append one ecosystem snapshot per ``metric_key``; return rows appended."""
    session_factory = ctx['session_factory']
    now = datetime.now(tz=UTC)
    valid_until = now + SNAPSHOT_TTL
    appended = 0

    async with session_factory() as session:
        try:
            markets = list((await session.scalars(select(Market))).all())
        except Exception:
            logger.exception('ecosystem_aggregator: failed to load markets')
            return 0

        try:
            snapshots = _build_snapshots(markets)
        except Exception:
            logger.exception('ecosystem_aggregator: failed to compute snapshots')
            return 0

        for snapshot in snapshots:
            try:
                stmt = pg_insert(EcosystemMetric).values(
                    metric_key=snapshot['metric_key'],
                    metric_value=snapshot['metric_value'],
                    metric_metadata=snapshot['metric_metadata'],
                    computed_at=now,
                    valid_until=valid_until,
                )
                await session.execute(stmt)
                appended += 1
            except Exception:
                logger.exception(
                    'ecosystem_aggregator: failed to append snapshot (metric_key=%s)',
                    snapshot.get('metric_key'),
                )

        await _checkpoint(session, appended, now)
        await session.commit()

    logger.info(
        'ecosystem_aggregator: appended %d snapshots from %d markets', appended, len(markets)
    )
    return appended
