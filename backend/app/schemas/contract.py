"""Pydantic schemas for the contracts endpoints.

These mirror EXACTLY the frontend contract in
`frontend/app/lib/api/types.ts` (ContractRead, ExploreResponse, SyncStatus, ...),
which is the single source of truth for the FE↔BE shapes.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

SyncStatusState = Literal['idle', 'syncing', 'completed', 'error']
ContractActivityInterval = Literal['1h', '1d', '1w', '1m']


class ContractLinkedMarket(BaseModel):
    id: int
    slug: str
    question: str


class ContractRead(BaseModel):
    id: int
    address: str
    chain_id: int
    contract_type: str
    name: str
    symbol: str | None = None
    decimals: int | None = None
    abi_key: str
    first_seen_block: int
    metadata_json: dict[str, Any]
    polygonscan_url: str
    linked_market: ContractLinkedMarket | None = None
    created_at: str


class ExploreReadyResponse(BaseModel):
    status: Literal['ready']
    address: str
    contract: ContractRead


class ExploreQueuedResponse(BaseModel):
    status: Literal['queued']
    job_id: str
    address: str
    estimated_seconds: int


class SyncStatus(BaseModel):
    address: str
    sync_status: SyncStatusState
    progress_pct: float
    last_block_processed: int
    current_polygon_block: int
    blocks_remaining: int
    events_found: int
    started_at: str
    estimated_completion_at: str | None = None
    error_message: str | None = None


class ContractSummary(BaseModel):
    contract: ContractRead
    total_transactions: int
    unique_wallets: int
    total_volume_usd: float
    first_activity: str
    last_activity: str
    is_polymarket_market: bool
    linked_market: ContractLinkedMarket | None = None


class ContractActivityBucket(BaseModel):
    t: str
    tx_count: int
    unique_senders: int
    volume_usd: float


class ContractActivity(BaseModel):
    address: str
    interval: ContractActivityInterval
    from_time: str
    to_time: str
    buckets: list[ContractActivityBucket]


class ContractTransaction(BaseModel):
    tx_hash: str
    log_index: int
    block_number: int
    time: str
    event_name: str
    from_address: str
    to_address: str
    decoded_args: dict[str, Any]
    value_usd: float
    polygonscan_url: str


class PaginatedContractTransactions(BaseModel):
    items: list[ContractTransaction]
    total: int | None = None
    limit: int
    offset: int
    has_more: bool
