from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    contracts_route,
    dashboard_route,
    ecosystem_route,
    external_signals_route,
    health_route,
    markets_route,
    resolutions_route,
    search_route,
    signals_route,
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(markets_route, prefix='/api/v1/markets')
app.include_router(contracts_route, prefix='/api/v1/contracts')
app.include_router(dashboard_route, prefix='/api/v1/dashboard')
app.include_router(resolutions_route, prefix='/api/v1/resolutions')
app.include_router(search_route, prefix='/api/v1/search')
app.include_router(health_route, prefix='/api/v1/health')
app.include_router(ecosystem_route, prefix='/api/v1/ecosystem')
app.include_router(signals_route, prefix='/api/v1/signals')
app.include_router(external_signals_route, prefix='/api/v1/external-signals')


@app.get('/health', tags=['health'])
def health():
    return {'status': 'ok'}
