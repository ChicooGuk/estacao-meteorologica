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

sys.path.insert(0, str(ROOT / "backend"))
api = load("backend", ROOT / "backend/python.py")
BASE = dict(id_estacao=1, boot_id="abc", sequencia=1, uptime_ms=2500,
            temperatura=24, umidade=50, pressao=930, qualidade_ar=None,
            luminosidade=60, estado_sensores={"qualidade_ar": "indisponivel"})

class ValidationTests(unittest.TestCase):
    def test_warmup_remaining_optional_and_bounded(self):
        self.assertIsNone(api.TelemetriaSchema(**BASE).mq135_aquecimento_restante_ms)
        self.assertEqual(api.TelemetriaSchema(**(BASE | {'mq135_aquecimento_restante_ms':65000})).mq135_aquecimento_restante_ms,65000)
        with self.assertRaises(ValueError):api.TelemetriaSchema(**(BASE | {'mq135_aquecimento_restante_ms':-1}))

    def test_simulated_ppm_cannot_contaminate_concentration_field(self):
        data=api.TelemetriaSchema(**(BASE | {'mq135_modo_teste':True,'mq135_ppm_simulado':164.32}))
        self.assertIsNone(data.qualidade_ar)
        self.assertEqual(data.mq135_ppm_simulado,164.32)
        for extra in [{'mq135_modo_teste':True,'qualidade_ar':164.32}, {'mq135_ppm_simulado':164.32}]:
            with self.assertRaises(ValueError):api.TelemetriaSchema(**(BASE | extra))

    def test_mq135_voltage_optional_and_bounded(self):
        self.assertIsNone(api.TelemetriaSchema(**BASE).mq135_tensao_adc_v)
        self.assertEqual(api.TelemetriaSchema(**(BASE | {"mq135_tensao_adc_v":0.25})).mq135_tensao_adc_v,0.25)
        for value in (-0.1, 5, float("nan")):
            with self.assertRaises(ValueError):
                api.TelemetriaSchema(**(BASE | {"mq135_tensao_adc_v":value}))

    def test_rejected_outliers_do_not_contaminate_reference(self):
        anteriores = [dict(payload=BASE | {'temperatura':80}, qualidade={'temperatura':'outlier_temporal'})]*3
        anteriores += [dict(payload=BASE, qualidade={})]*2
        valores, flags = api.filtrar(api.TelemetriaSchema(**BASE), api.referencias_validas(anteriores))
        self.assertEqual(valores['temperatura'],24)
        self.assertNotIn('temperatura',flags)

    def test_moving_average_uses_original_valid_samples(self):
        anteriores = [dict(payload=BASE | {'temperatura':80}, qualidade={'temperatura':'outlier_temporal'}),
                      dict(payload=BASE | {'temperatura':20}, qualidade={})]
        valores = {k:BASE[k] for k in api.FIELDS}
        self.assertEqual(api.media_movel(valores,anteriores)['temperatura'],22)
        valores['temperatura'] = None
        self.assertIsNone(api.media_movel(valores,anteriores)['temperatura'])

    def test_http_and_location_require_private_tokens(self):
        from fastapi.testclient import TestClient
        client = TestClient(api.app)
        with patch.dict('os.environ', {'HTTP_INGEST_TOKEN':'test-only','LOCATION_ADMIN_TOKEN':'admin-only'}):
            self.assertEqual(client.post('/api/leituras',json=BASE).status_code,401)
            self.assertEqual(client.put('/api/estacoes/1/localizacao',json={'latitude':0,'longitude':0}).status_code,401)
            with patch.object(api,'pool',None):
                r=client.put('/api/estacoes/1/localizacao',headers={'Authorization':'Bearer admin-only'},json={'latitude':91,'longitude':0})
                self.assertEqual(r.status_code,422)

    def test_delayed_sample_keeps_capture_time(self):
        pool, conn, cur = MagicMock(), MagicMock(), MagicMock()
        pool.get_connection.return_value=conn
        conn.cursor.return_value=cur
        cur.fetchone.side_effect=[{'id_estacao':1},None,None]
        cur.fetchall.return_value=[]
        with patch.object(api,'pool',pool), patch.object(api.time,'time',return_value=1800000000):
            result=api.persistir(api.TelemetriaSchema(**(BASE | {'atraso_envio_ms':60000})))
        self.assertEqual(result['filtros']['telemetria'],'atrasada')
        self.assertEqual(cur.execute.call_args.args[1][-1],1799999940)

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

    def test_station_clock_tolerance_does_not_flicker(self):
        from fastapi.testclient import TestClient
        now = 1800000000
        for delta, expected in [(1, True), (-1, True), (-9, True), (-11, False), (11, False)]:
            pool, conn, cur = MagicMock(), MagicMock(), MagicMock()
            pool.get_connection.return_value = conn
            conn.cursor.return_value = cur
            cur.fetchone.side_effect = [dict(id_estacao=1,latitude=0,longitude=0,descricao='Teste'),{}]
            cur.fetchall.side_effect = [[dict(id_leitura=1,temperatura=24,umidade=50,
                pressao=930,qualidade_ar=None,luminosidade=60,
                data_hora=datetime.fromtimestamp(now-delta,timezone.utc).replace(tzinfo=None),
                qualidade='{}',payload=json.dumps(BASE))],[]]
            with patch.object(api,'pool',pool),patch.object(api.time,'time',return_value=now):
                response=TestClient(api.app).get('/api/leituras/ultimas-24h?id_estacao=1')
            self.assertEqual(response.json()['esp32_ativo'],expected,(delta,response.json()))

    def test_api_history_station_time_filter_and_errors(self):
        from fastapi.testclient import TestClient
        pool, conn, cur = MagicMock(), MagicMock(), MagicMock()
        pool.get_connection.return_value = conn
        conn.cursor.return_value = cur
        cur.fetchone.side_effect = [dict(id_estacao=1, latitude=0., longitude=0., descricao="Teste"), {}]
        cur.fetchall.side_effect = [[dict(id_leitura=1, temperatura=None, umidade=50,
            pressao=930, qualidade_ar=None, luminosidade=60,
            data_hora=datetime.now(timezone.utc).replace(tzinfo=None), qualidade="{}",
            payload=json.dumps(BASE | {"adc_bruto": {"qualidade_ar": 0}}))], []]
        client = TestClient(api.app) # sem lifespan: injeta banco de teste
        with patch.object(api, "pool", pool):
            r = client.get("/api/leituras/ultimas-24h?id_estacao=1")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["esp32_ativo"])
        self.assertIsNone(r.json()["historico"][0]["temperatura"])
        self.assertEqual(r.json()["historico"][0]["adc_bruto"]["qualidade_ar"], 0)
        self.assertIsNone(r.json()["historico"][0]["qualidade_ar"])
        self.assertTrue(any("INTERVAL 1 DAY" in c.args[0] for c in cur.execute.call_args_list))
        with patch.dict('os.environ', {'HTTP_INGEST_TOKEN': ''}):
            self.assertEqual(client.post("/api/leituras", json=BASE).status_code, 404)
        with patch.dict('os.environ', {'HTTP_INGEST_TOKEN': 'test-only'}):
            self.assertEqual(client.post("/api/leituras", json=BASE | {"umidade": 101},
                headers={'Authorization': 'Bearer test-only'}).status_code, 422)
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
    def firmware(self, **config_overrides):
        machine = types.SimpleNamespace(Pin=MagicMock(), ADC=MagicMock(side_effect=OSError), I2C=MagicMock())
        config = types.SimpleNamespace(MQ135_WARMUP_MS=1000, MQ135_CALIBRATION_ENABLED=False,
            STATION_ID=1, SAMPLE_INTERVAL_MS=2500, WIFI_SSID="test", WIFI_PASS="test")
        for key, value in config_overrides.items():
            setattr(config, key, value)
        clock = types.SimpleNamespace(ticks_ms=lambda: 100, ticks_diff=lambda a,b:a-b)
        wlan = MagicMock(); wlan.isconnected.side_effect = [False, False, True]
        with patch.dict(sys.modules, {"machine":machine, "bmp280":types.SimpleNamespace(BMP280=MagicMock(side_effect=OSError)),
            "dht":types.SimpleNamespace(DHT22=MagicMock(side_effect=OSError)), "uasyncio":asyncio,
            "ubinascii":__import__("binascii"), "time":clock, "config":config,
            "network":types.SimpleNamespace(STA_IF=0, WLAN=lambda *a:wlan),
            "mqtt_async":types.SimpleNamespace(MQTTClient=object)}):
            return load("firmware_async_test", ROOT / "firmware/main.py"), wlan

    async def test_mq_pin34_with_disconnected_ldr(self):
        fw, _ = self.firmware(MQ135_ADC_PIN=34,LDR_ADC_PIN=None)
        self.assertEqual(fw.MQ135_ADC_PIN,34)
        self.assertIsNone(fw.adc_ldr)
        self.assertIsNone(fw.ler_luminosidade())
        self.assertIsNone(fw.adc_bruto['luminosidade'])
        self.assertEqual(fw.ADC.call_count,1)

    async def test_adc_pin_conflict_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'compartilhar'):
            self.firmware(MQ135_ADC_PIN=34,LDR_ADC_PIN=34)

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

    async def test_acquisition_restart_preserves_sequence_for_same_boot(self):
        fw, _ = self.firmware()
        async def sleep_ms(ms): raise asyncio.CancelledError()
        fw.asyncio=types.SimpleNamespace(sleep_ms=sleep_ms)
        for _ in range(2):
            with self.assertRaises(asyncio.CancelledError): await fw.adquirir()
        self.assertEqual([r['sequencia'] for r in fw.fila_amostras],[1,2])

    async def test_queue_is_bounded_and_counts_drops(self):
        fw, _ = self.firmware()
        fw.config.MQTT_QUEUE_SIZE=2
        count=0
        async def sleep_ms(ms):
            nonlocal count
            count+=1
            if count==4: raise asyncio.CancelledError()
        fw.asyncio=types.SimpleNamespace(sleep_ms=sleep_ms)
        with self.assertRaises(asyncio.CancelledError): await fw.adquirir()
        self.assertEqual([r['sequencia'] for r in fw.fila_amostras],[3,4])
        self.assertEqual(fw.amostras_descartadas,2)

    async def test_ldr_does_not_clip_large_estimate(self):
        fw, _ = self.firmware()
        fw.adc_ldr=MagicMock()
        fw.adc_ldr.read.return_value=16
        self.assertIsNone(fw.ler_luminosidade())
        self.assertTrue(fw.ldr_saturado)
        self.assertEqual(fw.adc_bruto['luminosidade'],16)

    async def test_ldr_dark_reference_preserves_raw_and_marks_relative_zero(self):
        fw, _ = self.firmware()
        fw.config.LDR_DARK_REFERENCE_ADC=3307
        fw.config.LDR_DARK_MARGIN_ADC=20
        fw.adc_ldr=MagicMock()
        fw.adc_ldr.read.return_value=3300
        self.assertEqual(fw.ler_luminosidade(),0)
        self.assertTrue(fw.ldr_escuro_referencia)
        self.assertEqual(fw.adc_bruto['luminosidade'],3300)
        fw.adc_ldr.read.return_value=1745
        self.assertGreater(fw.ler_luminosidade(),0)
        self.assertFalse(fw.ldr_escuro_referencia)

    async def test_mq_raw_is_available_without_calibration(self):
        fw, _ = self.firmware()
        fw.adc_mq135=MagicMock()
        fw.adc_mq135.read.return_value=133
        self.assertIsNone(fw.ler_qualidade_ar())
        self.assertEqual(fw.adc_bruto['qualidade_ar'],133)

    async def test_mq_divider_and_parallel_load(self):
        fw, _ = self.firmware()
        fw.config.MQ135_WARMUP_MS = 0
        fw.config.MQ135_CALIBRATION_ENABLED = True
        fw.config.MQ135_TARGET_GAS = 'synthetic_test_only'
        fw.config.MQ135_CURVE_A = 110.47
        fw.config.MQ135_CURVE_B = -2.862
        fw.config.MQ135_PPM_MIN = 10
        fw.config.MQ135_PPM_MAX = 1000
        fw.config.MQ135_SUPPLY_V = 5.0
        fw.config.MQ135_DIVIDER_TOP_KOHM = 40.0
        fw.config.MQ135_DIVIDER_BOTTOM_KOHM = 20.0
        fw.config.MQ135_LOAD_KOHM = 10.0
        fw.mq135_r0 = 40.0
        fw.adc_mq135 = types.SimpleNamespace(read=lambda: 650, read_uv=lambda: 500000)
        # 0.5 V no ADC = 1.5 V em AO; RL efetiva = 10 || 60 kOhm;
        # Rs = 20 kOhm. R0 aqui e apenas vetor sintetico de teste.
        self.assertEqual(fw.ler_qualidade_ar(), round(110.47 * 0.5 ** -2.862,2))
        fw.config.MQ135_PPM_MAX = 300
        self.assertIsNone(fw.ler_qualidade_ar())
        self.assertEqual(fw.mq135_estado, "acima_faixa")
        self.assertFalse(fw.mq135_saturado)
        fw.config.MQ135_PPM_MAX = 1000
        fw.config.MQ135_CURVE_A = None
        self.assertIsNone(fw.ler_qualidade_ar())
        fw.config.MQ135_CURVE_A = 110.47
        fw.config.MQ135_LOAD_KOHM = None
        self.assertIsNone(fw.ler_qualidade_ar())
        fw.config.MQ135_LOAD_KOHM = 10.0
        fw.adc_mq135.read = lambda: 0
        self.assertIsNone(fw.ler_qualidade_ar())
        self.assertTrue(fw.mq135_saturado)

    async def test_alcohol_curve_limits_preserve_raw_voltage(self):
        fw, _ = self.firmware()
        fw.config.MQ135_WARMUP_MS = 0
        fw.config.MQ135_CALIBRATION_ENABLED = True
        fw.config.MQ135_TARGET_GAS = 'alcool_equivalente'
        fw.config.MQ135_CURVE_A = 77.255
        fw.config.MQ135_CURVE_B = -3.18
        fw.config.MQ135_PPM_MIN = 10
        fw.config.MQ135_PPM_MAX = 300
        fw.config.MQ135_SUPPLY_V = 4.9
        fw.config.MQ135_DIVIDER_TOP_KOHM = 10
        fw.config.MQ135_DIVIDER_BOTTOM_KOHM = 20
        fw.config.MQ135_LOAD_KOHM = 1
        fw.mq135_r0 = (1/(1+1/30))*(4.9/0.75-1)
        fw.adc_mq135 = types.SimpleNamespace(read=lambda: 1200, read_uv=lambda: 500000)
        self.assertEqual(fw.ler_qualidade_ar(),77.25)
        fw.adc_mq135.read_uv = lambda: 100000
        self.assertIsNone(fw.ler_qualidade_ar())
        self.assertEqual(fw.mq135_estado,'abaixo_faixa')
        self.assertEqual(fw.mq135_tensao_adc_v,0.1)
        fw.adc_mq135.read_uv = lambda: 1200000
        self.assertIsNone(fw.ler_qualidade_ar())
        self.assertEqual(fw.mq135_estado,'acima_faixa')

    async def test_simulation_does_not_fill_measurement_or_reuse_stale_value(self):
        fw, _ = self.firmware()
        fw.config.MQ135_WARMUP_MS=0
        fw.config.MQ135_CALIBRATION_ENABLED=True
        fw.config.MQ135_REFERENCE_IS_SIMULATION=True
        fw.config.MQ135_TARGET_GAS='alcool_equivalente'
        fw.config.MQ135_CURVE_A=77.255
        fw.config.MQ135_CURVE_B=-3.18
        fw.config.MQ135_PPM_MIN=10
        fw.config.MQ135_PPM_MAX=300
        fw.config.MQ135_SUPPLY_V=4.9
        fw.config.MQ135_DIVIDER_TOP_KOHM=10
        fw.config.MQ135_DIVIDER_BOTTOM_KOHM=20
        fw.config.MQ135_LOAD_KOHM=1
        fw.mq135_r0=(1/(1+1/30))*(4.9/.75-1)
        fw.adc_mq135=types.SimpleNamespace(read=lambda:1200,read_uv=lambda:500000)
        data=fw.obter_leituras()
        self.assertIsNone(data['qualidade_ar'])
        self.assertEqual(data['mq135_ppm_simulado'],77.25)
        self.assertTrue(data['mq135_modo_teste'])
        fw.config.MQ135_SIMULATION_PPM_MAX=4000
        fw.adc_mq135.read_uv=lambda:1200000
        data=fw.obter_leituras()
        self.assertIsNone(data['qualidade_ar'])
        self.assertGreater(data['mq135_ppm_simulado'],300)
        self.assertLess(data['mq135_ppm_simulado'],4000)
        fw.adc_mq135.read_uv=lambda:1400000
        data=fw.obter_leituras()
        self.assertIsNone(data['mq135_ppm_simulado'])
        self.assertEqual(data['estado_sensores']['qualidade_ar'],'acima_faixa')
        fw.adc_mq135.read=lambda:0
        self.assertIsNone(fw.obter_leituras()['mq135_ppm_simulado'])

    async def test_mq_adc_failure_does_not_reuse_previous_sample(self):
        fw, _ = self.firmware()
        fw.adc_mq135 = MagicMock()
        fw.adc_mq135.read.return_value = 1970
        self.assertIsNone(fw.ler_qualidade_ar())
        self.assertEqual(fw.adc_bruto['qualidade_ar'],1970)
        fw.adc_mq135.read.side_effect = OSError('ADC failure')
        self.assertIsNone(fw.ler_qualidade_ar())
        self.assertIsNone(fw.adc_bruto['qualidade_ar'])

    async def test_mq_current_two_resistor_divider(self):
        fw, _ = self.firmware()
        fw.config.MQ135_WARMUP_MS = 0
        fw.config.MQ135_CALIBRATION_ENABLED = True
        fw.config.MQ135_TARGET_GAS = 'synthetic_test_only'
        fw.config.MQ135_CURVE_A = 110.47
        fw.config.MQ135_CURVE_B = -2.862
        fw.config.MQ135_PPM_MIN = 10
        fw.config.MQ135_PPM_MAX = 1000
        fw.config.MQ135_SUPPLY_V = 5.0
        fw.config.MQ135_DIVIDER_TOP_KOHM = 20.0
        fw.config.MQ135_DIVIDER_BOTTOM_KOHM = 20.0
        fw.config.MQ135_LOAD_KOHM = 10.0
        fw.mq135_r0 = 40.0
        # RL=10||40=8 kOhm; AO=10/7 V; Rs=20 kOhm.
        fw.adc_mq135 = types.SimpleNamespace(read=lambda:850,read_uv=lambda:5000000/7)
        self.assertEqual(fw.ler_qualidade_ar(), round(110.47 * 0.5 ** -2.862,2))

    async def test_bmp_reinitializes_after_initial_failure(self):
        fw, _ = self.firmware()
        sensor=object()
        fw.BMP280=MagicMock(return_value=sensor)
        count=0
        async def sleep(seconds):
            nonlocal count
            count+=1
            if count==2: raise asyncio.CancelledError()
        fw.asyncio=types.SimpleNamespace(sleep=sleep)
        with self.assertRaises(asyncio.CancelledError): await fw.recuperar_sensores()
        self.assertIs(fw.sensor_bmp,sensor)
        self.assertEqual(fw.I2C.call_args.kwargs["timeout"],20000)

    async def test_publish_keeps_sample_when_broker_fails(self):
        from unittest.mock import AsyncMock
        fw, _ = self.firmware()
        fw.config.MQTT_HOST='127.0.0.1'; fw.config.MQTT_PORT=1883
        fw.config.MQTT_USER=''; fw.config.MQTT_PASSWORD=''
        fw.network=types.SimpleNamespace(STA_IF=0,WLAN=lambda *a:types.SimpleNamespace(isconnected=lambda:True))
        client=types.SimpleNamespace(writer=object(),publish=AsyncMock(side_effect=OSError('offline')),close=AsyncMock())
        fw.MQTTClient=lambda *a:client
        fw.fila_amostras.append(BASE.copy())
        async def sleep(seconds): raise asyncio.CancelledError()
        fw.asyncio=types.SimpleNamespace(sleep=sleep)
        with self.assertRaises(asyncio.CancelledError): await fw.publicar()
        self.assertEqual(fw.fila_amostras[0]['sequencia'],1)

    async def test_ntp_sets_utc_rtc_and_closes_socket(self):
        import struct
        fw, _ = self.firmware()
        sock=MagicMock()
        resposta=bytearray(48); resposta[1]=2
        resposta[40:44]=struct.pack('!I',3900000000+100000000)
        sock.recvfrom.return_value=(bytes(resposta),('162.159.200.1',123))
        rtc=MagicMock()
        fw.time=types.SimpleNamespace(ticks_ms=lambda:0,ticks_diff=lambda a,b:a-b,gmtime=__import__('time').gmtime)
        with patch.dict(sys.modules,{'socket':types.SimpleNamespace(AF_INET=2,SOCK_DGRAM=2,socket=lambda *a:sock),
                                    'machine':types.SimpleNamespace(RTC=lambda:rtc)}):
            await fw.acertar_relogio()
        rtc.datetime.assert_called_once()
        sock.setblocking.assert_called_once_with(False)
        sock.close.assert_called_once()

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

    async def test_wifi_falls_back_and_selects_network_broker(self):
        fw, wlan = self.firmware()
        fw.config.WIFI_NETWORKS = [
            {'ssid':'home','password':'home-test','mqtt_host':'192.168.15.34'},
            {'ssid':'hotspot','password':'hotspot-test','mqtt_host':'192.168.204.45'}]
        fw.config.WIFI_CONNECT_TIMEOUT_MS = 5000
        wlan.isconnected.side_effect = [False] + [False]*6 + [True, True]
        tick = 0
        fw.time.ticks_ms = lambda:tick
        async def sleep(seconds):
            nonlocal tick
            tick += 1000
            if tick == 8000: raise asyncio.CancelledError()
        fw.asyncio = types.SimpleNamespace(sleep=sleep)
        with self.assertRaises(asyncio.CancelledError): await fw.monitor_wifi()
        self.assertEqual(wlan.connect.call_args_list,
                         [unittest.mock.call('home','home-test'),unittest.mock.call('hotspot','hotspot-test')])
        self.assertEqual(fw.broker_host_atual,'192.168.204.45')
        self.assertEqual(fw.wifi_geracao,1)
        wlan.config.assert_called_once_with(reconnects=0)

    async def test_wifi_disconnect_restarts_priority_without_reboot(self):
        fw, wlan = self.firmware()
        fw.config.WIFI_NETWORKS = [{'ssid':'home','password':'test','mqtt_host':'192.168.15.34'}]
        wlan.isconnected.side_effect = [False, False,True,False,True]
        calls = 0
        async def sleep(seconds):
            nonlocal calls
            calls += 1
            if calls == 4: raise asyncio.CancelledError()
        fw.asyncio = types.SimpleNamespace(sleep=sleep)
        with self.assertRaises(asyncio.CancelledError): await fw.monitor_wifi()
        self.assertEqual(wlan.connect.call_count,2)
        self.assertEqual(fw.wifi_geracao,2)

    async def test_supervisor_restarts_failed_task_but_propagates_cancellation(self):
        fw, _ = self.firmware()
        calls=0
        async def failing():
            nonlocal calls
            calls+=1
            if calls==1: raise OSError('transient network failure')
            raise asyncio.CancelledError()
        from unittest.mock import AsyncMock
        fw.asyncio=types.SimpleNamespace(CancelledError=asyncio.CancelledError,sleep=AsyncMock())
        with self.assertRaises(asyncio.CancelledError): await fw.supervisionar('test',failing)
        self.assertEqual(calls,2)
        fw.asyncio.sleep.assert_awaited_once_with(2)

    async def test_mqtt_close_failure_does_not_keep_broken_writer(self):
        from unittest.mock import AsyncMock
        with patch.dict(sys.modules,{'uasyncio':asyncio}):
            module=load('mqtt_close_test',ROOT/'firmware/mqtt_async.py')
        client=module.MQTTClient('127.0.0.1',1883,'test')
        writer=types.SimpleNamespace(close=MagicMock(side_effect=OSError('broken socket')),wait_closed=AsyncMock())
        client.writer=writer; client.reader=object()
        await client.close()
        self.assertIsNone(client.writer)
        self.assertIsNone(client.reader)
        await client.close()
        writer.close.assert_called_once()

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
    def test_bmp_integer_compensation_reference_vector(self):
        import struct
        with patch.dict(sys.modules,{'machine':types.SimpleNamespace(I2C=object)}):
            driver=load('bmp_reference',ROOT/'firmware/bmp280.py')
        bmp=driver.BMP280.__new__(driver.BMP280)
        coeffs=[27504,26435,-1000,36477,-10685,3024,2855,140,-7,15500,-14600,6000]
        for name,value in zip(('T1','T2','T3','P1','P2','P3','P4','P5','P6','P7','P8','P9'),coeffs):
            setattr(bmp,'dig_'+name,value)
        def encoded(v): return bytes((v>>12,(v>>4)&255,(v&15)<<4))
        bmp.i2c=MagicMock(); bmp.addr=0x76
        bmp.i2c.readfrom_mem.return_value=encoded(415148)+encoded(519888)
        temp,press=bmp.ler_valores()
        self.assertEqual(temp,25.1)
        self.assertAlmostEqual(press,1006.53,places=2)
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

