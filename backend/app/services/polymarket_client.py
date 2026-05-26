from app.config import settings
from app.core import RequestClient as BaseRequestClient


class PolymarketClient(BaseRequestClient):
    def __init__(self, api_key: str | None = None, auth_type: str | None = 'Bearer'):
        super().__init__(api_key, auth_type)
        self.url = {
            'gamma': settings.POLYMARKET_GAMMA_API,
            'data': settings.POLYMARKET_DATA_API,
            'clob': settings.POLYMARKET_CLOB_API,
        }

    def _query_string(self, query_params: dict | None = None) -> str:
        if not query_params:
            return ''
        return '&'.join(f'{key}={value}' for key, value in query_params.items())

    def _build_url(self, source: str, path: str, query_params: dict | None = None) -> str:
        url = f"{self.url[source]}{path}"
        query_string = self._query_string(query_params)
        return f'{url}?{query_string}' if query_string else url

    async def get_events(self, query_params=None, data=None):
        default_param_query = {'limit': 20, 'offset': 0}

        if query_params:
            default_param_query.update(query_params)

        url = self._build_url('gamma', 'events', default_param_query)
        return await self.get(url, data=data, authenticate=False)

    async def get_markets(self, query_params=None, data=None):
        """_Get markets from Polymarket API_

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - limit: Number of markets to return (default: 20, max: 100)
                - offset: Number of markets to skip (default: 0)
                - order: string separate by comma
                - slug: Filter markets by slug (optional)
                - id: Filter markets by ID (optional)
                - closed: Filter markets by closed status (optional, options: 'true' or 'false')
                - start_date_min: Filter markets by minimum start date (optional, ISO 8601 format)
                - start_date_max: Filter markets by maximum start date (optional, ISO 8601
                - end_date_min: Filter markets by minimum end date (optional, ISO 8601 format)
                - end_date_max: Filter markets by maximum end date (optional, ISO 8601 format)
            data (dict, optional): Data for the API request body. Defaults to None.

        Returns:
            dict: The JSON response from the API or an error message.
        """
        default_param_query = {'limit': 20, 'offset': 0}

        if query_params:
            default_param_query.update(query_params)

        url = self._build_url('gamma', 'markets', default_param_query)
        return await self.get(url, data=data, authenticate=False)

    async def get_markets_keyset(self, query_params=None):
        """_Get markets from Polymarket API_ this endpoint is used for keyset pagination,
        it will return a keyset instead of offset and limit.

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - limit: Number of markets to return (default: 20, max: 100)
                - offset: Number of markets to skip (default: 0)
                - order: Comma-separated list of JSON field names to order by,
                  e.g. volume_num,liquidity_num
                - slug: Filter markets by slug (optional)
                - id: Filter markets by ID (optional)
                - closed: Filter markets by closed status (optional, options: 'true' or 'false')
                - start_date_min: Filter markets by minimum start date (optional, ISO 8601 format)
                - start_date_max: Filter markets by maximum start date (optional, ISO 8601
                - end_date_min: Filter markets by minimum end date (optional, ISO 8601 format)
                - end_date_max: Filter markets by maximum end date (optional, ISO 8601 format)
                - next_cursor: The cursor for the next page of results (optional, string)
                - after_cursor: The cursor for the after page of results (optional, string)

        Returns:
            dict: The JSON response from the API or an error message.
            {
                "markets": [ json list of markets ],
                "next_cursor": "string"
            }
        """
        default_param_query = {'limit': 20}

        if query_params:
            default_param_query.update(query_params)

        url = self._build_url('gamma', 'markets/keyset', default_param_query)
        return await self.get(url, authenticate=False)

    async def get_markets_search(self, query_params):
        """_Get markets from Polymarket API_

        Args:
            query_params (dict): Query parameters for the API request.
                Valid query parameters include:
                - q (string): The search query string to filter markets by name (required)
                - page: The page number for pagination (optional, default: 1)
                - limit_per_type (integer): The maximum number of results to return per market
                type (optional, default: 10)
                - events_tags (string[]): Comma-separated list of event tags to filter markets
                - events_status (string): Filter markets by event status

        Returns:
            dict: The JSON response from the API or an error message.
        """
        default_param_query = {'limit_per_type': 10}

        if query_params:
            default_param_query.update(query_params)

        url = self._build_url('gamma', 'public-search', default_param_query)
        return await self.get(url, authenticate=False)

    async def get_tags(self, query_params=None):
        default_param_query = {'limit': 20, 'offset': 0}

        if query_params:
            default_param_query.update(query_params)

        url = self._build_url('gamma', 'tags', default_param_query)
        return await self.get(url, authenticate=False)

    async def get_market_by_id(self, market_id, query_params=None, data=None):
        """_Get a specific market from Polymarket API by its ID_

        Args:
            market_id (str): The ID of the market to retrieve.
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                    Valid query parameters include:
                    - include_tag: Filter markets by tag (optional, options: 'true' or 'false')
            data (dict, optional): Data for the API request body. Defaults to None.
        """
        url = self._build_url('gamma', f'markets/{market_id}', query_params)
        return await self.get(url, data=data, authenticate=False)

    async def get_market_by_slug(self, market_slug, query_params=None, data=None):
        """_Get a specific market from Polymarket API_ by slug

        Args:
            market_slug (str): The slug of the market to retrieve.
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                    Valid query parameters include:
                    - include_tag: Filter markets by tag (optional, options: 'true' or 'false')
            data (dict, optional): Data for the API request body. Defaults to None.
        """
        url = self._build_url('gamma', f'markets/slug/{market_slug}', query_params)
        return await self.get(url, data=data, authenticate=False)

    async def get_prices(self, query_params=None):
        url = self._build_url('clob', 'prices', query_params)
        return await self.get(url, authenticate=False)

    async def post_prices(self, payload):
        url = self._build_url('clob', 'prices')
        return await self.post(url, data=payload, authenticate=False)

    async def get_book(self, query_params):
        if not query_params or 'token_id' not in query_params:
            raise ValueError('The "token_id" query parameter is required to get a book snapshot.')
        url = self._build_url('clob', 'book', query_params)
        return await self.get(url, authenticate=False)

    async def get_prices_history_by_market(self, query_params):
        """_Get price history for a specific market from Polymarket API_
            This api get price by market and clobTokenIds,
            polymarket each clobTokenIds represent option yes or not.

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                    Valid query parameters include:
                    - market (string): The market to retrieve price history for (require).
                    this value is clobTokenIds.
                    - startTs number<double>: Filter by items after this unix timestamp
                    - endTs number<double>: Filter by items before this unix timestamp.
                    - interval enum<string>: Time interval for data aggregation.
                            Available options: max, all, 1m, 1w, 1d, 6h, 1h
                    - fidelity (integer): Accuracy of the data expressed in minutes. Default is 1.
        Returns:
            dict: The JSON response from the API or an error message.
            {
              "history": [
                {
                  "t": 123,  //timestamp
                  "p": 123   //price
                }
              ]
            }
        """
        if not query_params or 'market' not in query_params:
            raise ValueError('The "market" query parameter is required to get price history.')
        url = self._build_url('clob', 'prices-history', query_params)
        return await self.get(url, authenticate=False)

    async def post_batch_prices_history(self, payload):
        url = self._build_url('clob', 'batch-prices-history')
        return await self.post(url, data=payload, authenticate=False)

    async def get_trades(self, query_params=None):
        url = self._build_url('data', 'trades', query_params)
        return await self.get(url, authenticate=False)

    async def get_holders(self, query_params=None):
        url = self._build_url('data', 'holders', query_params)
        return await self.get(url, authenticate=False)

    async def get_activity(self, query_params=None):
        url = self._build_url('data', 'activity', query_params)
        return await self.get(url, authenticate=False)
