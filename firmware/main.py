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
fila_amostras = []
amostras_descartadas = 0
sequencia_coleta = 0
adc_bruto = {"qualidade_ar": None, "luminosidade": None}
mq135_saturado = False
mq135_estado = "indisponivel"
mq135_tensao_adc_v = None
mq135_ppm_simulado = None
LDR_ADC_PIN = getattr(config, "LDR_ADC_PIN", 34)
MQ135_ADC_PIN = getattr(config, "MQ135_ADC_PIN", 35)
if LDR_ADC_PIN is not None and LDR_ADC_PIN == MQ135_ADC_PIN:
    raise ValueError("LDR e MQ-135 nao podem compartilhar o mesmo pino ADC")

# ------------------------------------------------------------------------------
# 1. INICIALIZAÇÃO DE SENSORES
# ------------------------------------------------------------------------------
# BMP280 (I2C: SDA=21, SCL=22)
sensor_bmp = None
try:
    i2c = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000, timeout=20000)
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
    if LDR_ADC_PIN is not None:
        adc_ldr = ADC(Pin(LDR_ADC_PIN))
        adc_ldr.atten(ADC.ATTN_11DB)
        print("[HARDWARE] LDR configurado na GPIO", LDR_ADC_PIN)
    else:
        print("[HARDWARE] LDR desabilitado na configuracao.")
except Exception as e:
    print("[AVISO] Falha ao inicializar LDR:", e)

# MQ-135 (pino e faixa ADC definidos na configuracao)
adc_mq135 = None
mq135_r0 = getattr(config, "MQ135_R0_KOHM", None)
ldr_saturado = False
ldr_escuro_referencia = False

try:
    adc_mq135 = ADC(Pin(MQ135_ADC_PIN))
    mq135_atenuacao = getattr(config, "MQ135_ADC_ATTENUATION_DB", 11)
    if mq135_atenuacao not in (0, 2.5, 6, 11):
        raise ValueError("Atenuacao MQ-135 deve ser 0, 2.5, 6 ou 11 dB")
    if mq135_atenuacao == 0:
        atenuacao = ADC.ATTN_0DB
    elif mq135_atenuacao == 2.5:
        atenuacao = ADC.ATTN_2_5DB
    elif mq135_atenuacao == 6:
        atenuacao = ADC.ATTN_6DB
    else:
        atenuacao = ADC.ATTN_11DB
    adc_mq135.atten(atenuacao)
    adc_mq135.width(ADC.WIDTH_12BIT)
    print("[HARDWARE] MQ-135 configurado na GPIO", MQ135_ADC_PIN)
except Exception as e:
    print("[AVISO] Falha ao inicializar MQ-135:", e)

def ler_luminosidade():
    global ldr_saturado, ldr_escuro_referencia
    ldr_saturado = False
    ldr_escuro_referencia = False
    adc_bruto["luminosidade"] = None
    """Calcula iluminancia em Lux com base no LDR na GPIO 34"""
    if not adc_ldr:
        return None
    try:
        raw = adc_ldr.read()
        adc_bruto["luminosidade"] = raw
        if raw <= 15:
            ldr_saturado = True
            return None  # Extremo do ADC: nao converter em iluminancia fixa.
        v_out = (raw / 4095.0) * 3.3
        if (3.3 - v_out) <= 0.01:
            ldr_saturado = True
            return None
        r_ldr = 10.0 * v_out / (3.3 - v_out)
        lux = 500.0 * math.pow(r_ldr, -1.4)
        escuro = getattr(config, 'LDR_DARK_REFERENCE_ADC', None)
        if isinstance(escuro, (int, float)) and 15 < escuro < 4080:
            margem = max(0, min(100, getattr(config, 'LDR_DARK_MARGIN_ADC', 20)))
            if raw >= escuro - margem:
                ldr_escuro_referencia = True
                return 0.0
            r_escuro = 10.0 * escuro / (4095.0 - escuro)
            lux = max(0.0, lux - 500.0 * math.pow(r_escuro, -1.4))
        if lux > 5000:
            ldr_saturado = True
            return None
        return round(lux, 1)
    except Exception:
        return None

