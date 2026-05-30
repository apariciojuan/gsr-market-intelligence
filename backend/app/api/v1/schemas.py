from pydantic import BaseModel, Field

class PolygonQueryParams(BaseModel):
    address: str = Field(..., description="Address of the wallet or smart contract to audit")
    startblock: int = 0
    endblock: int = 999999999
    page: int = 1
    offset: int = 100
    sort: str = "asc"

class EventLogQueryParams(BaseModel):
    address: str | None = Field(None, description="Address of the smart contract (optional)")
    topic0: str | None = Field(None, description="Cryptographic hash of the event to track (optional)")
    startblock: int = 0
    endblock: int = 999999999
    page: int = 1
    offset: int = 100
    sort: str = "asc"