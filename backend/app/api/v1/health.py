"""Health endpoint for the frontend (GET /api/v1/health).

Honest, live status: `polygon_rpc` is pinged through Etherscan, `database` runs a
`SELECT 1` on the async engine and `redis` issues a `PING`; `version`/`uptime` are
real. The bare `/health` on the app root stays for infra/EC2 checks.
"""

from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter
from redis.asyncio import Redis
from sqlalchemy import text

from app.config import settings
from app.config.log import get_logger
from app.core.database import SessionLocal
from app.schemas.health import HealthStatus
from app.services.blockchain.log_source import EtherscanLogSource

router = APIRouter()
logger = get_logger('health')

_STARTED_AT = time.monotonic()
_PING_TIMEOUT_SECONDS = 2.0


async def _check_polygon_rpc() -> str:
    """Ping the on-chain read path (Etherscan) used by the Fase 1 domains."""
    try:
        await asyncio.wait_for(EtherscanLogSource().latest_block(), _PING_TIMEOUT_SECONDS)
    except Exception:
        logger.warning('health: polygon_rpc ping failed')
        return 'down'
    return 'ok'


async def _check_database() -> str:
    """Run a trivial query on the async engine to confirm the DB is reachable."""
    try:
        async with SessionLocal() as session:
            await asyncio.wait_for(session.execute(text('SELECT 1')), _PING_TIMEOUT_SECONDS)
    except Exception:
        logger.warning('health: database ping failed')
        return 'down'
    return 'ok'


async def _check_redis() -> str:
    """PING Redis using the same connection settings the arq workers use."""
    client = Redis(
        host=settings.REDIS_HOST or 'redis',
        port=int(settings.REDIS_PORT or 6379),
        db=settings.REDIS_DB,
        password=settings.REDIS_PASSWORD or None,
    )
    try:
        await asyncio.wait_for(client.ping(), _PING_TIMEOUT_SECONDS)
    except Exception:
        logger.warning('health: redis ping failed')
        return 'down'
    finally:
        await client.aclose()
    return 'ok'


@router.get(
    '',
    response_model=HealthStatus,
    status_code=200,
    operation_id='get_health',
    tags=['health'],
    summary='Service health',
    description='Live component status: Polygon RPC, database and Redis are pinged.',
)
async def get_health() -> HealthStatus:
    polygon_rpc, database, redis = await asyncio.gather(
        _check_polygon_rpc(),
        _check_database(),
        _check_redis(),
    )

    status = 'ok' if polygon_rpc == 'ok' and database == 'ok' and redis == 'ok' else 'degraded'

    return HealthStatus(
        status=status,
        database=database,
        redis=redis,
        polygon_rpc=polygon_rpc,
        version=settings.VERSION,
        uptime_seconds=int(time.monotonic() - _STARTED_AT),
    )