def ler_qualidade_ar():
    """Preserva ADC bruto; estima ppm somente com parametros configurados."""
    global mq135_saturado, mq135_estado, mq135_tensao_adc_v, mq135_ppm_simulado
    mq135_ppm_simulado = None
    mq135_tensao_adc_v = None
    mq135_saturado = False
    mq135_estado = "indisponivel"
    # Uma falha nesta coleta nao pode reapresentar o ADC da amostra anterior.
    adc_bruto["qualidade_ar"] = None
    if not adc_mq135:
        return None
    try:
        # Média de 8 amostras para filtrar ruído do conversor ADC
        leituras = [adc_mq135.read() for _ in range(8)]
        raw = sum(leituras) / len(leituras)
        adc_bruto["qualidade_ar"] = raw
        # Diagnostico eletrico independe de a conversao estar habilitada.
        if raw <= 30 or raw >= 4080:
            mq135_saturado = True
            mq135_estado = "sinal_baixo" if raw <= 30 else "adc_saturado"
            return None
        # Tensao disponivel mesmo com ppm desabilitado. Nao publicar piso ADC.
        if hasattr(adc_mq135, "read_uv"):
            mq135_tensao_adc_v = sum(adc_mq135.read_uv() for _ in range(8)) / 8000000.0
        em_aquecimento = time.ticks_diff(time.ticks_ms(), INICIO) < config.MQ135_WARMUP_MS
        if em_aquecimento:
            # A estimativa pode aparecer desde o inicio, mas a interface mantem
            # o estado de aquecimento para sinalizar que o valor e instavel.
            mq135_estado = "aquecendo"
        if not config.MQ135_CALIBRATION_ENABLED:
            mq135_estado = "calibracao_pendente"
            return None
        if (not isinstance(mq135_r0, (int, float)) or mq135_r0 <= 0
                or math.isnan(mq135_r0) or math.isinf(mq135_r0)):
            mq135_estado = "calibracao_pendente"
            return None
        # Falta de parametros nao deve ser confundida com falha de ADC.
        mq135_estado = "configuracao_invalida"
        # ADC calibrado em microvolts; nao supor escala linear de 0 a 3,3 V.
        if not hasattr(adc_mq135, "read_uv"):
            mq135_estado = "adc_nao_suportado"
            return None
        v_adc = mq135_tensao_adc_v
        superior = getattr(config, "MQ135_DIVIDER_TOP_KOHM", None)
        inferior = getattr(config, "MQ135_DIVIDER_BOTTOM_KOHM", None)
        carga = getattr(config, "MQ135_LOAD_KOHM", None)
        alimentacao = getattr(config, "MQ135_SUPPLY_V", 5.0)
        if not all(isinstance(v, (int, float)) and v > 0 and not math.isinf(v) and not math.isnan(v)
                   for v in (superior, inferior, carga, alimentacao)):
            return None
        fator = getattr(config, "MQ135_DIVIDER_FACTOR", (superior + inferior) / inferior)
        if not isinstance(fator, (int, float)) or (math.isinf(fator) or math.isnan(fator)) or fator < 1:
            return None
        v_out = v_adc * fator
        if not 0 < v_out < alimentacao:
            mq135_estado = "fora_da_faixa"
            mq135_saturado = True
            return None
        # O divisor tambem carrega AO: sua resistencia total fica em paralelo com RL.
        carga_efetiva = 1.0 / (1.0 / carga + 1.0 / (superior + inferior))
        if fator == 1.0:
            carga_efetiva = carga  # Resistor em serie, sem ramo divisor para GND.
        rs = ((alimentacao - v_out) / v_out) * carga_efetiva

        ratio = rs / mq135_r0
        # ppm = A * (Rs/R0)**B, para UM gas e referencia compativel com R0.
        # A faixa de deteccao sozinha nao determina A, B ou R0.
        gas = getattr(config, "MQ135_TARGET_GAS", None)
        a = getattr(config, "MQ135_CURVE_A", None)
        b = getattr(config, "MQ135_CURVE_B", None)
        minimo = getattr(config, "MQ135_PPM_MIN", None)
        maximo = getattr(config, "MQ135_PPM_MAX", None)
        if getattr(config, "MQ135_REFERENCE_IS_SIMULATION", False):
            maximo = getattr(config, "MQ135_SIMULATION_PPM_MAX", maximo)
        if not isinstance(gas, str) or not gas.strip():
            return None
        if not all(isinstance(v, (int, float)) and not math.isinf(v) and not math.isnan(v)
                   for v in (a, b, minimo, maximo)):
            return None
        if not (a > 0 and b < 0 and 0 <= minimo < maximo):
            return None
        ppm = a * math.pow(ratio, b)
        if math.isnan(ppm) or math.isinf(ppm) or ppm <= 0:
            mq135_estado = "abaixo_faixa"
            return None
        # Nunca ajustar artificialmente a leitura para caber no anuncio.
        if not minimo <= ppm <= maximo:
            mq135_estado = "abaixo_faixa" if ppm < minimo else "acima_faixa"
            return None
        mq135_estado = "aquecendo" if em_aquecimento else "estimativa"
        ppm_final = round(ppm, 4 if ppm < 10 else 2)
        print(f"[MQ-135] RAW: {round(raw)} | Vout: {v_out:.2f}V | Rs: {rs:.1f}k | PPM: {ppm_final}")
        if getattr(config, "MQ135_REFERENCE_IS_SIMULATION", False):
            mq135_ppm_simulado = ppm_final
            mq135_estado = "aquecendo" if em_aquecimento else "simulacao"
            return None
        return ppm_final
    except Exception as e:
        mq135_estado = "erro_leitura"
        print("[MQ-135 ERRO]", e)
        return None

