import gc
import json
import math
import time
import network
import os
import ubinascii
import uasyncio as asyncio
from machine import Pin, ADC, I2C
from bmp280 import BMP280
import config
from mqtt_async import MQTTClient

INICIO = time.ticks_ms()
BOOT_ID = ubinascii.hexlify(os.urandom(8)).decode()
ultima_amostra = None

# ------------------------------------------------------------------------------
# 1. INICIALIZAÇÃO DE SENSORES
# ------------------------------------------------------------------------------
# BMP280 (I2C: SDA=21, SCL=22)
sensor_bmp = None
try:
    i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000)
    sensor_bmp = BMP280(i2c, addr=0x76)
    print("[HARDWARE] BMP280 detectado no I2C (0x76).")
except Exception as e:
    print("[AVISO] Falha ao inicializar BMP280:", e)

# DHT22 (GPIO 4)
sensor_dht = None
try:
    import dht
    sensor_dht = dht.DHT22(Pin(4))
    print("[HARDWARE] DHT22 configurado na GPIO 4.")
except Exception as e:
    print("[AVISO] Falha ao inicializar DHT22:", e)

# LDR (Sensor de Luminosidade no pino ADC 34)
adc_ldr = None
try:
    adc_ldr = ADC(Pin(34))
    adc_ldr.atten(ADC.ATTN_11DB)
    print("[HARDWARE] LDR configurado na GPIO 34.")
except Exception as e:
    print("[AVISO] Falha ao inicializar LDR:", e)

# MQ-135 (Sensor de Qualidade do Ar no pino ADC 35)
adc_mq135 = None
mq135_r0 = None

try:
    adc_mq135 = ADC(Pin(35))
    adc_mq135.atten(ADC.ATTN_11DB)
    print("[HARDWARE] MQ-135 configurado na GPIO 35.")
except Exception as e:
    print("[AVISO] Falha ao inicializar MQ-135:", e)

def ler_luminosidade():
    """Calcula iluminancia em Lux com base no LDR na GPIO 34"""
    if not adc_ldr:
        return None
    try:
        raw = adc_ldr.read()
        if raw <= 15:
            return 3000.0
        v_out = (raw / 4095.0) * 3.3
        if (3.3 - v_out) <= 0.01:
            return None
        r_ldr = 10.0 * v_out / (3.3 - v_out)
        lux = 500.0 * math.pow(r_ldr, -1.4)
        return round(min(lux, 5000.0), 1)
    except Exception:
        return None

def ler_qualidade_ar():
    """Calcula concentracao em PPM com base no MQ-135 na GPIO 35"""
    global mq135_r0
    if time.ticks_diff(time.ticks_ms(), INICIO) < config.MQ135_WARMUP_MS:
        return None
    if not config.MQ135_CALIBRATION_ENABLED:
        return None
    if not adc_mq135:
        return None
    try:
        # Média de 8 amostras para filtrar ruído do conversor ADC
        leituras = [adc_mq135.read() for _ in range(8)]
        raw = sum(leituras) / len(leituras)
        
        if raw <= 30:
            print("[MQ-135] Leitura muito baixa (verifique conexão física ou pino ADC). RAW:", round(raw))
            return None

        v_out = (raw / 4095.0) * 3.3
        if (3.3 - v_out) <= 0.03:
            return None  # ADC saturado

        rs = ((3.3 - v_out) / max(0.01, v_out)) * 10.0

        # Calibra o R0 no ambiente inicial (~400 ppm baseline em ar limpo)
        if mq135_r0 is None:
            mq135_r0 = rs / 0.637
            print(f"[MQ-135] Calibração de baseline concluída: R0={mq135_r0:.2f} kOhms (RAW={round(raw)})")

        ratio = rs / mq135_r0
        # Curva exponencial padrão do sensor MQ-135 para CO2/gases
        ppm = 110.47 * math.pow(max(0.1, ratio), -2.862)
        
        # Limita para uma faixa lógica e realista de exibição
        ppm_final = int(max(300, min(ppm, 3500)))
        print(f"[MQ-135] RAW: {round(raw)} | Vout: {v_out:.2f}V | Rs: {rs:.1f}k | PPM: {ppm_final}")
        return ppm_final
    except Exception as e:
        print("[MQ-135 ERRO]", e)
        return None

