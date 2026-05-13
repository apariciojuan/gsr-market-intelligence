from app.config.log import get_logger
from fastapi import APIRouter

router = APIRouter()
logger = get_logger('markets')


@router.get(
    '/',
    response_model=str,
    status_code=200,
    operation_id='get_markets',
    tags=['markets'],
    summary='Get available markets',
    description='Returns a list of available markets.',
)
async def get_markets() -> str:
    return 'market1,market2,market3'


#@router.post(
#    '/verify-receptor-zexel',
#    response_model=VerifyInvoiceReceptor,
#    status_code=200,
#    operation_id='verify_receptor_zexel',
#    tags=['invoices-internal'],
#    summary='Verify if invoice receptor is Zexel',
#    description='Upload an invoice file and verify if the receptor is Zexel using AI',
#)
#async def invoices_verify_receptor_zexel(file: UploadFile) -> VerifyInvoiceReceptor:
#    mcp = MCP(flow=check_invoice_receptor_zexel, agent='gemini')
#    data = {'file': file}
#    response = await mcp.run(data)
#    return response
#
#
#from typing import Annotated
#
#from fastapi import APIRouter, Body, Depends
#
#
#
#@router.post(
#    '/request-zexel',
#    response_model=str,
#    status_code=200,
#    operation_id='request_db',
#    tags=['request-db-internal'],
#    summary='Query Zexel Pay database using natural language',
#    description=(
#        'Receives a natural language question about the Zexel Pay database and returns '
#        'the result as a formatted string. The query must be plain text, NOT SQL. '
#        'Examples: "How many invoices are there this month?", "List the last 5 payments", '
#        '"What is the total billed in March?". '
#        'The system translates the question to SQL internally using an AI agent.'
#    ),
#)
#async def request_db(
#    data: Annotated[
#        str,
#        Body(
#            embed=True,
#            title='Natural language query',
#            description="""A question in natural language about the Zexel Pay database.
#                        Do NOT send SQL.""",
#            examples=[
#                'How many invoices were generated this month?',
#                'List the last 10 payments',
#            ],
#        ),
#    ],
#    user_data: Annotated[AuthContext, Depends(require_auth('ApiToken', 'PayAuth'))],
#) -> str:
#    mcp = MCP(flow=get_db_response, agent='gemini')
#    response = await mcp.run(data)
#    return response
#