def obter_leituras():
    global sensor_bmp
    temp = None
    pressao = None
    umid = None
    origem = None

    # BMP280 fornece pressao e temperatura de reserva para falha do DHT22.
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
            sensor_bmp = None

    # Leitura DHT22
    if sensor_dht:
        try:
            sensor_dht.measure()
            umid = round(sensor_dht.humidity(), 1)
            temp_dht = round(sensor_dht.temperature(), 1)
            if math.isnan(temp_dht) or math.isinf(temp_dht) or not -40 <= temp_dht <= 80:
                raise ValueError("DHT22 temperatura fora da faixa fisica")
            temp = temp_dht
            origem = "DHT22"
        except Exception as e:
            print("[DHT22] Erro de leitura; temperatura de reserva:", e)

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
    if ldr_saturado:
        estados["luminosidade"] = "saturado"
    estados["qualidade_ar"] = mq135_estado
    for k in ("qualidade_ar", "luminosidade"):
        if valores[k] is not None and not (k == "qualidade_ar" and mq135_estado == "aquecendo"):
            estados[k] = "estimativa"
    if ldr_escuro_referencia:
        estados['luminosidade'] = 'escuro_referencia'
    valores.update(id_estacao=config.STATION_ID, boot_id=BOOT_ID,
                   sequencia=0, uptime_ms=time.ticks_ms(),
                   origem_temperatura=origem, estado_sensores=estados)
    valores["adc_bruto"] = adc_bruto.copy()
    valores["mq135_tensao_adc_v"] = mq135_tensao_adc_v
    valores["mq135_aquecimento_restante_ms"] = max(0, config.MQ135_WARMUP_MS - time.ticks_diff(time.ticks_ms(), INICIO))
    valores["mq135_modo_teste"] = bool(getattr(config, "MQ135_REFERENCE_IS_SIMULATION", False))
    valores["mq135_ppm_simulado"] = mq135_ppm_simulado
    # Somente usar RTC quando seu ano indicar que foi sincronizado.
    if hasattr(time, "gmtime") and time.gmtime()[0] >= 2024:
        epoch_offset = 946684800 if time.gmtime(0)[0] == 2000 else 0
        valores["coletado_em"] = time.time() + epoch_offset
    return valores

