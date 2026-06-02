from arq import cron
from arq.connections import RedisSettings

from app.config.settings import settings
from app.workers.divergence_calculator import calculate_divergences
from app.workers.ecosystem_aggregator import aggregate_ecosystem
from app.workers.market_price_collector import collect_market_prices
from app.workers.markets_ingestor import collect_markets
from app.workers.signals_collector import collect_chainlink_signals


def get_redis_settings() -> RedisSettings:
    """Build arq RedisSettings from the REDIS_* settings."""
    return RedisSettings(
        host=settings.REDIS_HOST or 'redis',
        port=int(settings.REDIS_PORT or 6379),
        database=settings.REDIS_DB,
        password=settings.REDIS_PASSWORD or None,
    )


async def startup(ctx: dict) -> None:
    """Expose the async session factory; workers open their own session per task."""
    from app.core.database import SessionLocal

    ctx['session_factory'] = SessionLocal


async def shutdown(ctx: dict) -> None:
    """Tear down worker resources (no-op for now)."""


class WorkerSettings:
    """arq worker entrypoint.

    Phase B domain plans (20/30/40) extend ``functions`` and ``cron_jobs``.
    """

    redis_settings = get_redis_settings()
    on_startup = startup
    on_shutdown = shutdown
    functions: list = [
        collect_chainlink_signals,
        collect_markets,
        collect_market_prices,
        aggregate_ecosystem,
        calculate_divergences,
    ]
    cron_jobs: list = [
        # CHAINLINK_POLL_INTERVAL_SECONDS=60 -> every minute.
        cron(collect_chainlink_signals, minute=set(range(60))),
        # MARKETS_INGEST_INTERVAL_SECONDS=1800 -> every 30 minutes.
        cron(collect_markets, minute={0, 30}),
        # MARKET_PRICE_POLL_INTERVAL_SECONDS=300 -> every 5 minutes.
        cron(collect_market_prices, minute=set(range(0, 60, 5))),
        # ECOSYSTEM_AGG_INTERVAL=hourly -> at minute 0 of every hour.
        cron(aggregate_ecosystem, minute={0}),
        # DIVERGENCE_CALC_INTERVAL_MINUTES=10 -> every 10 minutes.
        cron(calculate_divergences, minute=set(range(0, 60, 10))),
    ]
    max_jobs = 10
    job_timeout = 300
