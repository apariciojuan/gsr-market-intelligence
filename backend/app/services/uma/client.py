"""UMA resolutions client — live read from Etherscan, no DB.

Primary source is the **OptimisticOracleV2** (the adapter requests prices there):
its ``RequestPrice`` / ``ProposePrice`` / ``DisputePrice`` / ``Settle`` events,
filtered by ``requester == active adapter``, give the full resolution lifecycle
for real Polymarket markets (proposer, disputer, challenge window, outcome).

Events are grouped per question by ``keccak256(ancillaryData)`` (the question id),
and mapped to the API contract shapes in ``app.schemas.resolution`` (mirroring the
frontend ``types.ts``).

Honest scope notes:
  - Real markets are linked to Gamma in the detail via ``_link_market``
    (``market_id`` parsed from ``ancillaryData`` → ``MarketRead`` + market_impact
    price series); the list still leaves ``market_slug`` empty. ``market_question``
    is parsed from the ``ancillaryData`` text.
  - ``bond_usd`` uses the request ``finalFee`` (a real on-chain USDC amount) as a
    proxy; the exact proposer bond needs an ``eth_call`` to ``getRequest`` (later).
"""

from __future__ import annotations

import datetime as dt
import json
import re
from typing import Any

from eth_utils import to_hex
from web3 import Web3

from app.config.log import get_logger
from app.schemas.resolution import (
    BondHistogramBucket,
    PaginatedResolutions,
    PricePoint,
    ResolutionDetail,
    ResolutionDispute,
    ResolutionListItem,
    ResolutionMarketImpactChart,
    ResolutionStats,
    ResolutionStatus,
    ResolutionTimelineEntry,
)
from app.services.blockchain.log_source import EtherscanLogSource, OnchainLogSource, RawLog
from app.services.polymarket_client import PolymarketClient
from app.services.uma import constants as c
from app.services.uma.decoder import decode_log

logger = get_logger('uma')

# ~7 days of Polygon blocks (~2.1s/block): keeps each event type under Etherscan's
# 1000-row page (ProposePrice/Settle are high-volume) while staying recent.
DEFAULT_LOOKBACK_BLOCKS = 300_000
DEFAULT_LIMIT = 50
MAX_LIMIT = 200
URGENT_THRESHOLD_SECONDS = 1800

_TITLE_RE = re.compile(r'title:\s*(.*?)(?:,\s*description\s*:|$)', re.IGNORECASE | re.DOTALL)
_MARKET_ID_RE = re.compile(r'market_id:\s*(\d+)', re.IGNORECASE)


def _parse_market_id(ancillary_text: str) -> int | None:
    """Polymarket stamps `market_id: <n>` inside the ancillaryData of real markets."""
    match = _MARKET_ID_RE.search(ancillary_text)
    return int(match.group(1)) if match else None


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _to_iso(timestamp: int | None) -> str | None:
    if timestamp is None:
        return None
    return dt.datetime.fromtimestamp(timestamp, dt.UTC).isoformat().replace('+00:00', 'Z')


def _now_ts() -> float:
    return dt.datetime.now(dt.UTC).timestamp()


def _address_topic(address: str) -> str:
    """Left-pad a 20-byte address to a 32-byte indexed-topic value."""
    return '0x' + '0' * 24 + address.lower().removeprefix('0x')


def _low(address: Any) -> str | None:
    if not address:
        return None
    text = str(address)
    if set(text) <= {'0', 'x'}:  # zero address
        return None
    return text.lower()


def _decode_ancillary(value: Any) -> str:
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode('utf-8', 'ignore').strip()
    return str(value or '')


def _extract_question(ancillary_text: str) -> str:
    match = _TITLE_RE.search(ancillary_text)
    if match:
        return match.group(1).strip().strip('.').strip()
    text = ancillary_text.strip()
    if text.lower().startswith('q:'):
        text = text[2:].strip()
    return text[:200] if text else '(unknown question)'


def _synthetic_id(question_id: str) -> int:
    """Stable numeric id derived from the question id (last 8 hex chars)."""
    return int(question_id[-8:], 16)


