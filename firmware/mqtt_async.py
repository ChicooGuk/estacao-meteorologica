"""Cliente MQTT 3.1.1 de publicacao QoS 1, sem retencao, sobre TCP na LAN.
Sem dependencia externa na placa. Operacoes de rede com timeout; uma mensagem
em voo. Reenvio apos reconexao usa boot_id/sequencia para deduplicacao no backend.
"""
import uasyncio as asyncio


def string(value):
    value = value.encode() if isinstance(value, str) else value
    return bytes((len(value) >> 8, len(value) & 255)) + value


def packet(header, body):
    n = len(body)
    size = bytearray()
    while True:
        b = n % 128
        n //= 128
        size.append(b | (128 if n else 0))
        if not n:
            break
    return bytes((header,)) + size + body


class MQTTClient:
    def __init__(self, host, port, client_id, user="", password=""):
        self.host, self.port, self.client_id = host, port, client_id
        self.user, self.password = user, password
        self.reader = self.writer = None
        self.mid = 0

    async def send(self, data):
        self.writer.write(data)
        await asyncio.wait_for(self.writer.drain(), 3)

    async def connect(self):
        self.reader, self.writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port), 3)
        flags = 2 | (192 if self.user else 0)
        body = string("MQTT") + bytes((4, flags, 0, 30)) + string(self.client_id)
        if self.user:
            body += string(self.user) + string(self.password)
        await self.send(packet(0x10, body))
        ack = await asyncio.wait_for(self.reader.readexactly(4), 3)
        if ack != b"\x20\x02\x00\x00":
            raise OSError("MQTT CONNACK recusado")

    async def publish(self, topic, payload):
        self.mid = self.mid % 65535 + 1
        mid = bytes((self.mid >> 8, self.mid & 255))
        await self.send(packet(0x32, string(topic) + mid + payload.encode()))
        ack = await asyncio.wait_for(self.reader.readexactly(4), 3)
        if ack != b"\x40\x02" + mid:
            raise OSError("MQTT PUBACK invalido")

    async def close(self):
        if self.writer:
            self.writer.close()
            try:
                await asyncio.wait_for(self.writer.wait_closed(), 2)
            except Exception:
                pass
        self.reader = self.writer = None
