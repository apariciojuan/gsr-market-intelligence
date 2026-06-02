"""Chainlink price-feed client — live read from Etherscan, no RPC node.

Chainlink aggregator proxies on Polygon are read through Etherscan's ``eth_call``
proxy (the project has no RPC endpoint, and the feeds' ``AnswerUpdated`` logs are
not retrievable through the proxy address). Each read is a single ``eth_call`` to
``latestRoundData()`` plus a one-off ``decimals()`` call (cached per feed).

The client depends on the ``OnchainLogSource`` port (DIP), not on Etherscan
directly, so a web3.py-backed source can be swapped in later (OCP). The default is
``EtherscanLogSource``.

The overlay returned by :meth:`ChainlinkClient.build_overlay` mirrors the
``ChainlinkOverlay`` schema in ``app.schemas.market``: ``{asset_pair, feed_address,
series: [{'t', 'v'}]}``. There is no historical feed read here, so the current spot
price is replicated across every timestamp in ``series_ts`` to keep the overlay line
aligned with the market's ``series_yes`` (so the chart actually draws it).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from eth_abi import decode as abi_decode

from app.config.log import get_logger
from app.services.blockchain.log_source import EtherscanLogSource, OnchainLogSource

logger = get_logger('chainlink')

# Function selectors (first 4 bytes of keccak of the signature) — verified on-chain.
SELECTOR_LATEST_ROUND_DATA = '0xfeaf968c'
SELECTOR_DECIMALS = '0x313ce567'

# ABI of latestRoundData(): (uint80, int256, uint256, uint256, uint80).
_LATEST_ROUND_DATA_TYPES = ['uint80', 'int256', 'uint256', 'uint256', 'uint80']


@dataclass(frozen=True)
class ChainlinkFeedDef:
    """A Chainlink aggregator-proxy feed and the keywords that map a market to it."""

    asset_pair: str
    feed_address: str
    decimals: int
    keywords: tuple[str, ...]


# Polygon (chain_id 137) aggregator proxies, addresses lowercase per project convention.
# All five report USD with 8 decimals; keywords are matched whole-word, in this order.
CHAINLINK_FEEDS: list[ChainlinkFeedDef] = [
    ChainlinkFeedDef(
        asset_pair='BTC/USD',
        feed_address='0xc907e116054ad103354f2d350fd2514433d57f6f',
        decimals=8,
        keywords=('btc', 'bitcoin'),
    ),
    ChainlinkFeedDef(
        asset_pair='ETH/USD',
        feed_address='0xf9680d99d6c9589e2a93a78a04a279e509205945',
        decimals=8,
        keywords=('eth', 'ethereum', 'ether'),
    ),
    ChainlinkFeedDef(
        asset_pair='MATIC/USD',
        feed_address='0xab594600376ec9fd91f8e885dadf0ce036862de0',
        decimals=8,
        keywords=('matic', 'polygon'),
    ),
    ChainlinkFeedDef(
        asset_pair='SOL/USD',
        feed_address='0x10c8264c0935b3b9870013e057f330ff3e9c56dc',
        decimals=8,
        keywords=('sol', 'solana'),
    ),
    ChainlinkFeedDef(
        asset_pair='USDC/USD',
        feed_address='0xfe4a8cc5b5b2366c1b58bea3858e81843581b2f7',
        decimals=8,
        keywords=('usdc',),
    ),
]


@dataclass(frozen=True)
class ChainlinkReading:
    """A decoded ``latestRoundData()`` answer for one feed."""

    round_id: int
    answer_raw: int
    price_usd: float
    updated_at: int


def _decode_hex(result: str) -> bytes:
    return bytes.fromhex(result[2:] if result.startswith('0x') else result)


class ChainlinkClient:
    """Reads Chainlink USD feeds on Polygon through an ``OnchainLogSource``."""

    def __init__(self, source: OnchainLogSource | None = None) -> None:
        self._source: OnchainLogSource = source or EtherscanLogSource()
        self._decimals_cache: dict[str, int] = {}

    async def get_decimals(self, feed: ChainlinkFeedDef) -> int:
        """On-chain ``decimals()`` for a feed, cached in memory (falls back to def)."""
        cached = self._decimals_cache.get(feed.feed_address)
        if cached is not None:
            return cached
        result = await self._source.eth_call(feed.feed_address, SELECTOR_DECIMALS)
        decimals = feed.decimals
        if result is not None:
            try:
                (decimals,) = abi_decode(['uint8'], _decode_hex(result))
            except Exception:  # noqa: BLE001 — bad payload: keep the known feed default
                logger.warning('chainlink decimals decode failed for %s', feed.asset_pair)
        self._decimals_cache[feed.feed_address] = decimals
        return decimals

    async def get_latest(self, feed: ChainlinkFeedDef) -> ChainlinkReading:
        """Single ``latestRoundData()`` read, decoded into a :class:`ChainlinkReading`."""
        result = await self._source.eth_call(feed.feed_address, SELECTOR_LATEST_ROUND_DATA)
        if result is None:
            raise RuntimeError(f'Chainlink eth_call failed for {feed.asset_pair}')
        round_id, answer, _started_at, updated_at, _answered_in_round = abi_decode(
            _LATEST_ROUND_DATA_TYPES, _decode_hex(result)
        )
        decimals = await self.get_decimals(feed)
        return ChainlinkReading(
            round_id=round_id,
            answer_raw=answer,
            price_usd=answer / 10**decimals,
            updated_at=updated_at,
        )

    def resolve_feed_for_market(self, text: str) -> ChainlinkFeedDef | None:
        """First feed whose keyword matches ``text`` as a whole word (avoids 'ethics')."""
        haystack = text.lower()
        for feed in CHAINLINK_FEEDS:
            for keyword in feed.keywords:
                if re.search(rf'\b{re.escape(keyword)}\b', haystack):
                    return feed
        return None

    async def build_overlay(self, text: str, series_ts: list[str]) -> dict | None:
        """Overlay dict (``ChainlinkOverlay`` shape) for a market, or ``None``.

        Returns ``None`` when no feed matches the text or ``series_ts`` is empty.
        Otherwise replicates the current spot price across every timestamp so the
        overlay line stays aligned with the market's ``series_yes``.
        """
        if not series_ts:
            return None
        feed = self.resolve_feed_for_market(text)
        if feed is None:
            return None
        reading = await self.get_latest(feed)
        return {
            'asset_pair': feed.asset_pair,
            'feed_address': feed.feed_address,
            'series': [{'t': t, 'v': reading.price_usd} for t in series_ts],
        }