class _Resolution:
    """Aggregate of one question's lifecycle, built from OptimisticOracle events."""

    def __init__(self, question_id: str, request_timestamp: int, ancillary_text: str) -> None:
        self.question_id = question_id
        self.request_timestamp = request_timestamp
        self.ancillary_text = ancillary_text
        self.market_id = _parse_market_id(ancillary_text)
        self.reward_token: str | None = None
        self.final_fee: int | None = None
        self.init_ts: int | None = None
        self.init_tx: str | None = None
        self.proposer: str | None = None
        self.proposed_price: int | None = None
        self.proposal_ts: int | None = None
        self.proposal_tx: str | None = None
        self.challenge_deadline: int | None = None
        self.disputer: str | None = None
        self.disputed_ts: int | None = None
        self.disputed_tx: str | None = None
        self.settled = False
        self.settle_price: int | None = None
        self.resolved_ts: int | None = None
        self.resolved_tx: str | None = None

    # --- ingestion -----------------------------------------------------------
    def apply(self, name: str, args: dict[str, Any], raw: RawLog) -> None:
        if name == 'RequestPrice':
            self.reward_token = _low(args.get('currency'))
            self.final_fee = int(args.get('finalFee', 0))
            self.init_ts = raw.timestamp
            self.init_tx = raw.tx_hash
        elif name == 'ProposePrice':
            self.proposer = _low(args.get('proposer'))
            self.proposed_price = int(args.get('proposedPrice', 0))
            self.challenge_deadline = int(args.get('expirationTimestamp', 0)) or None
            self.proposal_ts = raw.timestamp
            self.proposal_tx = raw.tx_hash
            self.reward_token = self.reward_token or _low(args.get('currency'))
        elif name == 'DisputePrice':
            self.disputer = _low(args.get('disputer'))
            self.disputed_ts = raw.timestamp
            self.disputed_tx = raw.tx_hash
            if self.proposed_price is None:
                self.proposed_price = int(args.get('proposedPrice', 0))
        elif name == 'Settle':
            self.settled = True
            self.settle_price = int(args.get('price', 0))
            self.resolved_ts = raw.timestamp
            self.resolved_tx = raw.tx_hash
            self.disputer = self.disputer or _low(args.get('disputer'))

    # --- derived -------------------------------------------------------------
    @property
    def status(self) -> ResolutionStatus:
        if self.settled:
            return 'resolved'
        if self.disputer:
            return 'disputed'
        if self.proposer:
            return 'proposed'
        return 'pending'

    @property
    def bond_usd(self) -> float:
        return (self.final_fee / 10**c.USDC_DECIMALS) if self.final_fee else 0.0

    def _seconds_remaining(self) -> int | None:
        if self.status != 'proposed' or not self.challenge_deadline:
            return None
        remaining = int(self.challenge_deadline - _now_ts())
        return max(remaining, 0)

    def to_list_item(self) -> ResolutionListItem:
        seconds_remaining = self._seconds_remaining()
        return ResolutionListItem(
            id=_synthetic_id(self.question_id),
            question_id=self.question_id,
            market_id=self.market_id or 0,
            market_question=_extract_question(self.ancillary_text),
            market_slug='',
            adapter_version=c.ACTIVE_ADAPTER_VERSION,
            adapter_address=c.ACTIVE_ADAPTER,
            status=self.status,
            proposer_address=self.proposer,
            disputer_address=self.disputer,
            proposed_outcome=c.proposed_outcome(self.proposed_price),
            resolved_outcome=c.proposed_outcome(self.settle_price) if self.settled else None,
            bond_usd=self.bond_usd,
            counter_bond_usd=self.bond_usd if self.disputer else None,
            request_timestamp=_to_iso(self.request_timestamp),
            proposal_timestamp=_to_iso(self.proposal_ts),
            challenge_deadline=_to_iso(self.challenge_deadline),
            seconds_remaining=seconds_remaining,
            uma_oracle_url=c.uma_oracle_url(self.question_id),
            is_urgent=(
                seconds_remaining is not None and seconds_remaining < URGENT_THRESHOLD_SECONDS
            ),
        )

    def to_detail(self) -> ResolutionDetail:
        outcome = c.proposed_outcome(self.proposed_price)
        deadline_passed = bool(self.challenge_deadline and self.challenge_deadline <= _now_ts())
        timeline = [
            ResolutionTimelineEntry(
                phase='initialized',
                timestamp=_to_iso(self.init_ts or self.request_timestamp),
                completed=True,
                data={
                    'requester': c.ACTIVE_ADAPTER,
                    'reward_token': self.reward_token,
                    'bond_usd': self.bond_usd,
                },
                tx_hash=self.init_tx,
            ),
            ResolutionTimelineEntry(
                phase='proposed',
                timestamp=_to_iso(self.proposal_ts),
                completed=self.proposer is not None,
                data={'proposer': self.proposer, 'outcome': outcome, 'bond_usd': self.bond_usd}
                if self.proposer
                else None,
                tx_hash=self.proposal_tx,
            ),
            ResolutionTimelineEntry(
                phase='challenge',
                timestamp=_to_iso(self.proposal_ts),
                completed=self.settled or bool(self.disputer) or deadline_passed,
                data={
                    'deadline': _to_iso(self.challenge_deadline),
                    'seconds_remaining': self._seconds_remaining(),
                }
                if self.challenge_deadline
                else None,
            ),
            ResolutionTimelineEntry(
                phase='dvm_vote',
                timestamp=_to_iso(self.disputed_ts),
                completed=self.settled if self.disputer else False,
                data={'disputer': self.disputer} if self.disputer else None,
                tx_hash=self.disputed_tx,
            ),
            ResolutionTimelineEntry(
                phase='resolved',
                timestamp=_to_iso(self.resolved_ts),
                completed=self.settled,
                data={
                    'settled_price': self.settle_price,
                    'outcome': c.proposed_outcome(self.settle_price),
                }
                if self.settled
                else None,
                tx_hash=self.resolved_tx,
            ),
        ]
        if self.settled:
            current_phase = 'resolved'
        elif self.disputer:
            current_phase = 'dvm_vote'
        elif self.proposer:
            current_phase = 'challenge'
        else:
            current_phase = 'initialized'

        dispute = None
        if self.disputer:
            dispute = ResolutionDispute(
                disputer_address=self.disputer,
                counter_bond_usd=self.bond_usd,
                disputed_at=_to_iso(self.disputed_ts) or _to_iso(self.request_timestamp),
                reason=None,
            )

        end_ts = (
            self.resolved_ts or self.disputed_ts or self.proposal_ts or self.request_timestamp
        )
        return ResolutionDetail(
            question_id=self.question_id,
            market=None,
            current_phase=current_phase,
            is_disputed=self.disputer is not None,
            is_resolved=self.settled,
            resolved_outcome=c.proposed_outcome(self.settle_price) if self.settled else None,
            ancillary_data_decoded=self.ancillary_text,
            timeline=timeline,
            dispute=dispute,
            market_impact_chart=ResolutionMarketImpactChart(
                from_time=_to_iso(self.request_timestamp),
                to_time=_to_iso(end_ts),
                # market price overlay arrives with Gamma linkage (later phase)
                price_series_yes=[],
            ),
            uma_oracle_url=c.uma_oracle_url(self.question_id),
        )


