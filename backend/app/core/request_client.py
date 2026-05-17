import base64
import logging

from httpx import AsyncClient, Timeout

logger = logging.getLogger(__name__)


class RequestClient:
    def __init__(self, api_key: str | None = None, auth_type: str | None = None):
        """
        Initialize the RequestClient.

        Args:
            api_key (str): The API key for authentication.
            auth_type (str | None): The type of authentication to use.
                If None, the API key will be sent without a prefix.
                If provided, the API key will be sent with the specified prefix (e.g., "Bearer").
                it is possible send all in api_key and this in None. example "PayAuth <token>"
        """
        self.auth_type = auth_type
        self.api_key = api_key
        self.send_auth = True

    def _get_headers(self):
        if self.send_auth:
            return self._get_headers_auth()
        return self._get_headers_without_auth()

    def _get_headers_auth(self):
        if not self.api_key:
            raise ValueError('API key is required for authentication')
        if self.auth_type:
            authorization_header = f'{self.auth_type} {self.api_key}'
        else:
            authorization_header = self.api_key
        return {
            'Content-Type': 'application/json',
            'Authorization': authorization_header,
            'Accept': 'application/json',
            'Version': '2021-07-28',
        }

    def _get_headers_without_auth(self):
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Version': '2021-07-28',
        }

    def _get_file_content_and_name(self, file_path):
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
                file = base64.b64encode(content).decode('utf-8')
                name = file_path.split('/')[-1]
                return file, name
        except Exception as e:
            logger.error(f'Failed to load file content: {e}', exc_info=True)
            return None, None

    async def _send_request(self, method, url, data=None):
        data = data or {}
        headers = self._get_headers()
        file = data.pop('file') if data and 'file' in data else None

        if file:
            content, name = self._get_file_content_and_name(file)
            data['file'] = {
                'filename': name,
                'content': content,
                'mimetype': 'application/octet-stream',
            }

        timeout = Timeout(10.0, connect=5.0)
        response = None
        try:
            async with AsyncClient(timeout=timeout) as client:
                args = {}
                
                # Los métodos GET y DELETE usan query params en la URL, no JSON en el body
                if method.upper() in ['GET', 'DELETE']:
                    args["params"] = data
                else:
                    args["json"] = data

                response = await client.request(
                    method,
                    url,
                    headers=headers,
                    **args,
                )
            return response
        except Exception as err:
            logger.error(f'Request failed: {err}', exc_info=True)
            raise err

    async def get(self, url, data=None, authenticate=True):
        """Send a GET request.

        Args:
            url (_type_): The URL to send the request to.
            data (_type_, optional): Data to be sent in the request body. Defaults to None.
            authenticate (bool, optional): Whether to include authentication headers.
            Defaults to True.

        Returns:
            _type_: The response from the request.
        """
        self.send_auth = authenticate
        return await self._send_request('GET', url, data)

    async def post(self, url, data=None, authenticate=True):
        """Send a POST request.

        Args:
            url (_type_): The URL to send the request to.
            data (_type_, optional): Data to be sent in the request body. Defaults to None.
            authenticate (bool, optional): Whether to include authentication headers.
            Defaults to True.

        Returns:
            _type_: The response from the request.
        """
        self.send_auth = authenticate
        return await self._send_request('POST', url, data)

    async def put(self, url, data=None):
        """Send a PUT request. sends authentication headers by default.

        Args:
            url (_type_): The URL to send the request to.
            data (_type_, optional): Data to be sent in the request body. Defaults to None.

        Returns:
            _type_: The response from the request.
        """
        return await self._send_request('PUT', url, data)

    async def patch(self, url, data=None):
        """Send a PATCH request. send authentication headers by default.

        Args:
            url (_type_): The URL to send the request to.
            data (_type_, optional): Data to be sent in the request body. Defaults to None.

        Returns:
            _type_: The response from the request.
        """
        return await self._send_request('PATCH', url, data)

    async def delete(self, url, data=None):
        """Send a DELETE request. send authentication headers by default.

        Args:
            url (_type_): The URL to send the request to.
            data (_type_, optional): Data to be sent in the request body. Defaults to None.

        Returns:
            _type_: The response from the request.
        """
        return await self._send_request('DELETE', url, data)
