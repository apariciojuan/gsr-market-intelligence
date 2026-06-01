from app.config import settings
from app.core import RequestClient as BaseRequestClient


class PolygonClient(BaseRequestClient):
    def __init__(self, api_key: str | None = None, auth_type: str | None = 'Bearer'):
        super().__init__(api_key, auth_type)
        self.url = settings.ETHERSCAN_API_URL
        self.chain_id =  settings.POLYGON_CHAIN_ID
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
        }

    def generate_query_params(self, action: str, query_params: dict | None = None) -> str:
        base_query = self.actions[action]
        query_string = '&'.join(f'{key}={value}' for key, value in query_params.items())
        return f'{base_query}&chainid={self.chain_id}&apikey={self.api_key}&{query_string}'

    async def get_transactions_by_address(self, query_params=None):
        """_Get transactions by address from Polygon API

        Args:
            query_params (dict, optional): Query parameters for the API request. Defaults to None.
                Valid query parameters include:
                - address: The address to get transactions for (required)
                - startblock: The block number to start from (optional, default: 0)
                - endblock: The block number to end at (optional, default: 999999999)
                - page: The page number to return (optional, default: 1)
                - offset: The number of transactions to return per page (optional, default: 100)
                - sort: The order to sort transactions
                  (optional, options: 'asc' or 'desc', default: 'asc')

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
        params = self.generate_query_params('get_transactions_by_address', query_params)
        # Query by test for this use offset and page 1
        url = f'{self.url}{params}&offset=1&page=1'
        return await self.get(url, authenticate=False)

    async def get_event_logs_by_address_or_topic(self, query_params=None):
        params = query_params or {}
        url = self.generate_query_params('get_event_logs_by_address_or_topic', params)
        url = f'{self.url}{url}'
        return await self.get(url, authenticate=False)