class UmaClient:
    def __init__(
        self,
        log_source: OnchainLogSource | None = None,
        adapter: str = c.ACTIVE_ADAPTER,
        oracle: str = c.OPTIMISTIC_ORACLE_V2,
        lookback_blocks: int = DEFAULT_LOOKBACK_BLOCKS,
        polymarket: PolymarketClient | None = None,
    ) -> None:
        self._source: OnchainLogSource = log_source or EtherscanLogSource()
        self._adapter = adapter
        self._oracle = oracle
        self._lookback = lookback_blocks
        self._poly = polymarket or PolymarketClient()

    async def _recent_from_block(self) -> int:
        latest = await self._source.latest_block()
        return max(0, latest - self._lookback)

    def _ingest(self, index: dict[str, _Resolution], logs: list[RawLog]) -> None:
        for raw in logs:
            decoded = decode_log(raw)
            if decoded is None:
                continue
            name, args = decoded
            ancillary = args.get('ancillaryData') or b''
            question_id = to_hex(Web3.keccak(primitive=bytes(ancillary)))
            resolution = index.get(question_id)
            if resolution is None:
                resolution = _Resolution(
                    question_id, int(args.get('timestamp', 0)), _decode_ancillary(ancillary)
                )
                index[question_id] = resolution
            resolution.apply(name, args, raw)

    async def _load_recent(self) -> dict[str, _Resolution]:
        from_block = await self._recent_from_block()
        requester = _address_topic(self._adapter)
        topics = (
            c.TOPIC_REQUEST_PRICE,
            c.TOPIC_PROPOSE_PRICE,
            c.TOPIC_DISPUTE_PRICE,
            c.TOPIC_SETTLE,
        )
        # Serial (not gathered) to respect Etherscan's free-tier rate limit (~3/s).
        index: dict[str, _Resolution] = {}
        for topic in topics:
            logs = await self._source.get_logs(
                self._oracle, topic0=topic, topic1=requester, from_block=from_block
            )
            self._ingest(index, logs)
        return index

    async def list_resolutions(
        self,
        status: str = 'all',
        q: str | None = None,
        limit: int = DEFAULT_LIMIT,
        offset: int = 0,
        order: str = 'desc',
    ) -> PaginatedResolutions:
        index = await self._load_recent()
        items = [r.to_list_item() for r in index.values()]
        items.sort(key=lambda i: i.request_timestamp, reverse=(order != 'asc'))

        if status and status != 'all':
            items = [i for i in items if i.status == status]
        if q:
            needle = q.lower()
            items = [i for i in items if needle in i.market_question.lower()]

        total = len(items)
        capped = min(max(limit, 1), MAX_LIMIT)
        window = items[offset : offset + capped]
        return PaginatedResolutions(
            items=window,
            total=total,
            limit=capped,
            offset=offset,
            has_more=offset + len(window) < total,
        )

    async def get_stats(self, window: str = '30d') -> ResolutionStats:
        index = await self._load_recent()
        resolutions = list(index.values())
        total = len(resolutions)
        disputed = sum(1 for r in resolutions if r.disputer)
        durations = [
            r.resolved_ts - r.request_timestamp for r in resolutions if r.resolved_ts is not None
        ]
        avg_seconds = int(sum(durations) / len(durations)) if durations else 0

        edges = [
            ('0-100', 0, 100),
            ('100-500', 100, 500),
            ('500-1000', 500, 1000),
            ('1000-5000', 1000, 5000),
            ('5000+', 5000, float('inf')),
        ]
        bonds = [r.bond_usd for r in resolutions]
        histogram = [
            BondHistogramBucket(bucket=name, count=sum(1 for b in bonds if lo <= b < hi))
            for name, lo, hi in edges
        ]
        return ResolutionStats(
            window=window,
            total_resolutions=total,
            disputed_count=disputed,
            dispute_rate_pct=round(100 * disputed / total, 1) if total else 0.0,
            avg_resolution_seconds=avg_seconds,
            bond_histogram=histogram,
        )

    async def get_resolution(self, question_id: str) -> ResolutionDetail | None:
        qid = question_id.lower()
        if not qid.startswith('0x'):
            qid = f'0x{qid}'
        index = await self._load_recent()
        resolution = index.get(qid)
        if resolution is None:
            return None
        detail = resolution.to_detail()
        if resolution.market_id:
            await self._link_market(detail, resolution)
        return detail

    async def _link_market(self, detail: ResolutionDetail, resolution: _Resolution) -> None:
        """Link the resolution to its Gamma market (market_id parsed from ancillaryData).

        Best-effort: fills ``detail.market`` and the market-impact price series from
        Polymarket. Any upstream failure leaves the (already valid) detail untouched.
        """
        try:
            market = (
                await self._poly.get_market_by_id(market_id=str(resolution.market_id))
            ).json()
        except Exception:
            logger.warning('Gamma lookup failed for market_id=%s', resolution.market_id)
            return
        if isinstance(market, list):
            market = market[0] if market else None
        if not isinstance(market, dict):
            return

        detail.market = {
            'id': resolution.market_id,
            'slug': market.get('slug') or '',
            'question': market.get('question') or _extract_question(resolution.ancillary_text),
            'condition_id': market.get('conditionId') or '',
            'category': market.get('category') or '',
            'volume_total': _safe_float(market.get('volume')),
            'liquidity': _safe_float(market.get('liquidity')),
            'active': bool(market.get('active')),
            'resolved': bool(market.get('closed')),
        }

        tokens = market.get('clobTokenIds')
        if isinstance(tokens, str):
            try:
                tokens = json.loads(tokens)
            except ValueError:
                tokens = []
        if not (isinstance(tokens, list) and tokens):
            return
        try:
            history = (
                await self._poly.get_prices_history_by_market(
                    {'market': tokens[0], 'interval': '1d'}
                )
            ).json()
        except Exception:
            return
        points = history.get('history') if isinstance(history, dict) else None
        if isinstance(points, list):
            detail.market_impact_chart.price_series_yes = [
                PricePoint(t=_to_iso(int(p['t'])), v=_safe_float(p['p']))
                for p in points
                if isinstance(p, dict) and 't' in p and 'p' in p
            ]
