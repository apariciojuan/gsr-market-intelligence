"""Real Contract Explorer endpoints backed by Etherscan (Polygon).

Every response matches EXACTLY the frontend contract in
``frontend/app/lib/api/types.ts`` (mirrored by ``app.schemas.contract``).

There is no database and no background workers: each request is a live read
against the Etherscan-compatible API through ``PolygonClient``. Etherscan
returns ``{'status', 'message', 'result'}`` where ``result`` is usually a list
of rows but can be an explanatory string (rate limit, "No transactions found",
NOTOK); every parser below is defensive about a non-list ``result``.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config.log import get_logger
from app.schemas.contract import (
    ContractActivity,
    ContractActivityBucket,
    ContractRead,
    ContractSummary,
    ContractTransaction,
    ExploreReadyResponse,
    PaginatedContractTransactions,
    SyncStatus,
)
from app.services import PolygonClient

router = APIRouter()
logger = get_logger('contracts')

_ADDRESS_RE = re.compile(r'^0x[0-9a-fA-F]{40}$')
_CHAIN_ID = 137
_DEFAULT_TXLIST_OFFSET = 200
_DEFAULT_LOGS_OFFSET = 200

# topic0 -> human event name for the common ERC-20/ERC-721/ERC-1155 events.
_EVENT_BY_TOPIC0: dict[str, str] = {
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': 'Transfer',
    '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': 'Approval',
    '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62': 'TransferSingle',
    '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb': 'TransferBatch',
    '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31': 'ApprovalForAll',
}
_FROM_TO_EVENTS = {'Transfer', 'TransferSingle', 'TransferBatch'}

_INTERVAL_SECONDS: dict[str, int] = {
    '1h': 3600,
    '1d': 86400,
    '1w': 604800,
    '1m': 2592000,
}


class ExploreRequest(BaseModel):
    """Body for ``POST /explore`` (mirrors the frontend ``ExploreRequest``)."""

    address: str
    from_block: int | None = None
    to_block: int | None = None


def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat().replace('+00:00', 'Z')


def _unix_to_iso(value: Any) -> str:
    """Convert a unix timestamp (seconds) to an ISO-8601 UTC string ending in 'Z'."""
    try:
        return datetime.fromtimestamp(int(value), tz=UTC).isoformat().replace('+00:00', 'Z')
    except (TypeError, ValueError):
        return _now_iso()


def _to_int(value: Any, default: int = 0) -> int:
    """Best-effort decimal int (Etherscan sends numeric strings)."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _hex_to_int(value: Any, default: int = 0) -> int:
    """Parse a ``0x``-prefixed (or bare) hex string into an int."""
    if value is None:
        return default
    try:
        return int(str(value), 16)
    except (TypeError, ValueError):
        return default


def _result_list(payload: Any) -> list[dict]:
    """Pull the ``result`` list out of an Etherscan payload, robustly.

    Etherscan answers a non-list ``result`` (string) on errors, rate limits or
    empty datasets; those are treated as "no rows".
    """
    if not isinstance(payload, dict):
        return []
    result = payload.get('result')
    if isinstance(result, list):
        return [row for row in result if isinstance(row, dict)]
    return []


def _topic_to_address(topic: Any) -> str:
    """Take the last 40 hex chars of a 32-byte topic and return a 0x address."""
    if not isinstance(topic, str):
        return ''
    cleaned = topic[2:] if topic.startswith('0x') else topic
    if len(cleaned) < 40:
        return ''
    return f'0x{cleaned[-40:]}'.lower()


async def _safe_json(coro) -> dict | list:
    """Await a PolygonClient call and return its parsed JSON, never raising.

    ``PolygonClient`` already returns parsed JSON (dict/list) and retries
    transient rate-limit responses, so this only guards against unexpected
    failures (network, decode) by degrading to an empty payload.
    """
    try:
        return await coro
    except Exception as err:  # noqa: BLE001 - live read, degrade gracefully
        logger.warning('Etherscan read failed: %s', err)
        return {}


