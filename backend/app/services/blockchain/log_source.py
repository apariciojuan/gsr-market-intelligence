"""On-chain log source abstraction (port + Etherscan adapter).

`OnchainLogSource` is the port the UMA client depends on (DIP). The only
implementation today reads logs from the Etherscan v2 REST API, which is already
configured in this project and reuses the base `RequestClient`. A web3.py-backed
implementation can be added later without touching `UmaClient` (OCP).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol

from app.config import settings
from app.config.log import get_logger
from app.core import RequestClient

logger = get_logger('blockchain')


@dataclass(frozen=True)
class RawLog:
    """A single event log, source-agnostic (still ABI-encoded)."""

    address: str
    topics: list[str]
    data: str
    block_number: int
    block_hash: str
    timestamp: int
    tx_hash: str
    log_index: int

    @classmethod
    def from_etherscan(cls, item: dict) -> RawLog:
        raw_index = item.get('logIndex') or '0x0'
        return cls(
            address=item['address'],
            topics=item.get('topics', []),
            data=item.get('data', '0x'),
            block_number=int(item['blockNumber'], 16),
            block_hash=item.get('blockHash', '0x' + '00' * 32),
            timestamp=int(item['timeStamp'], 16),
            tx_hash=item['transactionHash'],
            log_index=int(raw_index, 16),
        )


class OnchainLogSource(Protocol):
    """Port: fetch event logs for a contract/topics over a block range."""

    async def latest_block(self) -> int: ...

    async def eth_call(self, to: str, data: str, tag: str = 'latest') -> str | None: ...

    async def get_logs(
        self,
        address: str,
        topic0: str | None = None,
        topic1: str | None = None,
        from_block: int = 0,
        to_block: int | str = 'latest',
        offset: int = 1000,
    ) -> list[RawLog]: ...


class EtherscanLogSource:
    """`OnchainLogSource` backed by the Etherscan v2 REST API.

    Reuses the project's base `RequestClient` (httpx) for the HTTP call. The
    Etherscan API key and base URL come from settings; the API key travels as a
    query param (no auth header), so requests are sent unauthenticated.
    """

    def __init__(self) -> None:
        self._client = RequestClient()
        self._base = (settings.ETHERSCAN_API_URL or 'https://api.etherscan.io/v2/api').rstrip('/')
        self._api_key = settings.ETHERSCAN_API_KEY
        self._chain_id = settings.POLYGON_CHAIN_ID or '137'

    def _url(self, params: dict[str, str]) -> str:
        full = {**params, 'chainid': self._chain_id, 'apikey': self._api_key}
        query = '&'.join(f'{key}={value}' for key, value in full.items())
        return f'{self._base}?{query}'

    async def _request_json(self, params: dict[str, str], retries: int = 4) -> dict:
        """GET + parse JSON, retrying transient Etherscan rate-limit responses."""
        payload: dict = {}
        for attempt in range(retries):
            response = await self._client.get(self._url(params), authenticate=False)
            payload = response.json()
            result = payload.get('result')
            blob = f'{payload.get("message", "")} {result if isinstance(result, str) else ""}'
            if 'rate limit' in blob.lower():
                await asyncio.sleep(0.8 * (attempt + 1))
                continue
            return payload
        return payload

    async def latest_block(self) -> int:
        payload = await self._request_json({'module': 'proxy', 'action': 'eth_blockNumber'})
        result = payload.get('result')
        if not isinstance(result, str) or not result.startswith('0x'):
            raise RuntimeError(f'Etherscan eth_blockNumber failed: {result}')
        return int(result, 16)

    async def eth_call(self, to: str, data: str, tag: str = 'latest') -> str | None:
        """Read-only contract call via Etherscan's `eth_call` proxy (no RPC node).

        Returns the ABI-encoded result hex (e.g. `0x...`) or `None` when the proxy
        returns an error / non-hex payload (the caller decides how to handle it).
        """
        payload = await self._request_json(
            {'module': 'proxy', 'action': 'eth_call', 'to': to, 'data': data, 'tag': tag}
        )
        result = payload.get('result')
        if not isinstance(result, str) or not result.startswith('0x'):
            logger.warning('Etherscan eth_call failed for %s: %s', to, result)
            return None
        return result

    async def get_logs(
        self,
        address: str,
        topic0: str | None = None,
        topic1: str | None = None,
        from_block: int = 0,
        to_block: int | str = 'latest',
        offset: int = 1000,
    ) -> list[RawLog]:
        params: dict[str, str] = {
            'module': 'logs',
            'action': 'getLogs',
            'address': address,
            'fromBlock': str(from_block),
            'toBlock': str(to_block),
            'page': '1',
            'offset': str(offset),
        }
        if topic0:
            params['topic0'] = topic0
        if topic1:
            params['topic1'] = topic1
        if topic0 and topic1:
            params['topic0_1_opr'] = 'and'

        payload = await self._request_json(params)
        result = payload.get('result')
        if not isinstance(result, list):
            message = str(payload.get('message', ''))
            # "No records found" is a legitimate empty result; anything else (rate limit,
            # bad key, query timeout, ...) is an error and must NOT be masked as empty.
            if 'No records found' in message or 'No logs found' in message:
                return []
            raise RuntimeError(f'Etherscan getLogs failed: {message or result}')
        if len(result) >= offset:
            logger.warning(
                'Etherscan getLogs returned a full page (%d) for %s; results may be truncated.',
                offset,
                address,
            )
        return [RawLog.from_etherscan(item) for item in result]
