"""Exercise the real stdio transport without calling a model or external API."""
import asyncio
import json
from pathlib import Path
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    path = Path(__file__).with_name('skills_mcp.py')
    params = StdioServerParameters(command=sys.executable, args=['-X', 'utf8', str(path)])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            assert len(tools) == 6
            assert all(t.annotations.readOnlyHint for t in tools)
            async def call(name, arguments):
                result = await session.call_tool(name, arguments)
                assert not result.isError, result
                return json.loads(result.content[0].text)
            results = await call('skills_search_documents', {'query':'반복 일정','kind':'skill','limit':3})
            assert results['results']
            doc = await call('skills_read_document', {'doc_id':results['results'][0]['doc_id'],'count':40})
            assert doc['body'] and doc['path']
            catalogue = await call('skills_list_catalogue', {'limit':3})
            assert len(catalogue['skills']) == 3 and catalogue['next_offset'] == 3
            check = await call('skills_check_compatibility', {'names':['frontend-design','free-design-references','ui-color-palettes']})
            assert check['status'] == '문서상 조합 가능', check
            await call('skills_get_basket', {})
            result = await call('skills_recommend_combination', {'goal':'반복 일정 설정 화면 만들기'})
            assert result['plans'][0]['id'] == 'web-ui' and not result['api_required']
            print('PASS: MCP initialize, 6 read-only tools, search, scoped read, pagination, evidence-based check, basket read, local recommendation')


if __name__ == '__main__':
    asyncio.run(main())