async def _latest_block(client: PolygonClient) -> int:
    """Read the latest Polygon block number (``eth_blockNumber`` returns hex)."""
    payload = await _safe_json(client.get_latest_block())
    return _hex_to_int(payload.get('result')) if isinstance(payload, dict) else 0


def _detect_from_source(source_payload: Any) -> tuple[str, str, str | None, int | None]:
    """Derive (contract_type, name, symbol, decimals) from ``getsourcecode``.

    The ``getsourcecode`` result is a one-element list of dicts. An empty ABI
    means the address is not a verified contract (treated as ``Unknown``).
    """
    rows = _result_list(source_payload)
    if not rows:
        return 'Unknown', '', None, None

    row = rows[0]
    abi = str(row.get('ABI') or '').strip()
    name = str(row.get('ContractName') or '').strip()
    if not abi or abi.lower().startswith('contract source code not verified'):
        return 'Unknown', name, None, None
    return 'Contract', name, None, None


def _enrich_from_token(transfer_payload: Any) -> tuple[str | None, int | None, str | None]:
    """Pull (symbol, decimals, name) from an ERC-20 ``tokentx`` row, if any."""
    rows = _result_list(transfer_payload)
    if not rows:
        return None, None, None
    row = rows[0]
    symbol = row.get('tokenSymbol') or None
    decimals = _to_int(row.get('tokenDecimal'), default=-1)
    name = row.get('tokenName') or None
    return symbol, (decimals if decimals >= 0 else None), name


async def _build_contract_read(client: PolygonClient, address: str) -> ContractRead:
    """Assemble a live ``ContractRead`` for an address from Etherscan reads."""
    normalized = address.lower()

    source_payload = await _safe_json(client.get_contract_source(normalized))
    token_payload = await _safe_json(
        client.get_erc20_transfers_by_address(query_params={'address': normalized})
    )

    contract_type, source_name, _, _ = _detect_from_source(source_payload)
    token_symbol, token_decimals, token_name = _enrich_from_token(token_payload)

    name = source_name or token_name or ''
    symbol = token_symbol
    decimals = token_decimals
    if contract_type == 'Unknown' and token_symbol is not None:
        # Verified source missing but it behaves as a token -> it is a contract.
        contract_type = 'Contract'

    # first_seen_block: smallest block we can observe (token transfers fallback).
    token_rows = _result_list(token_payload)
    first_seen_block = 0
    if token_rows:
        blocks = [_to_int(row.get('blockNumber')) for row in token_rows]
        blocks = [block for block in blocks if block > 0]
        first_seen_block = min(blocks) if blocks else 0

    return ContractRead(
        id=int(normalized[-8:], 16),
        address=normalized,
        chain_id=_CHAIN_ID,
        contract_type=contract_type,
        name=name,
        symbol=symbol,
        decimals=decimals,
        abi_key='',
        first_seen_block=first_seen_block,
        metadata_json={},
        polygonscan_url=f'https://polygonscan.com/address/{normalized}',
        linked_market=None,
        created_at=_now_iso(),
    )


async def _txlist(client: PolygonClient, address: str, offset: int) -> list[dict]:
    """Fetch the address transaction list (``txlist``) as a list of rows."""
    payload = await _safe_json(
        client.get_transactions_by_address(
            query_params={'address': address.lower(), 'offset': offset, 'sort': 'asc'}
        )
    )
    return _result_list(payload)


@router.post(
    '/explore',
    status_code=200,
    operation_id='explore_contract',
    tags=['contracts'],
    summary='Explore a contract by address',
    description='Validate a Polygon address and return a live ContractRead.',
)
async def explore_contract(body: ExploreRequest):
    if not _ADDRESS_RE.match(body.address):
        return JSONResponse(
            status_code=400,
            content={
                'detail': 'The address is not a valid Polygon address.',
                'code': 'INVALID_ADDRESS',
                'field': 'address',
            },
        )

    client = PolygonClient()
    contract = await _build_contract_read(client, body.address)
    return ExploreReadyResponse(
        status='ready',
        address=body.address.lower(),
        contract=contract,
    )


