# Copie como config.py no ESP32 e preencha apenas na copia privada.
WIFI_SSID = "SUA_REDE"
WIFI_PASS = "SUA_SENHA"
# Redes tentadas em ordem. Use o IP do notebook em cada rede para mqtt_host.
# Nenhuma troca e forcada enquanto a conexao atual estiver funcionando.
WIFI_NETWORKS = [
    {"ssid": "REDE_DE_CASA", "password": "SENHA_DE_CASA", "mqtt_host": "192.168.1.10"},
    {"ssid": "HOTSPOT", "password": "SENHA_DO_HOTSPOT", "mqtt_host": "192.168.204.45"},
]
WIFI_CONNECT_TIMEOUT_MS = 15000
# Use IP do computador/broker na LAN para evitar DNS bloqueante no MicroPython.
MQTT_HOST = "192.168.1.10"
MQTT_PORT = 1883
MQTT_USER = ""
MQTT_PASSWORD = ""
STATION_ID = 1
SAMPLE_INTERVAL_MS = 2500
HTTP_DIAGNOSTICS = False
# Pinagem padrao da estacao completa. Para teste do MQ na D34, usar
# MQ135_ADC_PIN = 34 e LDR_ADC_PIN = None com LDR fisicamente desconectado.
MQ135_ADC_PIN = 35
LDR_ADC_PIN = 34
# Referencia medida cobrindo completamente o LDR. None desabilita zero relativo.
LDR_DARK_REFERENCE_ADC = None
LDR_DARK_MARGIN_ADC = 20
# Aquecimento inicial demonstrativo; seguir o fabricante do modulo real.
MQ135_WARMUP_MS = 180000
# Habilitar somente apos conferir circuito e baseline em ambiente de referencia.
MQ135_CALIBRATION_ENABLED = False
# R0 deve corresponder a curva escolhida; ver docs/estimativa-alcool-mq135.md.
MQ135_R0_KOHM = None
# AO -- 10k -- GPIO35 -- 20k -- GND; terra comum; DO desconectado.
# Alimentacao assumida pelo usuario, nao medida nesta montagem.
MQ135_SUPPLY_V = 4.90
MQ135_DIVIDER_TOP_KOHM = 10.0
MQ135_DIVIDER_BOTTOM_KOHM = 20.0
# RL = resistor 102 central de 1 kOhm; identificado e confirmado pelo usuario por inspecao das trilhas.
MQ135_LOAD_KOHM = 1.0
# Curva documentada para um gas, compativel com a referencia usada em R0.
# Faixas do anuncio: amonia/alcool 10-300 ppm; benzeno 10-1000 ppm.
# Esses limites NAO fornecem os coeficientes nem calibram o sensor.
MQ135_TARGET_GAS = "alcool_equivalente"
MQ135_CURVE_A = 77.255
MQ135_CURVE_B = -3.18
MQ135_PPM_MIN = 0.0
MQ135_PPM_MAX = 300.0
# Fila limitada em RAM: cerca de um minuto no intervalo padrao.
MQTT_QUEUE_SIZE = 24
# IP NTP publico (Cloudflare); evita resolucao DNS bloqueante.
NTP_HOST = "162.159.200.1"

# Faixa para diagnostico de sinais baixos; faixa linear aproximada ate 0.95 V no ADC.
MQ135_ADC_ATTENUATION_DB = 0

# Perfil real por padrao; simulacao precisa ser identificada na telemetria.
MQ135_REFERENCE_IS_SIMULATION = False

# Limite somente para simulacao; a curva de referencia continua 10-300 ppm.
MQ135_SIMULATION_PPM_MAX = 1000.0