def obter_leituras():
    temp = None
    pressao = None
    umid = None
    origem = None

    # Leitura BMP280
    if sensor_bmp:
        try:
            temp_bmp, pressao_bmp = sensor_bmp.ler_valores()
            if not (-40 <= temp_bmp <= 80 and 300 <= pressao_bmp <= 1200):
                raise ValueError("BMP280 fora da faixa fisica")
            temp = temp_bmp
            origem = "BMP280"
            pressao = pressao_bmp
        except Exception as e:
            print("[BMP280] Erro de leitura:", e)

    # Leitura DHT22
    if sensor_dht:
        try:
            sensor_dht.measure()
            umid = round(sensor_dht.humidity(), 1)
            if temp is None:
                temp = round(sensor_dht.temperature(), 1)
                origem = "DHT22"
        except Exception:
            pass

    ar = ler_qualidade_ar()
    luz = ler_luminosidade()
    valores = {"temperatura": temp, "pressao": pressao, "umidade": umid,
               "qualidade_ar": ar, "luminosidade": luz}
    limites = {"temperatura": (-40, 80), "pressao": (300, 1200),
               "umidade": (0, 100), "qualidade_ar": (0, 10000), "luminosidade": (0, 100000)}
    for campo, faixa in limites.items():
        valor = valores[campo]
        if valor is not None and ((math.isnan(valor) or math.isinf(valor)) or not faixa[0] <= valor <= faixa[1]):
            valores[campo] = None
    estados = {k: "ok" if v is not None else "indisponivel" for k, v in valores.items()}
    if adc_mq135 and time.ticks_diff(time.ticks_ms(), INICIO) < config.MQ135_WARMUP_MS:
        estados["qualidade_ar"] = "aquecendo"
    elif adc_mq135 and not config.MQ135_CALIBRATION_ENABLED:
        estados["qualidade_ar"] = "calibracao_pendente"
    for k in ("qualidade_ar", "luminosidade"):
        if valores[k] is not None:
            estados[k] = "estimativa"
    valores.update(id_estacao=config.STATION_ID, boot_id=BOOT_ID,
                   sequencia=0, uptime_ms=time.ticks_ms(),
                   origem_temperatura=origem, estado_sensores=estados)
    return valores

async def adquirir():
    global ultima_amostra
    sequencia = 0
    while True:
        inicio = time.ticks_ms()
        try:
            dados = obter_leituras()
            sequencia += 1
            dados["sequencia"] = sequencia
            ultima_amostra = dados
        except Exception as exc:
            print("[AQUISICAO]", exc)
        decorrido = time.ticks_diff(time.ticks_ms(), inicio)
        await asyncio.sleep_ms(max(0, config.SAMPLE_INTERVAL_MS - decorrido))


async def monitor_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    while True:
        if not wlan.isconnected():
            try:
                wlan.connect(config.WIFI_SSID, config.WIFI_PASS)
            except OSError as exc:
                print("[WIFI]", exc)
        await asyncio.sleep(10)


async def publicar():
    cliente = MQTTClient(config.MQTT_HOST, config.MQTT_PORT,
                         "esp32-%s-%s" % (config.STATION_ID, BOOT_ID),
                         config.MQTT_USER, config.MQTT_PASSWORD)
    enviada = 0
    atraso = 1
    while True:
        try:
            if not network.WLAN(network.STA_IF).isconnected():
                raise OSError("Wi-Fi indisponivel")
            if cliente.writer is None:
                await cliente.connect()
            amostra = ultima_amostra
            # Latest-request-wins: sem fila ilimitada durante indisponibilidade.
            if amostra is not None and amostra["sequencia"] != enviada:
                await cliente.publish("estacoes/%s/telemetria" % config.STATION_ID,
                                      json.dumps(amostra))
                enviada = amostra["sequencia"]
            atraso = 1
            await asyncio.sleep_ms(100)
        except Exception as exc:
            print("[MQTT] Reconectando:", exc)
            await cliente.close()
            await asyncio.sleep(atraso)
            atraso = min(30, atraso * 2)


async def diagnostico(reader, writer):
    try:
        linha = await asyncio.wait_for(reader.readline(), 2)
        rota = linha.split()[1] if len(linha.split()) >= 2 else b""
        if rota == b"/api/dados" and ultima_amostra:
            codigo, corpo = "200 OK", json.dumps(ultima_amostra)
        else:
            codigo, corpo = "503 Service Unavailable", '{"status":"sem amostra"}'
        writer.write(("HTTP/1.1 %s\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n%s" % (codigo, corpo)).encode())
        await asyncio.wait_for(writer.drain(), 2)
    except Exception as exc:
        print("[HTTP]", exc)
    finally:
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), 2)
        except Exception:
            pass


async def main():
    tarefas = [asyncio.create_task(adquirir()), asyncio.create_task(monitor_wifi()),
               asyncio.create_task(publicar())]
    servidor = None
    if config.HTTP_DIAGNOSTICS:
        servidor = await asyncio.start_server(diagnostico, "0.0.0.0", 80, backlog=3)
    while True:
        await asyncio.sleep(60)
        gc.collect()


if __name__ == "__main__":
    asyncio.run(main())
