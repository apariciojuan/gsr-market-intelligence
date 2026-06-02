"""Pydantic schemas for the global search endpoint.

Mirrors `frontend/app/lib/api/types.ts` (SearchResults and its grouped results),
the single source of truth for the FE↔BE shapes.
"""

from __future__ import annotations

from pydantic import BaseModel


class SearchMarketResult(BaseModel):
    id: int
    slug: str
    question: str
    category: str


class SearchWalletResult(BaseModel):
    address: str
    label: str | None = None
    total_volume_usd: float


class SearchContractResult(BaseModel):
    address: str
    type: str
    name: str


class SearchTagResult(BaseModel):
    name: str
    market_count: int


class SearchResultsGroups(BaseModel):
    markets: list[SearchMarketResult]
    wallets: list[SearchWalletResult]
    contracts: list[SearchContractResult]
    tags: list[SearchTagResult]


class SearchResults(BaseModel):
    query: str
    results: SearchResultsGroups
