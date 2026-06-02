from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = 'API Project'
    DEBUG: bool = False
    DESCRIPTION: str = 'GSR project'
    VERSION: str = '0.1.0'
    ALLOWED_HOSTS: str = '*'

    LOG_LEVEL: str = ''
    LOG_FILE: str = ''
    LOG_MAX_SIZE: int = 0
    LOG_BACKUP_COUNT: int = 0

    POSTGRES_USER: str = ''
    POSTGRES_PASSWORD: str = ''
    POSTGRES_DB: str = ''
    POSTGRES_HOST: str = ''
    POSTGRES_PORT: str = ''

    REDIS_HOST: str = ''
    REDIS_PORT: str = ''
    REDIS_URL: str = ''
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ''

    POLYMARKET_GAMMA_API: str = ''
    POLYMARKET_DATA_API: str = ''
    POLYMARKET_CLOB_API: str = ''
    POLYMARKET_CLOB_WS: str = ''

    POLYGON_CHAIN_ID: str = '137'
    POLYGON_RPC_URL: str = ''
    ETHERSCAN_API_KEY: str = ''
    ETHERSCAN_API_URL: str = ''
    ALCHEMY_API_KEY: str = ''

    CHAINLINK_POLL_INTERVAL_SECONDS: int = 60
    MARKET_PRICE_POLL_INTERVAL_SECONDS: int = 300
    MARKET_PRICE_INTERVAL: str = '1h'
    MARKET_PRICE_FIDELITY: int = 1
    MARKETS_INGEST_INTERVAL_SECONDS: int = 1800
    MARKETS_INGEST_LIMIT: int = 100

    # Divergence
    DIVERGENCE_WINDOW_MINUTES: int = 60
    DIVERGENCE_GAP_MIN_PCT: float = 5.0
    DIVERGENCE_EXT_MOVE_MIN_PCT: float = 8.0
    DIVERGENCE_MKT_FLAT_MAX_PCT: float = 2.0
    DIVERGENCE_SEVERITY_BUCKETS: str = '5:1,8:2,12:3,20:4'
    DIVERGENCE_CALC_INTERVAL_MINUTES: int = 10
    DIVERGENCE_MINI_CHART_HOURS: int = 24

    model_config = {'env_file': '.env'}


settings = Settings()
