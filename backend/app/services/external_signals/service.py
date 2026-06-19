"""Persist and query external signals in PostgreSQL."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.log import get_logger
from app.config.settings import settings
from app.models import ExternalSignal, Market
from app.services.external_signals.collector import collect_signals_for_markets
from app.services.external_signals.dedup import content_fingerprint

logger = get_logger('external_signals.service')

# Grouped `source` query values accepted by list_signals (and the REST API).
SOURCE_GROUP_PREFIXES: dict[str, str] = {
    'x': 'x_',
    'telegram': 'telegram_',
}
SOURCE_GROUP_EXACT: dict[str, tuple[str, ...]] = {
    'rss': ('keyword_rss', 'resolution_source'),
}


def _apply_source_filter(source: str):
    """Return a SQLAlchemy filter for a raw source or a group key (x/telegram/rss)."""
    if source in SOURCE_GROUP_PREFIXES:
        prefix = SOURCE_GROUP_PREFIXES[source]
        return ExternalSignal.source.like(f'{prefix}%')
    if source in SOURCE_GROUP_EXACT:
        return ExternalSignal.source.in_(SOURCE_GROUP_EXACT[source])
    return ExternalSignal.source == source


def _apply_signal_list_filters(
    stmt,
    *,
    market_id: int | None,
    slug: str | None,
    source: str | None,
    since: datetime | None,
    until: datetime | None,
    q: str | None,
):
    if market_id is not None:
        stmt = stmt.where(ExternalSignal.market_id == market_id)
    if slug:
        stmt = stmt.where(ExternalSignal.slug == slug)
    if source:
        stmt = stmt.where(_apply_source_filter(source))
    if since:
        stmt = stmt.where(ExternalSignal.published_at >= since)
    if until:
        stmt = stmt.where(ExternalSignal.published_at <= until)
    if q:
        pattern = f'%{q}%'
        stmt = stmt.where(
            or_(
                ExternalSignal.text.ilike(pattern),
                ExternalSignal.title.ilike(pattern),
            )
        )
    return stmt


def _latest_id_per_fingerprint_subquery(stmt):
    """One row id per content_fingerprint (newest published_at)."""
    return (
        stmt.with_only_columns(ExternalSignal.id)
        .distinct(ExternalSignal.content_fingerprint)
        .order_by(ExternalSignal.content_fingerprint, ExternalSignal.published_at.desc())
        .subquery()
    )


class ExternalSignalsService:
    """DB-backed external signals ingestion and queries."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def collect_for_market_ids(
        self,
        market_ids: list[int] | None = None,
        slugs: list[str] | None = None,
    ) -> int:
        """Run RSS collection for DB markets and upsert rows. Returns insert count."""
        markets = await self.load_markets(market_ids=market_ids, slugs=slugs)
        if not markets:
            return 0
        market_dicts = [
            {
                'market_id': str(m.id),
                'id': m.id,
                'slug': m.slug,
                'question': m.question,
                'title': m.question,
                'description': m.description,
                'resolution_source': m.resolution_source
                or ((m.raw_data or {}).get('resolutionSource') if m.raw_data else None),
            }
            for m in markets
        ]
        parquet_rows = await collect_signals_for_markets(market_dicts)
        return await self._upsert_parquet_rows(parquet_rows, markets_by_id={str(m.id): m for m in markets})

    async def load_markets(
        self,
        *,
        market_ids: list[int] | None = None,
        slugs: list[str] | None = None,
    ) -> list[Market]:
        stmt = select(Market)
        if market_ids:
            stmt = stmt.where(Market.id.in_(market_ids))
        elif slugs:
            stmt = stmt.where(Market.slug.in_(slugs))
        else:
            stmt = stmt.where(Market.active.is_(True))
        return list((await self._session.scalars(stmt)).all())

    async def _upsert_parquet_rows(
        self,
        rows: list[dict[str, str]],
        *,
        markets_by_id: dict[str, Market],
    ) -> int:
        inserted = 0
        for row in rows:
            market = markets_by_id.get(str(row['market_id']))
            if market is None:
                continue
            published = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
            if published.tzinfo is None:
                published = published.replace(tzinfo=UTC)
            fingerprint = row.get('_content_fingerprint') or content_fingerprint(row['text'])
            if not fingerprint:
                continue
            values = {
                'market_id': market.id,
                'slug': market.slug,
                'source': row['source'],
                'text': row['text'],
                'title': row['text'][:500],
                'url': row['url'],
                'content_fingerprint': fingerprint,
                'published_at': published,
                'language': 'en',
                'metadata_json': {
                    'ingested_via': 'collector',
                    'match_score': row.get('_match_score'),
                    'matched_by': row.get('_matched_by', row['source']),
                },
            }
            stmt = (
                pg_insert(ExternalSignal)
                .values(**values)
                .on_conflict_do_update(
                    constraint='uq_external_signals_market_fingerprint',
                    set_={
                        'text': values['text'],
                        'title': values['title'],
                        'source': values['source'],
                        'url': values['url'],
                        'published_at': values['published_at'],
                        'metadata': values['metadata_json'],
                        'updated_at': datetime.now(UTC),
                    },
                )
            )
            await self._session.execute(stmt)
            inserted += 1
        await self._session.commit()
        return inserted

    async def list_signals(
        self,
        *,
        market_id: int | None = None,
        slug: str | None = None,
        source: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        q: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ExternalSignal], int]:
        base = select(ExternalSignal)
        base = _apply_signal_list_filters(
            base,
            market_id=market_id,
            slug=slug,
            source=source,
            since=since,
            until=until,
            q=q,
        )

        global_feed = market_id is None and not slug
        if global_feed:
            count_stmt = select(func.count(func.distinct(ExternalSignal.content_fingerprint))).select_from(
                ExternalSignal
            )
            count_stmt = _apply_signal_list_filters(
                count_stmt,
                market_id=market_id,
                slug=slug,
                source=source,
                since=since,
                until=until,
                q=q,
            )
            ids_sq = _latest_id_per_fingerprint_subquery(base)
            stmt = (
                select(ExternalSignal)
                .join(ids_sq, ExternalSignal.id == ids_sq.c.id)
                .order_by(ExternalSignal.published_at.desc())
                .limit(limit)
                .offset(offset)
            )
        else:
            count_stmt = select(func.count()).select_from(ExternalSignal)
            count_stmt = _apply_signal_list_filters(
                count_stmt,
                market_id=market_id,
                slug=slug,
                source=source,
                since=since,
                until=until,
                q=q,
            )
            stmt = (
                base.order_by(ExternalSignal.published_at.desc())
                .limit(limit)
                .offset(offset)
            )

        total = int((await self._session.scalar(count_stmt)) or 0)
        items = list((await self._session.scalars(stmt)).all())
        return items, total

    async def get_by_id(self, signal_id: int) -> ExternalSignal | None:
        return await self._session.get(ExternalSignal, signal_id)

    async def list_for_market_news(
        self,
        market_id: int,
        *,
        limit: int = 20,
    ) -> list[ExternalSignal]:
        cutoff = datetime.now(UTC) - timedelta(days=settings.EXTERNAL_SIGNALS_MAX_AGE_DAYS)
        base = (
            select(ExternalSignal)
            .where(ExternalSignal.market_id == market_id)
            .where(ExternalSignal.published_at >= cutoff)
        )
        ids_sq = _latest_id_per_fingerprint_subquery(base)
        stmt = (
            select(ExternalSignal)
            .join(ids_sq, ExternalSignal.id == ids_sq.c.id)
            .order_by(ExternalSignal.published_at.desc())
            .limit(limit)
        )
        return list((await self._session.scalars(stmt)).all())
