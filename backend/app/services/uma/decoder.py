"""Decode UMA event logs using web3's ABI codec (no RPC connection needed).

`Web3()` with no provider is used purely as an ABI decoder: `process_log` turns
an ABI-encoded log (topics + data) into typed Python args. This keeps decoding
correct and centralized regardless of where the raw logs came from.
"""

from __future__ import annotations

from typing import Any

from eth_utils import event_abi_to_log_topic, to_hex
from hexbytes import HexBytes
from web3 import Web3

from app.config.log import get_logger
from app.services.blockchain.log_source import RawLog
from app.services.uma.constants import EVENT_ABIS

logger = get_logger('uma')

_w3 = Web3()
_contract = _w3.eth.contract(abi=EVENT_ABIS)
_EVENT_NAME_BY_TOPIC = {to_hex(event_abi_to_log_topic(abi)): abi['name'] for abi in EVENT_ABIS}


def decode_log(raw: RawLog) -> tuple[str, dict[str, Any]] | None:
    """Return ``(event_name, args)`` for a known UMA event, else ``None``."""
    if not raw.topics:
        return None
    event_name = _EVENT_NAME_BY_TOPIC.get(raw.topics[0].lower())
    if event_name is None:
        return None

    event = getattr(_contract.events, event_name)()
    log = {
        'topics': [HexBytes(topic) for topic in raw.topics],
        'data': HexBytes(raw.data),
        'logIndex': raw.log_index,
        'transactionIndex': 0,
        'transactionHash': HexBytes(raw.tx_hash),
        'address': Web3.to_checksum_address(raw.address),
        'blockHash': HexBytes(raw.block_hash),
        'blockNumber': raw.block_number,
    }
    try:
        decoded = event.process_log(log)
    except Exception:
        logger.warning('Failed to decode %s log (tx=%s)', event_name, raw.tx_hash)
        return None
    return event_name, dict(decoded['args'])
