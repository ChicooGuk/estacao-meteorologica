import json
import os
import time
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

# Configuração privada já usada pelo backend.
load_dotenv(Path(__file__).resolve().parent / "backend" / ".env")

identificador = "ct03_150_" + str(int(time.time()))

payload = {
    "id_estacao": 1,
    "boot_id": identificador,
    "sequencia": 1,
    "uptime_ms": 1000,
    "temperatura": 150,
    "umidade": 50,
    "pressao": 930,
    "qualidade_ar": None,
    "luminosidade": 100,
    "estado_sensores": {}
}

cliente = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id=identificador
)

usuario = os.getenv("MQTT_USER")
if usuario:
    cliente.username_pw_set(
        usuario,
        os.getenv("MQTT_PASSWORD", "")
    )

try:
    cliente.connect(
        os.getenv("MQTT_HOST", "127.0.0.1"),
        int(os.getenv("MQTT_PORT", "1883")),
        30
    )
    cliente.loop_start()

    print("CT03 — envio de temperatura inválida")
    print(json.dumps(payload, indent=2, ensure_ascii=False))

    envio = cliente.publish(
        "estacoes/1/telemetria",
        json.dumps(payload),
        qos=1,
        retain=False
    )
    envio.wait_for_publish(timeout=10)

    if not envio.is_published():
        raise RuntimeError("O broker não confirmou o recebimento.")

    print("\nMensagem recebida pelo broker.")
    print("Confira a REJEIÇÃO no terminal do backend.")
    print("Confirmação MQTT não significa aceitação pelo backend.")
    print("\nIdentificador para consultar no banco:")
    print(identificador)

finally:
    cliente.disconnect()
    cliente.loop_stop()