"""Pydantic schema for the health endpoint (mirrors types.ts HealthStatus)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

HealthComponentStatus = Literal['ok', 'degraded', 'down']


class HealthStatus(BaseModel):
    status: HealthComponentStatus
    database: HealthComponentStatus
    redis: HealthComponentStatus
    polygon_rpc: HealthComponentStatus
    version: str
    uptime_seconds: int
