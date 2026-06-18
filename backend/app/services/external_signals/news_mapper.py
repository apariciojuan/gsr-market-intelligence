"""Map ExternalSignal rows to the markets/news API contract."""

from __future__ import annotations

from datetime import UTC

from app.models import ExternalSignal
from app.schemas.market import NewsItemRead, NewsSignalRead, NewsWithSignal


def external_signal_to_news(signal: ExternalSignal, *, signal_id: int) -> NewsWithSignal:
    published = signal.published_at.astimezone(UTC).isoformat().replace('+00:00', 'Z')
    meta = signal.metadata_json or {}
    score = float(meta.get('match_score', 0.5))
    method = str(meta.get('method', signal.source))
    return NewsWithSignal(
        news=NewsItemRead(
            id=signal_id,
            source=signal.source,
            url=signal.url,
            title=signal.title or signal.text[:200],
            summary=signal.text[:2000],
            published_at=published,
            language=signal.language,
        ),
        signal=NewsSignalRead(relevance_score=score, method=method),
    )


def external_signals_to_news_list(
    signals: list[ExternalSignal],
    *,
    min_relevance: float | None = None,
) -> list[NewsWithSignal]:
    items: list[NewsWithSignal] = []
    for signal in signals:
        meta = signal.metadata_json or {}
        score = float(meta.get('match_score', 0.5))
        if min_relevance is not None and score < min_relevance:
            continue
        items.append(external_signal_to_news(signal, signal_id=signal.id))
    return items
