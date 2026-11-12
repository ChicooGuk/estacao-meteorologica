import asyncio
import importlib.util
import logging
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from observabilidade import ObservabilidadeHTTP

class ObservabilidadeTests(unittest.IsolatedAsyncioTestCase):
    async def test_records_final_body_and_headers(self):
        async def app(scope,receive,send):
            await send({'type':'http.response.start','status':200,'headers':[]})
            await send({'type':'http.response.body','body':b'first','more_body':True})
            await asyncio.sleep(.01)
            await send({'type':'http.response.body','body':b'last'})
        sent=[]
        async def send(message):sent.append(message)
        async def receive():return {'type':'http.request'}
        scope={'type':'http','path':'/api/saude','method':'GET','query_string':b'diag_id=diag-test-123','headers':[(b'origin',b'https://allowed.test')]}
        with self.assertLogs('estacao',level='INFO') as logs:
            await ObservabilidadeHTTP(app,['https://allowed.test'])(scope,receive,send)
        headers=dict(sent[0]['headers'])
        self.assertEqual(headers[b'x-request-id'],b'diag-test-123')
        self.assertEqual(headers[b'timing-allow-origin'],b'https://allowed.test')
        self.assertEqual(headers[b'cache-control'],b'no-store')
        self.assertIn('corpo_bytes=9 completo=True',logs.output[-1])
        self.assertIn('fase=cabecalhos',logs.output[1])

    async def test_failed_body_is_not_complete_and_unknown_origin_not_allowed(self):
        async def app(scope,receive,send):
            await send({'type':'http.response.start','status':200,'headers':[]})
            raise RuntimeError('transfer interrupted')
        sent=[]
        async def send(m):sent.append(m)
        async def receive():return {}
        scope={'type':'http','path':'/api/saude','method':'GET','query_string':b'diag_id=bad%0Avalue','headers':[(b'origin',b'https://unknown.test')]}
        with self.assertLogs('estacao',level='INFO') as logs:
            with self.assertRaises(RuntimeError):await ObservabilidadeHTTP(app,[])(scope,receive,send)
        headers=dict(sent[0]['headers'])
        self.assertNotIn(b'timing-allow-origin',headers)
        self.assertNotIn(b'bad',headers[b'x-request-id'])
        self.assertIn('completo=False',logs.output[-1])
        self.assertNotIn('bad',str(logs.output))

class SaudeTests(unittest.TestCase):
    def test_health_does_not_consult_database(self):
        import importlib
        api=importlib.import_module('python')
        from fastapi.testclient import TestClient
        with patch.object(api,'conexao',side_effect=AssertionError('Database must not be used')):
            result=TestClient(api.app).get('/api/saude?diag_id=diag-health')
        self.assertEqual(result.status_code,200)
        self.assertEqual(set(result.json()),{'status','servidor_utc'})
        self.assertEqual(result.headers['x-request-id'],'diag-health')

if __name__=='__main__':unittest.main()
