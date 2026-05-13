
from app.api.v1 import markets_route
from app.config import settings
from app.config.log import get_logger
from fastapi import FastAPI

# Initialize logger
logger = get_logger('api')


app = FastAPI(
    debug=settings.DEBUG,
    title=settings.APP_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION,
)

app.include_router(markets_route, prefix='/api/v1/markets')



@app.get('/health', tags=['health'])
def health():
    return {'status': 'ok'}
