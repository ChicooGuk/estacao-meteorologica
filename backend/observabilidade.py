"""Tempos HTTP do aplicativo, sem registrar payloads ou credenciais."""
import logging
import re
import time
import uuid
from urllib.parse import parse_qs

log = logging.getLogger('estacao')

class ObservabilidadeHTTP:
    def __init__(self, app, origins=()):
        self.app = app
        self.origins = set(origins)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope.get('path', '').startswith('/api/'):
            return await self.app(scope, receive, send)
        query = parse_qs(scope.get('query_string', b'').decode('ascii', 'ignore'))
        candidate = query.get('diag_id', [''])[0]
        request_id = candidate if re.fullmatch(r'diag-[a-zA-Z0-9_-]{1,64}', candidate) else uuid.uuid4().hex
        started = time.perf_counter()
        status = 500
        complete = False
        size = 0
        origin = dict(scope.get('headers', [])).get(b'origin', b'').decode('ascii', 'ignore')
        log.info('API fase=inicio request_id=%s metodo=%s rota=%s', request_id, scope['method'], scope['path'])

        async def observed_send(message):
            nonlocal status, complete, size
            if message['type'] == 'http.response.start':
                status = message['status']
                elapsed = (time.perf_counter() - started) * 1000
                headers = list(message.get('headers', []))
                headers.extend([(b'x-request-id', request_id.encode('ascii')), (b'server-timing', ('api;dur=%.2f' % elapsed).encode('ascii'))])
                if origin in self.origins:
                    headers.append((b'timing-allow-origin', origin.encode('ascii')))
                if scope['method'] == 'GET':
                    headers = [(k, v) for k, v in headers if k.lower() != b'cache-control']
                    headers.append((b'cache-control', b'no-store'))
                message = {**message, 'headers': headers}
                log.info('API fase=cabecalhos request_id=%s status=%s duracao_ms=%.2f', request_id, status, elapsed)
            await send(message)
            if message['type'] == 'http.response.body':
                size += len(message.get('body', b''))
                if not message.get('more_body', False):
                    complete = True

        try:
            await self.app(scope, receive, observed_send)
        finally:
            log.info('API metodo=%s rota=%s status=%s duracao_ms=%.2f request_id=%s corpo_bytes=%s completo=%s',
                     scope['method'], scope['path'], status, (time.perf_counter()-started)*1000, request_id, size, complete)
