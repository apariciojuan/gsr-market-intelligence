"""Run one worker task on demand.

The arq worker schedules these functions automatically, but this script is
useful for local smoke tests when you want to trigger one pipeline immediately.
"""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Awaitable, Callable

from app.core.database import SessionLocal
from app.workers.divergence_calculator import calculate_divergences
from app.workers.ecosystem_aggregator import aggregate_ecosystem
from app.workers.market_price_collector import collect_market_prices
from app.workers.markets_ingestor import collect_markets
from app.workers.signals_collector import collect_chainlink_signals

WorkerTask = Callable[[dict], Awaitable[int]]

TASKS: dict[str, WorkerTask] = {
    'signals': collect_chainlink_signals,
    'markets': collect_markets,
    'prices': collect_market_prices,
    'ecosystem': aggregate_ecosystem,
    'divergences': calculate_divergences,
}


async def run_task(name: str) -> int:
    ctx = {'session_factory': SessionLocal}
    touched = await TASKS[name](ctx)
    print(f'{name}: {touched}')
    return touched


async def main() -> None:
    parser = argparse.ArgumentParser(description='Run a worker task once.')
    parser.add_argument('task', choices=[*TASKS, 'all'])
    args = parser.parse_args()

    if args.task == 'all':
        for task in TASKS:
            await run_task(task)
        return

    await run_task(args.task)


if __name__ == '__main__':
    asyncio.run(main())