class CorrecoesRequisitosTests(unittest.TestCase):
    def test_dht_temperature_priority_and_bmp_fallback(self):
        fw, _ = FirmwareAsyncTests().firmware()
        fw.sensor_bmp = MagicMock()
        fw.sensor_bmp.ler_valores.return_value = (26, 950)
        fw.sensor_dht = MagicMock()
        fw.sensor_dht.temperature.return_value = 23
        fw.sensor_dht.humidity.return_value = 60
        data = fw.obter_leituras()
        self.assertEqual((data['temperatura'], data['origem_temperatura'], data['pressao']), (23, 'DHT22', 950))
        fw.sensor_dht.measure.side_effect = OSError('desconectado')
        data = fw.obter_leituras()
        self.assertEqual((data['temperatura'], data['origem_temperatura']), (26, 'BMP280'))
        fw.sensor_dht.measure.side_effect = None
        for invalid in (150, float('nan')):
            fw.sensor_dht.temperature.return_value = invalid
            data = fw.obter_leituras()
            self.assertEqual((data['temperatura'], data['origem_temperatura']), (26, 'BMP280'))

    def test_mq_diagnoses_raw_limits_even_without_calibration(self):
        fw, _ = FirmwareAsyncTests().firmware()
        fw.adc_mq135 = MagicMock()
        for raw, state in ((0, "sinal_baixo"), (4095, "adc_saturado")):
            fw.adc_mq135.read.return_value = raw
            data = fw.obter_leituras()
            self.assertEqual(data['estado_sensores']['qualidade_ar'], state)
            self.assertEqual(data['adc_bruto']['qualidade_ar'], raw)
            self.assertIsNone(data['qualidade_ar'])

    def test_mq_reports_missing_curve_instead_of_generic_failure(self):
        fw, _ = FirmwareAsyncTests().firmware()
        fw.config.MQ135_WARMUP_MS = 0
        fw.config.MQ135_CALIBRATION_ENABLED = True
        fw.mq135_r0 = 1
        fw.adc_mq135 = types.SimpleNamespace(read=lambda:650, read_uv=lambda:500000)
        fw.config.MQ135_SUPPLY_V = 5
        fw.config.MQ135_DIVIDER_TOP_KOHM = 40
        fw.config.MQ135_DIVIDER_BOTTOM_KOHM = 20
        fw.config.MQ135_LOAD_KOHM = 1
        data = fw.obter_leituras()
        self.assertIsNone(data['qualidade_ar'])
        self.assertEqual(data['estado_sensores']['qualidade_ar'], 'configuracao_invalida')

    def test_ldr_does_not_reuse_raw_after_read_error(self):
        fw, _ = FirmwareAsyncTests().firmware()
        fw.adc_ldr = MagicMock()
        fw.adc_ldr.read.side_effect = [2048, OSError('ADC')]
        fw.ler_luminosidade()
        self.assertEqual(fw.adc_bruto['luminosidade'],2048)
        self.assertIsNone(fw.ler_luminosidade())
        self.assertIsNone(fw.adc_bruto['luminosidade'])

    def test_filter_window_uses_capture_time_for_queued_samples(self):
        pool, conn, cur = MagicMock(), MagicMock(), MagicMock()
        pool.get_connection.return_value = conn
        conn.cursor.return_value = cur
        cur.fetchone.side_effect = [{'id_estacao':1},None,None]
        cur.fetchall.return_value = []
        with patch.object(api,'pool',pool), patch.object(api.time,'time',return_value=1800000000):
            api.persistir(api.TelemetriaSchema(**(BASE | {'atraso_envio_ms':60000})))
        window = next(c for c in cur.execute.call_args_list if 'SELECT payload, qualidade' in c.args[0])
        self.assertIn('data_hora <= FROM_UNIXTIME',window.args[0])
        self.assertEqual(window.args[1][-2:],(1799999940,1799999940))

if __name__ == "__main__": unittest.main()


class BMPProbeTests(unittest.TestCase):
    def test_probe_only_two_addresses_without_full_bus_scan(self):
        with patch.dict(sys.modules, {'machine': types.SimpleNamespace(I2C=MagicMock())}):
            driver=load('bmp_probe_test', ROOT/'firmware/bmp280.py')
        for available in (0x76, 0x77, None):
            bus=MagicMock()
            probes=[]
            def read(addr, register, length):
                if register==0xD0:
                    probes.append(addr)
                if addr != available:
                    raise OSError('sensor disconnected')
                return bytes(length)
            bus.readfrom_mem.side_effect=read
            with patch.object(driver.time,'sleep'):
                if available is None:
                    with self.assertRaises(RuntimeError):driver.BMP280(bus)
                else:
                    self.assertEqual(driver.BMP280(bus).addr,available)
            bus.scan.assert_not_called()
            self.assertEqual(probes,[0x76] if available==0x76 else [0x76,0x77])