async def adquirir():
    global ultima_amostra, amostras_descartadas, sequencia_coleta
    while True:
        inicio = time.ticks_ms()
        try:
            dados = obter_leituras()
            sequencia_coleta += 1
            dados["sequencia"] = sequencia_coleta
            if len(fila_amostras) >= max(1, getattr(config, "MQTT_QUEUE_SIZE", 24)):
                fila_amostras.pop(0)
                amostras_descartadas += 1
                print("[MQTT] Fila cheia; total descartado:", amostras_descartadas)
            dados["amostras_descartadas"] = amostras_descartadas
            ultima_amostra = dados
            fila_amostras.append(dados)
            print("[AQUISICAO JSON]", json.dumps(dados))
        except Exception as exc:
            print("[AQUISICAO]", exc)
        decorrido = time.ticks_diff(time.ticks_ms(), inicio)
        await asyncio.sleep_ms(max(0, config.SAMPLE_INTERVAL_MS - decorrido))


def redes_wifi():
    redes = getattr(config, "WIFI_NETWORKS", None)
    if redes is None:
        return [{"ssid": config.WIFI_SSID, "password": config.WIFI_PASS,
                 "mqtt_host": getattr(config, "MQTT_HOST", "127.0.0.1")}]
    return [r for r in redes if isinstance(r, dict) and r.get("ssid")]


broker_host_atual = getattr(config, "MQTT_HOST", "127.0.0.1")
wifi_geracao = 0


async def monitor_wifi():
    global broker_host_atual, wifi_geracao
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    # Evita que o driver insista para sempre numa rede indisponivel.
    wlan.config(reconnects=0)
    redes = redes_wifi()
    if not redes:
        print("[WIFI] Nenhuma rede configurada")
        return
    if wlan.isconnected():
        # Preserva o WebREPL e usa o broker da rede que ja esta conectada.
        ssid_atual = wlan.config('essid')
        rede_atual = next((r for r in redes if r['ssid'] == ssid_atual), None)
        if rede_atual is not None:
            broker_host_atual = rede_atual.get('mqtt_host') or getattr(config, 'MQTT_HOST', '127.0.0.1')
        else:
            wlan.disconnect()
    conectado = False
    indice = 0
    inicio_tentativa = None
    prazo = max(5000, getattr(config, "WIFI_CONNECT_TIMEOUT_MS", 15000))
    while True:
        estado = wlan.isconnected()
        if estado and not conectado:
            wifi_geracao += 1
            print("[WIFI] Conectado. IP:", wlan.ifconfig()[0])
        elif conectado and not estado:
            print("[WIFI] Conexao perdida")
            indice = 0
            inicio_tentativa = None
        conectado = estado
        if not estado:
            if inicio_tentativa is None or time.ticks_diff(time.ticks_ms(), inicio_tentativa) >= prazo:
                wlan.disconnect()
                rede = redes[indice]
                broker_host_atual = rede.get("mqtt_host") or getattr(config, "MQTT_HOST", "127.0.0.1")
                print("[WIFI] Tentando rede salva", indice + 1, "de", len(redes))
                try:
                    wlan.connect(rede["ssid"], rede.get("password", ""))
                except OSError as exc:
                    print("[WIFI]", exc)
                inicio_tentativa = time.ticks_ms()
                indice = (indice + 1) % len(redes)
        await asyncio.sleep(1)


async def publicar():
    host = broker_host_atual
    geracao = wifi_geracao
    cliente = MQTTClient(host, config.MQTT_PORT,
                         "esp32-%s-%s" % (config.STATION_ID, BOOT_ID),
                         config.MQTT_USER, config.MQTT_PASSWORD)
    atraso = 1
    while True:
        try:
            if not network.WLAN(network.STA_IF).isconnected():
                raise OSError("Wi-Fi indisponivel")
            if host != broker_host_atual or geracao != wifi_geracao:
                await cliente.close()
                host, geracao = broker_host_atual, wifi_geracao
                cliente.host = host
            if cliente.writer is None:
                await cliente.connect()
                print("[MQTT] Conectado ao broker")
            amostra = fila_amostras[0] if fila_amostras else None
            if amostra is not None:
                envio = amostra.copy()
                envio["atraso_envio_ms"] = max(0, time.ticks_diff(time.ticks_ms(), amostra["uptime_ms"]))
                await cliente.publish("estacoes/%s/telemetria" % config.STATION_ID,
                                      json.dumps(envio))
                if fila_amostras and fila_amostras[0] is amostra:
                    fila_amostras.pop(0)
                print("[MQTT] Publicacao confirmada pelo broker. Sequencia:", amostra["sequencia"])
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