@router.get(
    '/{address}',
    response_model=ContractRead,
    status_code=200,
    operation_id='get_contract',
    tags=['contracts'],
    summary='Get a contract by address',
    description='Live ContractRead for an address; 404 when it has no activity.',
)
async def get_contract(address: str) -> ContractRead:
    if not _ADDRESS_RE.match(address):
        raise HTTPException(status_code=404, detail=f'Contract "{address}" not found.')

    client = PolygonClient()
    contract = await _build_contract_read(client, address)
    transactions = await _txlist(client, address, offset=1)
    token_rows = _result_list(
        await _safe_json(
            client.get_erc20_transfers_by_address(query_params={'address': address.lower()})
        )
    )
    if not transactions and not token_rows and contract.contract_type == 'Unknown':
        raise HTTPException(status_code=404, detail=f'Contract "{address}" not found.')
    return contract


@router.get(
    '/{address}/sync-status',
    response_model=SyncStatus,
    status_code=200,
    operation_id='get_contract_sync_status',
    tags=['contracts'],
    summary='Get contract sync status',
    description='Live read has no workers; always reports a completed sync.',
)
async def get_contract_sync_status(address: str) -> SyncStatus:
    if not _ADDRESS_RE.match(address):
        raise HTTPException(status_code=404, detail=f'Contract "{address}" not found.')

    client = PolygonClient()
    current_block = await _latest_block(client)
    logs = _result_list(
        await _safe_json(client.get_event_logs(query_params={'address': address.lower()}))
    )

    return SyncStatus(
        address=address.lower(),
        sync_status='completed',
        progress_pct=100.0,
        last_block_processed=current_block,
        current_polygon_block=current_block,
        blocks_remaining=0,
        events_found=len(logs),
        started_at=_now_iso(),
        estimated_completion_at=None,
        error_message=None,
    )


@router.get(
    '/{address}/summary',
    response_model=ContractSummary,
    status_code=200,
    operation_id='get_contract_summary',
    tags=['contracts'],
    summary='Get contract summary',
    description='Aggregate counts over the address transaction list (live read).',
)
async def get_contract_summary(address: str) -> ContractSummary:
    if not _ADDRESS_RE.match(address):
        raise HTTPException(status_code=404, detail=f'Contract "{address}" not found.')

    client = PolygonClient()
    contract = await _build_contract_read(client, address)
    transactions = await _txlist(client, address, offset=_DEFAULT_TXLIST_OFFSET)

    senders = {str(row.get('from') or '').lower() for row in transactions if row.get('from')}
    receivers = {str(row.get('to') or '').lower() for row in transactions if row.get('to')}
    unique_wallets = len(senders | receivers)

    timestamps = [_to_int(row.get('timeStamp')) for row in transactions if row.get('timeStamp')]
    timestamps = [ts for ts in timestamps if ts > 0]
    first_activity = _unix_to_iso(min(timestamps)) if timestamps else _now_iso()
    last_activity = _unix_to_iso(max(timestamps)) if timestamps else _now_iso()

    return ContractSummary(
        contract=contract,
        total_transactions=len(transactions),
        unique_wallets=unique_wallets,
        total_volume_usd=0.0,
        first_activity=first_activity,
        last_activity=last_activity,
        is_polymarket_market=False,
        linked_market=None,
    )


