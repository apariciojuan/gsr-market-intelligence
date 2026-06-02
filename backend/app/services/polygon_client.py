import asyncio

from app.config import settings
from app.core import RequestClient as BaseRequestClient


class PolygonClient(BaseRequestClient):
    def __init__(self, api_key: str | None = None, auth_type: str | None = 'Bearer'):
        super().__init__(api_key, auth_type)
        self.url = settings.ETHERSCAN_API_URL
        self.chain_id = settings.POLYGON_CHAIN_ID
        self.api_key = settings.ETHERSCAN_API_KEY
        # This is a mapping of action names and module to their corresponding
        # query parameters for etherscan. For example, the 'get_transactions_by_address' action
        # corresponds to the query parameters needed to fetch transactions for a specific address.
        # Etherscan API has 1 endpoints for different actions, and each endpoint requires
        # specific query parameters action and module.
        self.actions = {
            'get_transactions_by_address': '?module=account&action=txlist',
            'get_erc20_transfers_by_address': '?module=account&action=tokentx',
            'get_erc721_transfers_by_address': '?module=account&action=tokennfttx',
            'get_erc1155_transfers_by_address': '?module=account&action=token1155tx',
            'get_event_logs_by_address_or_topic': '?module=logs&action=getLogs',
            'get_event_logs': '?module=logs&action=getLogs',
            'get_contract_source': '?module=contract&action=getsourcecode',
            'get_latest_block': '?module=proxy&action=eth_blockNumber',
        }

    def generate_query_params(self, action: str, query_params: dict | None = None) -> str:
        base_query = self.actions[action]
        params = query_params or {}
        query_string = '&'.join(f'{key}={value}' for key, value in params.items())
        return f'{base_query}&chainid={self.chain_id}&apikey={self.api_key}&{query_string}'

    async def _get_json(self, url: str, retries: int = 4) -> dict | list:
        """GET + parse JSON, retrying transient Etherscan rate-limit responses.

        Etherscan free-tier caps requests per second; under parallel load it
        answers a non-data ``message``/``result`` ('Max calls per sec rate limit
        reached'). This retries with backoff so callers get the real data
        instead of a degraded empty payload.
        """
        payload: dict | list = {}
        for attempt in range(retries):
            response = await self.get(url, authenticate=False)
            payload = response.json()
            if isinstance(payload, dict):
                result = payload.get('result')
                blob = f'{payload.get("message", "")} {result if isinstance(result, str) else ""}'
                if 'rate limit' in blob.lower() or 'max calls per sec' in blob.lower():
                    await asyncio.sleep(0.8 * (attempt + 1))
                    continue
            return payload
        return payload

    async def get_transactions_by_address(self, query_params=None):
        """_Get transactions by address from Polygon API with real pagination.

        Builds the request URL via ``generate_query_params`` without forcing
        ``offset``/``page``, so the caller controls pagination. ``address`` is
        required; sensible defaults are applied for the remaining parameters.

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - address: The address to get transactions for (required)
                - startblock: The block number to start from (optional, default: 0)
                - endblock: The block number to end at (optional, default: 999999999)
                - page: The page number to return (optional, default: 1)
                - offset: The number of transactions to return per page (optional, default: 50)
                - sort: The order to sort transactions
                  (optional, options: 'asc' or 'desc', default: 'desc')

        Returns:
            dict: The JSON response from the API or an error message.
            {
              "status": "1",
              "message": "OK",
              "result": [
                { ... transaction data ... }
              ]
            }
        """
        default_params = {
            'page': 1,
            'offset': 50,
            'sort': 'desc',
            'startblock': 0,
            'endblock': 999999999,
        }
        if query_params:
            default_params.update({k: v for k, v in query_params.items() if v is not None})

        if not default_params.get('address'):
            raise ValueError("'address' is required for get_transactions_by_address")

        params = self.generate_query_params('get_transactions_by_address', default_params)
        url = f'{self.url}{params}'
        return await self._get_json(url)

    async def get_erc20_transfers_by_address(self, query_params=None):
        """_Get ERC20 token transfer events by address from Polygon API

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - address: The address to get transfers for (required)
                - startblock: The block number to start from (optional, default: 0)
                - endblock: The block number to end at (optional, default: 999999999)
                - page: The page number to return (optional, default: 1)
                - offset: The number of transfers to return per page (optional, default: 100)
                - sort: The order to sort transfers (optional, options: 'asc' or 'desc', default: 'asc')

        Returns:
            dict: The JSON response from the API or an error message.
            {
              "status": "1",
              "message": "OK",
              "result": [
                { ... transfer data ... }
              ]
            }
        """
        default_params = {
            'page': 1,
            'offset': 10,
            'sort': 'asc',
            'startblock': 0,
            'endblock': 999999999,
        }
        if query_params:
            default_params.update(query_params)

        if default_params['endblock'] == 999999999:
            default_params['offset'] = 10

        params = self.generate_query_params('get_erc20_transfers_by_address', default_params)
        url = f'{self.url}{params}'
        return await self._get_json(url)

    async def get_erc721_transfers_by_address(self, query_params=None):
        """_Get ERC721 (NFT) token transfer events by address from Polygon API

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - address: The address to get transfers for (required)
                - startblock: The block number to start from (optional, default: 0)
                - endblock: The block number to end at (optional, default: 999999999)
                - page: The page number to return (optional, default: 1)
                - offset: The number of transfers to return per page (optional, default: 100)
                - sort: The order to sort transfers (optional, options: 'asc' or 'desc', default: 'asc')

        Returns:
            dict: The JSON response from the API or an error message.
            {
              "status": "1",
              "message": "OK",
              "result": [
                { ... transfer data ... }
              ]
            }
        """
        default_params = {
            'page': 1,
            'offset': 10,
            'sort': 'asc',
            'startblock': 0,
            'endblock': 999999999,
        }
        if query_params:
            default_params.update(query_params)

        if default_params['endblock'] == 999999999:
            default_params['offset'] = 10

        params = self.generate_query_params('get_erc721_transfers_by_address', default_params)
        url = f'{self.url}{params}'
        return await self.get(url, authenticate=False)

    async def get_erc1155_transfers_by_address(self, query_params=None):
        """_Get ERC1155 token transfer events by address from Polygon API

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - address: The address to get transfers for (required)
                - startblock: The block number to start from (optional, default: 0)
                - endblock: The block number to end at (optional, default: 999999999)
                - page: The page number to return (optional, default: 1)
                - offset: The number of transfers to return per page (optional, default: 100)
                - sort: The order to sort transfers (optional, options: 'asc' or 'desc', default: 'asc')

        Returns:
            dict: The JSON response from the API or an error message.
            {
              "status": "1",
              "message": "OK",
              "result": [
                { ... transfer data ... }
              ]
            }
        """
        default_params = {
            'page': 1,
            'offset': 10,
            'sort': 'asc',
            'startblock': 0,
            'endblock': 999999999,
        }
        if query_params:
            default_params.update(query_params)

        if default_params['endblock'] == 999999999:
            default_params['offset'] = 10

        params = self.generate_query_params('get_erc1155_transfers_by_address', default_params)
        url = f'{self.url}{params}'
        return await self.get(url, authenticate=False)

    async def get_event_logs_by_address_or_topic(self, query_params=None):
        """_Get event logs by address or topic from Polygon API

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - address: The address to get logs for (optional)
                - topic0: Cryptographic hash of the event to track (optional)
                - startblock: The block number to start from (optional, default: 0)
                - endblock: The block number to end at (optional, default: 999999999)
                - page: The page number to return (optional, default: 1)
                - offset: The number of logs to return per page (optional, default: 100)
                - sort: The order to sort logs (optional, options: 'asc' or 'desc', default: 'asc')

        Returns:
            dict: The JSON response from the API or an error message.
            {
              "status": "1",
              "message": "OK",
              "result": [
                { ... event log data ... }
              ]
            }
        """
        default_params = {
            'page': 1,
            'offset': 10,
            'sort': 'asc',
            'startblock': 0,
            'endblock': 999999999,
        }
        if query_params:
            default_params.update(query_params)

        if default_params['endblock'] == 999999999:
            default_params['offset'] = 10

        params = self.generate_query_params('get_event_logs_by_address_or_topic', default_params)
        url = f'{self.url}{params}'
        return await self.get(url, authenticate=False)

    async def get_event_logs(self, query_params=None):
        """Get event logs (getLogs) by address from Polygon API.

        Maps to ``module=logs&action=getLogs``.

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - address: The contract address to get logs for (required)
                - topic0: Cryptographic hash of the event to track (optional)
                - fromBlock: The block number to start from (optional, default: 0)
                - toBlock: The block number to end at (optional, default: 'latest')
                - page: The page number to return (optional, default: 1)
                - offset: The number of logs to return per page (optional, default: 50)

        Returns:
            dict: The JSON response from the API or an error message.
            {
              "status": "1",
              "message": "OK",
              "result": [
                { ... event log data ... }
              ]
            }
        """
        default_params = {
            'page': 1,
            'offset': 50,
            'fromBlock': 0,
            'toBlock': 'latest',
        }
        if query_params:
            default_params.update({k: v for k, v in query_params.items() if v is not None})

        if not default_params.get('address'):
            raise ValueError("'address' is required for get_event_logs")

        params = self.generate_query_params('get_event_logs', default_params)
        url = f'{self.url}{params}'
        return await self._get_json(url)

    async def get_contract_source(self, address):
        """Get the verified contract source code and metadata from Polygon API.

        Maps to ``module=contract&action=getsourcecode&address=...``.

        Args:
            address (str): The contract address to fetch the source code for (required).

        Returns:
            dict: The parsed JSON response from the API.
        """
        if not address:
            raise ValueError("'address' is required for get_contract_source")

        params = self.generate_query_params('get_contract_source', {'address': address})
        url = f'{self.url}{params}'
        return await self._get_json(url)

    async def get_latest_block(self):
        """Get the current (latest) block number from Polygon API.

        Maps to ``module=proxy&action=eth_blockNumber``.

        Returns:
            dict: The parsed JSON response from the API.
        """
        params = self.generate_query_params('get_latest_block')
        url = f'{self.url}{params}'
        return await self._get_json(url)