async def supervisionar(nome, executar):
    """Reinicia somente a tarefa que falhou, sem parar as outras tarefas."""
    while True:
        try:
            await executar()
            print("[TAREFA] Terminou inesperadamente:", nome)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print("[TAREFA] Falha:", nome, exc)
        await asyncio.sleep(2)


async def main():
    tarefas = [asyncio.create_task(supervisionar(nome, executar)) for nome, executar in (
        ("aquisicao", adquirir), ("wifi", monitor_wifi), ("mqtt", publicar),
        ("sensores", recuperar_sensores), ("relogio", sincronizar_relogio))]
    servidor = None
    if config.HTTP_DIAGNOSTICS:
        servidor = await asyncio.start_server(diagnostico, "0.0.0.0", 80, backlog=3)
    while True:
        await asyncio.sleep(60)
        gc.collect()


async def recuperar_sensores():
    global sensor_bmp
    while True:
        await asyncio.sleep(10)
        if sensor_bmp is None:
            try:
                bus = I2C(0, sda=Pin(21), scl=Pin(22), freq=100000, timeout=20000)
                sensor_bmp = BMP280(bus, addr=0x76)
                print("[BMP280] Inicializacao recuperada")
            except Exception:
                pass


async def sincronizar_relogio():
    while True:
        sincronizado = False
        if network.WLAN(network.STA_IF).isconnected():
            try:
                await acertar_relogio()
                sincronizado = True
                print("[RELOGIO] RTC sincronizado em UTC")
            except Exception as exc:
                print("[RELOGIO] Sem sincronizacao; horario da coleta indisponivel:", exc)
        await asyncio.sleep(21600 if sincronizado else 60)


async def acertar_relogio():
    """NTP com socket nao bloqueante e prazo total de 2 segundos."""
    import socket
    import struct
    from machine import RTC
    host = getattr(config, "NTP_HOST", "162.159.200.1")
    if len(host.split('.')) != 4 or not all(p.isdigit() and 0 <= int(p) <= 255 for p in host.split('.')):
        raise ValueError("NTP_HOST deve ser IPv4 numerico")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setblocking(False)
    inicio = time.ticks_ms()
    try:
        consulta = b'\x23' + bytes(47)
        while True:
            try:
                sock.sendto(consulta, (host, 123))
                break
            except OSError as exc:
                if exc.args[0] not in (11, 115) or time.ticks_diff(time.ticks_ms(), inicio) >= 2000:
                    raise
                await asyncio.sleep_ms(50)
        while time.ticks_diff(time.ticks_ms(), inicio) < 2000:
            try:
                resposta, origem = sock.recvfrom(48)
                if origem[0] != host or len(resposta) != 48 or not 1 <= resposta[1] <= 15:
                    raise ValueError("Resposta NTP invalida")
                segundos = struct.unpack('!I', resposta[40:44])[0]
                if segundos < 3913056000:
                    segundos += 0x100000000
                delta = 3155673600 if time.gmtime(0)[0] == 2000 else 2208988800
                tm = time.gmtime(segundos - delta)
                RTC().datetime((tm[0],tm[1],tm[2],tm[6]+1,tm[3],tm[4],tm[5],0))
                return
            except OSError as exc:
                if exc.args[0] not in (11, 115):
                    raise
                await asyncio.sleep_ms(50)
        raise OSError("Tempo NTP esgotado")
    finally:
        sock.close()


if __name__ == "__main__":
    asyncio.run(main())
