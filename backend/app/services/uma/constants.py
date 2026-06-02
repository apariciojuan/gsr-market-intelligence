"""UMA on-chain constants: adapter addresses, event ABIs and topic0 hashes.

The neg-risk UMA CTF Adapter is the one Polymarket actively uses today (verified
on-chain: it has recent `QuestionInitialized` events, while v2/v3 are dormant).
All addresses are Polygon (chain_id 137), stored lowercase per project convention.
The event signatures (hence topic0) are shared across the v2/v3/neg-risk adapters.
"""

from __future__ import annotations

# --- adapter addresses (lowercase) ---
NEG_RISK_UMA_ADAPTER = '0x2f5e3684cb1f318ec51b00edba38d79ac2c0aa9d'
UMA_ADAPTER_V2 = '0x6a9d222616c90fca5754cd1333cfd9b7fb6a4f74'
UMA_ADAPTER_V3 = '0x157ce2d672854c848c9b79c49a8cc6cc89176a49'

# Active adapter feeding the resolutions list in Phase 1.
ACTIVE_ADAPTER = NEG_RISK_UMA_ADAPTER
ACTIVE_ADAPTER_VERSION = 'neg-risk'

# --- event ABIs (only the events we decode) ---
QUESTION_INITIALIZED_ABI = {
    'anonymous': False,
    'name': 'QuestionInitialized',
    'type': 'event',
    'inputs': [
        {'indexed': True, 'name': 'questionID', 'type': 'bytes32'},
        {'indexed': True, 'name': 'requestTimestamp', 'type': 'uint256'},
        {'indexed': True, 'name': 'creator', 'type': 'address'},
        {'indexed': False, 'name': 'ancillaryData', 'type': 'bytes'},
        {'indexed': False, 'name': 'rewardToken', 'type': 'address'},
        {'indexed': False, 'name': 'reward', 'type': 'uint256'},
        {'indexed': False, 'name': 'proposalBond', 'type': 'uint256'},
    ],
}
QUESTION_RESOLVED_ABI = {
    'anonymous': False,
    'name': 'QuestionResolved',
    'type': 'event',
    'inputs': [
        {'indexed': True, 'name': 'questionID', 'type': 'bytes32'},
        {'indexed': True, 'name': 'settledPrice', 'type': 'int256'},
        {'indexed': False, 'name': 'payouts', 'type': 'uint256[]'},
    ],
}
# --- OptimisticOracleV2 event ABIs (the rich source for the resolution lifecycle) ---
REQUEST_PRICE_ABI = {
    'anonymous': False,
    'name': 'RequestPrice',
    'type': 'event',
    'inputs': [
        {'indexed': True, 'name': 'requester', 'type': 'address'},
        {'indexed': False, 'name': 'identifier', 'type': 'bytes32'},
        {'indexed': False, 'name': 'timestamp', 'type': 'uint256'},
        {'indexed': False, 'name': 'ancillaryData', 'type': 'bytes'},
        {'indexed': False, 'name': 'currency', 'type': 'address'},
        {'indexed': False, 'name': 'reward', 'type': 'uint256'},
        {'indexed': False, 'name': 'finalFee', 'type': 'uint256'},
    ],
}
PROPOSE_PRICE_ABI = {
    'anonymous': False,
    'name': 'ProposePrice',
    'type': 'event',
    'inputs': [
        {'indexed': True, 'name': 'requester', 'type': 'address'},
        {'indexed': True, 'name': 'proposer', 'type': 'address'},
        {'indexed': False, 'name': 'identifier', 'type': 'bytes32'},
        {'indexed': False, 'name': 'timestamp', 'type': 'uint256'},
        {'indexed': False, 'name': 'ancillaryData', 'type': 'bytes'},
        {'indexed': False, 'name': 'proposedPrice', 'type': 'int256'},
        {'indexed': False, 'name': 'expirationTimestamp', 'type': 'uint256'},
        {'indexed': False, 'name': 'currency', 'type': 'address'},
    ],
}
DISPUTE_PRICE_ABI = {
    'anonymous': False,
    'name': 'DisputePrice',
    'type': 'event',
    'inputs': [
        {'indexed': True, 'name': 'requester', 'type': 'address'},
        {'indexed': True, 'name': 'proposer', 'type': 'address'},
        {'indexed': True, 'name': 'disputer', 'type': 'address'},
        {'indexed': False, 'name': 'identifier', 'type': 'bytes32'},
        {'indexed': False, 'name': 'timestamp', 'type': 'uint256'},
        {'indexed': False, 'name': 'ancillaryData', 'type': 'bytes'},
        {'indexed': False, 'name': 'proposedPrice', 'type': 'int256'},
    ],
}
SETTLE_ABI = {
    'anonymous': False,
    'name': 'Settle',
    'type': 'event',
    'inputs': [
        {'indexed': True, 'name': 'requester', 'type': 'address'},
        {'indexed': True, 'name': 'proposer', 'type': 'address'},
        {'indexed': True, 'name': 'disputer', 'type': 'address'},
        {'indexed': False, 'name': 'identifier', 'type': 'bytes32'},
        {'indexed': False, 'name': 'timestamp', 'type': 'uint256'},
        {'indexed': False, 'name': 'ancillaryData', 'type': 'bytes'},
        {'indexed': False, 'name': 'price', 'type': 'int256'},
        {'indexed': False, 'name': 'payout', 'type': 'uint256'},
    ],
}

