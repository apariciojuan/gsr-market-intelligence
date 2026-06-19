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

    EXTERNAL_SIGNALS_ENABLED: bool = True
    EXTERNAL_SIGNALS_MAX_AGE_DAYS: int = 30
    EXTERNAL_SIGNALS_RSS_TIMEOUT_SECONDS: int = 15
    EXTERNAL_SIGNALS_REQUEST_DELAY_SECONDS: float = 0.35
    EXTERNAL_SIGNALS_MIN_MATCH_SCORE: float = 0.05
    EXTERNAL_SIGNALS_MAX_PER_MARKET: int = 25
    EXTERNAL_SIGNALS_GLOBAL_FEEDS: str = (
        'https://www.coindesk.com/arc/outboundfeeds/rss/,'
        'https://feeds.reuters.com/reuters/topNews'
    )
    EXTERNAL_SIGNALS_COLLECT_INTERVAL_SECONDS: int = 21600
    EXTERNAL_SIGNALS_SOCIAL_ENABLED: bool = True
    EXTERNAL_SIGNALS_X_SEARCH_ENABLED: bool = True
    EXTERNAL_SIGNALS_X_NITTER_BASES: str = (
        'https://nitter.net,https://nitter.poast.org,https://nitter.privacydev.net'
    )
    EXTERNAL_SIGNALS_X_MAX_BASES: int = 2
    EXTERNAL_SIGNALS_X_MAX_TERMS_PER_MARKET: int = 3
    EXTERNAL_SIGNALS_X_ADDITIONAL_FEEDS: str = ''
    EXTERNAL_SIGNALS_TELEGRAM_ENABLED: bool = True
    EXTERNAL_SIGNALS_TELEGRAM_CHANNELS: str = ''
    EXTERNAL_SIGNALS_TELEGRAM_ADDITIONAL_FEEDS: str = ''
    EXTERNAL_SIGNALS_TELEGRAM_SCRAPE_ENABLED: bool = True
    EXTERNAL_SIGNALS_TELEGRAM_SCRAPE_MAX_POSTS_PER_CHANNEL: int = 50

    model_config = {'env_file': '.env'}

    def external_signals_global_feed_list(self) -> list[str]:
        """Parse comma-separated RSS feed URLs from settings."""
        raw = (self.EXTERNAL_SIGNALS_GLOBAL_FEEDS or '').strip()
        if not raw:
            return []
        return [url.strip() for url in raw.split(',') if url.strip()]

    def _parse_csv(self, raw: str) -> list[str]:
        if not raw:
            return []
        return [item.strip() for item in raw.split(',') if item.strip()]

    def external_signals_x_nitter_bases(self) -> list[str]:
        return self._parse_csv(self.EXTERNAL_SIGNALS_X_NITTER_BASES)

    def external_signals_x_additional_feeds(self) -> list[str]:
        return self._parse_csv(self.EXTERNAL_SIGNALS_X_ADDITIONAL_FEEDS)

    def external_signals_telegram_channels(self) -> list[str]:
        return self._parse_csv(self.EXTERNAL_SIGNALS_TELEGRAM_CHANNELS)

    def external_signals_telegram_additional_feeds(self) -> list[str]:
        return self._parse_csv(self.EXTERNAL_SIGNALS_TELEGRAM_ADDITIONAL_FEEDS)


settings = Settings()
