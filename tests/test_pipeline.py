import asyncio
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

api = load("backend", ROOT / "backend/python.py")
BASE = dict(id_estacao=1, boot_id="abc", sequencia=1, uptime_ms=2500,
            temperatura=24, umidade=50, pressao=930, qualidade_ar=None,
            luminosidade=60, estado_sensores={"qualidade_ar": "indisponivel"})

class ValidationTests(unittest.TestCase):
    def test_physical_and_nonfinite_values_rejected(self):
        for value in (-100, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                api.TelemetriaSchema(**(BASE | {"temperatura": value}))

    def test_missing_readings_remain_null(self):
        d = api.TelemetriaSchema(**BASE)
        values, flags = api.filtrar(d, [])
        self.assertIsNone(values["qualidade_ar"])
        self.assertEqual(flags["qualidade_ar"], "indisponivel")

    def test_isolated_outlier_removed_and_sustained_change_recovers(self):
        d = api.TelemetriaSchema(**(BASE | {"temperatura": 50}))
        values, flags = api.filtrar(d, [BASE]*5)
        self.assertIsNone(values["temperatura"])
        self.assertEqual(flags["temperatura"], "outlier_temporal")
        values, _ = api.filtrar(d, [BASE]*2 + [BASE | {"temperatura": 50}]*3)
        self.assertEqual(values["temperatura"], 50)

    def test_persistence_and_duplicate(self):
        pool, conn, cur = MagicMock(), MagicMock(), MagicMock()
        pool.get_connection.return_value = conn
        conn.cursor.return_value = cur
        cur.fetchone.side_effect = [{"id_estacao": 1}, None, None]
        cur.fetchall.return_value = []
        with patch.object(api, "pool", pool):
            self.assertEqual(api.persistir(api.TelemetriaSchema(**BASE))["status"], "sucesso")
        conn.commit.assert_called_once()
        conn.close.assert_called_once()
        sql, params = cur.execute.call_args.args
        self.assertIn("INSERT INTO leitura", sql)
        self.assertIsNone(params[4])
        cur.fetchone.side_effect = [{"id_estacao": 1}, {"id_leitura": 3}]
        conn.commit.reset_mock()
        with patch.object(api, "pool", pool):
            self.assertEqual(api.persistir(api.TelemetriaSchema(**BASE))["status"], "duplicada")
        conn.commit.assert_not_called()

    def test_mqtt_topic_validation_and_ack_after_persistence(self):
        client = MagicMock()
        msg = types.SimpleNamespace(retain=False, topic="estacoes/2/telemetria",
                                    payload=json.dumps(BASE).encode(), mid=1, qos=1)
        with patch.object(api, "persistir") as save:
            api.on_message(client, None, msg)
            save.assert_not_called()
        msg.topic = "estacoes/1/telemetria"
        with patch.object(api, "persistir", side_effect=RuntimeError("db offline")):
            client.ack.reset_mock()
            api.on_message(client, None, msg)
            client.ack.assert_not_called()
            self.assertTrue(api.reiniciar_mqtt.is_set())
            api.reiniciar_mqtt.clear()

    def test_api_history_station_time_filter_and_errors(self):
        from fastapi.testclient import TestClient
        pool, conn, cur = MagicMock(), MagicMock(), MagicMock()
        pool.get_connection.return_value = conn
        conn.cursor.return_value = cur
        cur.fetchone.side_effect = [dict(id_estacao=1, latitude=0., longitude=0., descricao="Teste"), {}]
        cur.fetchall.return_value = [dict(id_leitura=1, temperatura=None, umidade=50,
            pressao=930, qualidade_ar=None, luminosidade=60,
            data_hora=datetime.now(timezone.utc).replace(tzinfo=None), qualidade="{}", payload=json.dumps(BASE))]
        client = TestClient(api.app) # sem lifespan: injeta banco de teste
        with patch.object(api, "pool", pool):
            r = client.get("/api/leituras/ultimas-24h?id_estacao=1")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["esp32_ativo"])
        self.assertIsNone(r.json()["historico"][0]["temperatura"])
        self.assertTrue(any("INTERVAL 1 DAY" in c.args[0] for c in cur.execute.call_args_list))
        self.assertEqual(client.post("/api/leituras", json=BASE | {"umidade": 101}).status_code, 422)
        with patch.object(api, "pool", None):
            r = client.get("/api/leituras/ultimas-24h")
            self.assertEqual(r.status_code, 503)
            self.assertNotIn("Banco nao", r.text)

class MQTTWireTests(unittest.IsolatedAsyncioTestCase):
    async def test_connect_publish_ack_and_broker_disconnect(self):
        with patch.dict(sys.modules, {"uasyncio": asyncio}):
            wire = load("mqtt_async", ROOT / "firmware/mqtt_async.py")
        packets = []
        async def receive(reader):
            header = (await reader.readexactly(1))[0]
            size, multiplier = 0, 1
            while True:
                b = (await reader.readexactly(1))[0]
                size += (b & 127)*multiplier
                if b < 128: break
                multiplier *= 128
            return header, await reader.readexactly(size)
        async def broker(reader, writer):
            try:
                packets.append(await receive(reader))
                writer.write(b"\x20\x02\x00\x00"); await writer.drain()
                header, body = await receive(reader)
                packets.append((header, body))
                n = int.from_bytes(body[:2], "big")
                mid = body[2+n:4+n]
                writer.write(b"\x40\x02" + mid); await writer.drain()
            finally:
                writer.close(); await writer.wait_closed()
        server = await asyncio.start_server(broker, "127.0.0.1", 0)
        client = wire.MQTTClient("127.0.0.1", server.sockets[0].getsockname()[1], "test")
        try:
            await client.connect()
            await client.publish("estacoes/1/telemetria", json.dumps(BASE))
            self.assertEqual(packets[0][0], 0x10)
            self.assertEqual(packets[1][0], 0x32)
            with self.assertRaises((OSError, asyncio.IncompleteReadError)):
                await client.publish("estacoes/1/telemetria", "{}")
        finally:
            await client.close()
            server.close(); await server.wait_closed()

