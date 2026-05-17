from fastapi import FastAPI

from app.api.v1 import (
    contracts_route,
    dashboard_route,
    markets_route,
)
from app.config import settings
from app.config.log import get_logger

# Initialize logger
logger = get_logger('api')


app = FastAPI(
    debug=settings.DEBUG,
    title=settings.APP_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION,
)

app.include_router(markets_route, prefix='/api/v1/markets')
app.include_router(contracts_route, prefix='/api/v1/contracts')
app.include_router(dashboard_route, prefix='/api/v1/dashboard')


@app.get('/health', tags=['health'])
def health():
    return {'status': 'ok'}
