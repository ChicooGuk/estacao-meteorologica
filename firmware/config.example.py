# Copie como config.py no ESP32 e preencha apenas na copia privada.
WIFI_SSID = "SUA_REDE"
WIFI_PASS = "SUA_SENHA"
# Use IP do computador/broker na LAN para evitar DNS bloqueante no MicroPython.
MQTT_HOST = "192.168.1.10"
MQTT_PORT = 1883
MQTT_USER = ""
MQTT_PASSWORD = ""
STATION_ID = 1
SAMPLE_INTERVAL_MS = 2500
HTTP_DIAGNOSTICS = False
# Aquecimento inicial demonstrativo; seguir o fabricante do modulo real.
MQ135_WARMUP_MS = 180000
# Habilitar somente apos conferir circuito e baseline em ambiente de referencia.
MQ135_CALIBRATION_ENABLED = False
