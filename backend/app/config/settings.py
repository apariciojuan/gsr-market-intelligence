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

    POLYMARKET_GAMMA_API: str = ''
    POLYMARKET_DATA_API: str = ''
    POLYMARKET_CLOB_API: str = ''
    POLYMARKET_CLOB_WS: str = ''

    POLYGON_CHAIN_ID: int = 0
    POLYGON_RPC_URL: str = ''
    
    ALCHEMY_API_KEY: str = ''

    model_config = {'env_file': '.env'}


settings = Settings()