class FirmwareAsyncTests(unittest.IsolatedAsyncioTestCase):
    def firmware(self):
        machine = types.SimpleNamespace(Pin=MagicMock(), ADC=MagicMock(side_effect=OSError), I2C=MagicMock())
        config = types.SimpleNamespace(MQ135_WARMUP_MS=1000, MQ135_CALIBRATION_ENABLED=False,
            STATION_ID=1, SAMPLE_INTERVAL_MS=2500, WIFI_SSID="test", WIFI_PASS="test")
        clock = types.SimpleNamespace(ticks_ms=lambda: 100, ticks_diff=lambda a,b:a-b)
        wlan = MagicMock(); wlan.isconnected.side_effect = [False, True]
        with patch.dict(sys.modules, {"machine":machine, "bmp280":types.SimpleNamespace(BMP280=MagicMock(side_effect=OSError)),
            "dht":types.SimpleNamespace(DHT22=MagicMock(side_effect=OSError)), "uasyncio":asyncio,
            "ubinascii":__import__("binascii"), "time":clock, "config":config,
            "network":types.SimpleNamespace(STA_IF=0, WLAN=lambda *a:wlan),
            "mqtt_async":types.SimpleNamespace(MQTTClient=object)}):
            return load("firmware_async_test", ROOT / "firmware/main.py"), wlan

    async def test_acquisition_runs_without_browser(self):
        fw, _ = self.firmware()
        samples = []
        async def sleep_ms(ms):
            samples.append(fw.ultima_amostra.copy())
            if len(samples) >= 3: raise asyncio.CancelledError()
            await asyncio.sleep(0)
        fw.asyncio = types.SimpleNamespace(sleep_ms=sleep_ms)
        with self.assertRaises(asyncio.CancelledError):
            await fw.adquirir()
        self.assertEqual([s["sequencia"] for s in samples], [1,2,3])
        self.assertIsNone(samples[-1]["pressao"])

    async def test_wifi_retries_only_when_disconnected(self):
        fw, wlan = self.firmware()
        count = 0
        async def sleep(seconds):
            nonlocal count
            count += 1
            if count == 2: raise asyncio.CancelledError()
        fw.asyncio = types.SimpleNamespace(sleep=sleep)
        with self.assertRaises(asyncio.CancelledError): await fw.monitor_wifi()
        wlan.connect.assert_called_once_with("test", "test")

    async def test_http_returns_cached_sample_and_closes(self):
        fw, _ = self.firmware()
        fw.ultima_amostra = BASE
        fw.obter_leituras = MagicMock(side_effect=AssertionError("HTTP nao deve ler hardware"))
        from unittest.mock import AsyncMock
        reader = types.SimpleNamespace(readline=AsyncMock(return_value=b"GET /api/dados HTTP/1.1\r\n"))
        writer = types.SimpleNamespace(write=MagicMock(), drain=AsyncMock(), close=MagicMock(), wait_closed=AsyncMock())
        await fw.diagnostico(reader, writer)
        self.assertIn(b"200 OK", writer.write.call_args.args[0])
        self.assertIn(b'"temperatura": 24', writer.write.call_args.args[0])
        fw.obter_leituras.assert_not_called()
        writer.close.assert_called_once()

class FirmwareTests(unittest.TestCase):
    def test_bmp_failure_falls_back_to_dht_and_missing_adc_is_null(self):
        machine = types.SimpleNamespace(Pin=MagicMock(), ADC=MagicMock(side_effect=OSError), I2C=MagicMock())
        bmp = MagicMock(); bmp.ler_valores.side_effect = OSError("desconectado")
        dht = MagicMock(); dht.temperature.return_value=23; dht.humidity.return_value=60
        fake_time = types.SimpleNamespace(ticks_ms=lambda: 100, ticks_diff=lambda a,b:a-b)
        config = types.SimpleNamespace(MQ135_WARMUP_MS=1000, MQ135_CALIBRATION_ENABLED=False, STATION_ID=1)
        with patch.dict(sys.modules, {"machine":machine, "bmp280":types.SimpleNamespace(BMP280=lambda *a,**k:bmp),
            "dht":types.SimpleNamespace(DHT22=lambda *a:dht), "uasyncio":asyncio,
            "ubinascii":__import__("binascii"), "time":fake_time, "config":config,
            "network":types.SimpleNamespace(), "mqtt_async":types.SimpleNamespace(MQTTClient=object)}):
            fw=load("firmware_test", ROOT / "firmware/main.py")
            data=fw.obter_leituras()
        self.assertEqual(data["temperatura"],23)
        self.assertEqual(data["origem_temperatura"],"DHT22")
        for k in ("pressao","qualidade_ar","luminosidade"):
            self.assertIsNone(data[k])
            self.assertEqual(data["estado_sensores"][k],"indisponivel")

if __name__ == "__main__": unittest.main()