EVENT_ABIS = [
    QUESTION_INITIALIZED_ABI,
    QUESTION_RESOLVED_ABI,
    REQUEST_PRICE_ABI,
    PROPOSE_PRICE_ABI,
    DISPUTE_PRICE_ABI,
    SETTLE_ABI,
]

# Optimistic Oracle V2 on Polygon (the oracle the adapter requests prices from).
OPTIMISTIC_ORACLE_V2 = '0xee3afe347d5c74317041e2618c49534daf887c24'
# USDC on Polygon (the usual bond/reward currency, 6 decimals).
USDC_POLYGON = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'

# topic0 (keccak of the event signature) — verified on-chain.
TOPIC_QUESTION_INITIALIZED = '0xeee0897acd6893adcaf2ba5158191b3601098ab6bece35c5d57874340b64c5b7'
TOPIC_QUESTION_RESOLVED = '0x566c3fbdd12dd86bb341787f6d531f79fd7ad4ce7e3ae2d15ac0ca1b601af9df'
TOPIC_REQUEST_PRICE = '0xf1679315ff325c257a944e0ca1bfe7b26616039e9511f9610d4ba3eca851027b'
TOPIC_PROPOSE_PRICE = '0x6e51dd00371aabffa82cd401592f76ed51e98a9ea4b58751c70463a2c78b5ca1'
TOPIC_DISPUTE_PRICE = '0x5165909c3d1c01c5d1e121ac6f6d01dda1ba24bc9e1f975b5a375339c15be7f3'
TOPIC_SETTLE = '0x3f384afb4bd9f0aef0298c80399950011420eb33b0e1a750b20966270247b9a0'

# USDC has 6 decimals on Polygon; bonds/rewards are denominated in the reward token.
USDC_DECIMALS = 6

# Proposed/settled price encodings (UMA YES_OR_NO_QUERY): 1e18 = YES, 0 = NO, 0.5e18 = 50/50.
PRICE_YES = 10**18
PRICE_NO = 0
PRICE_UNRESOLVABLE = 5 * 10**17


def proposed_outcome(price: int | None) -> str | None:
    """Human-readable outcome from an OO int256 price (YES_OR_NO_QUERY)."""
    if price is None:
        return None
    if price == PRICE_YES:
        return 'Yes'
    if price == PRICE_NO:
        return 'No'
    if price == PRICE_UNRESOLVABLE:
        return 'Unresolvable (50/50)'
    return str(price / PRICE_YES)


_UMA_ORACLE_BASE = 'https://oracle.uma.xyz/request'


def uma_oracle_url(question_id: str) -> str:
    """Public UMA oracle URL for a given question id."""
    return f'{_UMA_ORACLE_BASE}?questionId={question_id}'