def _bucket_start(timestamp: int, interval_seconds: int) -> int:
    """Floor a unix timestamp to the start of its interval bucket."""
    return (timestamp // interval_seconds) * interval_seconds


@router.get(
    '/{address}/activity',
    response_model=ContractActivity,
    status_code=200,
    operation_id='get_contract_activity',
    tags=['contracts'],
    summary='Get contract activity',
    description='Transaction counts bucketed by interval over the address txlist.',
)
async def get_contract_activity(
    address: str,
    interval: str = Query(default='1d'),
) -> ContractActivity:
    if not _ADDRESS_RE.match(address):
        raise HTTPException(status_code=404, detail=f'Contract "{address}" not found.')

    interval_key = interval if interval in _INTERVAL_SECONDS else '1d'
    interval_seconds = _INTERVAL_SECONDS[interval_key]

    client = PolygonClient()
    transactions = await _txlist(client, address, offset=_DEFAULT_TXLIST_OFFSET)

    grouped: dict[int, dict[str, Any]] = {}
    timestamps: list[int] = []
    for row in transactions:
        ts = _to_int(row.get('timeStamp'))
        if ts <= 0:
            continue
        timestamps.append(ts)
        start = _bucket_start(ts, interval_seconds)
        bucket = grouped.setdefault(start, {'tx_count': 0, 'senders': set()})
        bucket['tx_count'] += 1
        sender = str(row.get('from') or '').lower()
        if sender:
            bucket['senders'].add(sender)

    buckets = [
        ContractActivityBucket(
            t=_unix_to_iso(start),
            tx_count=data['tx_count'],
            unique_senders=len(data['senders']),
            volume_usd=0.0,
        )
        for start, data in sorted(grouped.items())
    ]

    if timestamps:
        from_time = _unix_to_iso(min(timestamps))
        to_time = _unix_to_iso(max(timestamps))
    else:
        now = datetime.now(tz=UTC)
        from_time = now.isoformat().replace('+00:00', 'Z')
        to_time = (now + timedelta(seconds=0)).isoformat().replace('+00:00', 'Z')

    return ContractActivity(
        address=address.lower(),
        interval=interval_key,
        from_time=from_time,
        to_time=to_time,
        buckets=buckets,
    )


def _log_to_transaction(row: dict) -> ContractTransaction:
    """Map an Etherscan ``getLogs`` row to a ``ContractTransaction``."""
    topics = row.get('topics') if isinstance(row.get('topics'), list) else []
    topic0 = str(topics[0]).lower() if topics else ''
    event_name = _EVENT_BY_TOPIC0.get(topic0, topic0[:10] if topic0 else '')

    from_address = ''
    to_address = ''
    if event_name in _FROM_TO_EVENTS:
        if len(topics) >= 2:
            from_address = _topic_to_address(topics[1])
        if len(topics) >= 3:
            to_address = _topic_to_address(topics[2])

    tx_hash = str(row.get('transactionHash') or '')
    return ContractTransaction(
        tx_hash=tx_hash,
        log_index=_hex_to_int(row.get('logIndex')),
        block_number=_hex_to_int(row.get('blockNumber')),
        time=_unix_to_iso(_hex_to_int(row.get('timeStamp'))),
        event_name=event_name,
        from_address=from_address,
        to_address=to_address,
        decoded_args={},
        value_usd=0.0,
        polygonscan_url=f'https://polygonscan.com/tx/{tx_hash}',
    )


@router.get(
    '/{address}/transactions',
    response_model=PaginatedContractTransactions,
    status_code=200,
    operation_id='get_contract_transactions',
    tags=['contracts'],
    summary='Get contract transactions (event logs)',
    description='Decoded event logs for an address, paginated and filterable.',
)
async def get_contract_transactions(
    address: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    event_name: str | None = Query(default=None),
    from_address: str | None = Query(default=None),
    to_address: str | None = Query(default=None),
) -> PaginatedContractTransactions:
    if not _ADDRESS_RE.match(address):
        raise HTTPException(status_code=404, detail=f'Contract "{address}" not found.')

    client = PolygonClient()
    rows = _result_list(
        await _safe_json(
            client.get_event_logs(
                query_params={'address': address.lower(), 'offset': _DEFAULT_LOGS_OFFSET}
            )
        )
    )

    items = [_log_to_transaction(row) for row in rows]

    if event_name:
        items = [item for item in items if item.event_name == event_name]
    if from_address:
        wanted_from = from_address.lower()
        items = [item for item in items if item.from_address == wanted_from]
    if to_address:
        wanted_to = to_address.lower()
        items = [item for item in items if item.to_address == wanted_to]

    total = len(items)
    page = items[offset : offset + limit]
    return PaginatedContractTransactions(
        items=page,
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + limit < total,
    )
