import json
import logging
import os
import time
import asyncio
import secrets
import hashlib
from threading import Event
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime
from statistics import median

import mysql.connector
from mysql.connector.pooling import MySQLConnectionPool
import paho.mqtt.client as mqtt
from fastapi import FastAPI, HTTPException, Query, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict, ValidationError
from pathlib import Path

log = logging.getLogger("estacao")
if not log.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [ESTACAO] %(message)s"))
    log.addHandler(handler)
log.setLevel(logging.INFO)
log.propagate = False
pool = None
reiniciar_mqtt = Event()
FIELDS = ("temperatura", "umidade", "pressao", "qualidade_ar", "luminosidade")
# Limiares demonstrativos, nas unidades dos campos; conferir em bancada.
JUMPS = {"temperatura": 10, "umidade": 25, "pressao": 20,
         "qualidade_ar": 1500, "luminosidade": 10000}


class TelemetriaSchema(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    id_estacao: int = Field(gt=0)
    boot_id: str = Field(min_length=1, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    sequencia: int = Field(ge=1)
    uptime_ms: int = Field(ge=0)
    temperatura: float | None = Field(ge=-40, le=80)
    umidade: float | None = Field(ge=0, le=100)
    pressao: float | None = Field(ge=300, le=1200)
    qualidade_ar: float | None = Field(ge=0, le=10000)
    luminosidade: float | None = Field(ge=0, le=100000)
    origem_temperatura: str | None = Field(default=None, max_length=16)
    estado_sensores: dict[str, str] = Field(default_factory=dict, max_length=5)


def filtrar(dados, anteriores):
    valores = {k: getattr(dados, k) for k in FIELDS}
    flags = {}
    for k in FIELDS:
        janela = [r[k] for r in anteriores if isinstance(r.get(k), (int, float))]
        if valores[k] is None:
            flags[k] = "indisponivel"
        elif len(janela) >= 3:
            centro = median(janela)
            mad = median([abs(v - centro) for v in janela])
            if abs(valores[k] - centro) > max(JUMPS[k], 6 * mad):
                valores[k] = None
                flags[k] = "outlier_temporal"
    return valores, flags


def media_movel(valores, anteriores):
    """Media de ate 5 amostras validas, sem preencher falhas com dados antigos.

    Suaviza temperatura, umidade e pressao. Ar e luminosidade conservam picos.
    Os registros anteriores estao ordenados do mais recente ao mais antigo.
    Usar payload original evita calcular uma media de medias recursiva.
    """
    saida = valores.copy()
    for campo in ("temperatura", "umidade", "pressao"):
        if valores[campo] is None:
            continue
        janela = [valores[campo]]
        for registro in anteriores[:4]:
            valor = registro["payload"].get(campo)
            if isinstance(valor, (int, float)) and not registro["qualidade"].get(campo):
                janela.append(valor)
        saida[campo] = round(sum(janela) / len(janela), 2)
    return saida


@contextmanager
def conexao():
    if pool is None:
        raise RuntimeError("Banco nao inicializado")
    conn = pool.get_connection()
    try:
        yield conn
    finally:
        conn.close()


class CursorMedido:
    """Registra tempo de execute + leitura dos resultados, sem valores ou SQL nos logs."""
    def __init__(self, cursor):
        self.cursor = cursor
        self.inicio = None

    def concluir(self):
        if self.inicio is not None:
            log.info("SQL consulta=%s duracao_ms=%.2f", self.identificador,
                     (time.perf_counter() - self.inicio) * 1000)
            self.inicio = None

    def execute(self, sql, params):
        self.inicio = time.perf_counter()
        self.identificador = hashlib.sha256(sql.encode()).hexdigest()[:8]
        try:
            result = self.cursor.execute(sql, params)
            if not self.cursor.with_rows:
                self.concluir()
            return result
        except Exception:
            self.concluir()
            raise

    def fetchone(self):
        try:
            return self.cursor.fetchone()
        finally:
            self.concluir()

    def fetchall(self):
        try:
            return self.cursor.fetchall()
        finally:
            self.concluir()

    def close(self):
        self.concluir()
        self.cursor.close()


def persistir(dados):
    inicio = time.monotonic()
    with conexao() as conn:
        cur = CursorMedido(conn.cursor(dictionary=True))
        try:
            # Serializa ingestao por estacao; nao usa uma conexao global compartilhada.
            cur.execute("SELECT id_estacao FROM estacao WHERE id_estacao=%s FOR UPDATE", (dados.id_estacao,))
            if not cur.fetchone():
                raise ValueError("Estacao nao cadastrada")
            cur.execute("SELECT id_leitura FROM leitura WHERE id_estacao=%s AND boot_id=%s AND sequencia=%s",
                        (dados.id_estacao, dados.boot_id, dados.sequencia))
            if cur.fetchone():
                conn.rollback()
                return {"status": "duplicada"}
            cur.execute("SELECT sequencia FROM leitura WHERE id_estacao=%s AND boot_id=%s ORDER BY sequencia DESC LIMIT 1",
                        (dados.id_estacao, dados.boot_id))
            anterior = cur.fetchone()
            if anterior and dados.sequencia <= anterior["sequencia"]:
                raise ValueError("Sequencia fora de ordem")
            cur.execute("SELECT payload, qualidade FROM leitura WHERE id_estacao=%s AND boot_id=%s AND data_hora >= UTC_TIMESTAMP() - INTERVAL 30 SECOND ORDER BY id_leitura DESC LIMIT 5", (dados.id_estacao, dados.boot_id))
            anteriores = []
            for r in cur.fetchall():
                if not r["payload"]:
                    continue
                anteriores.append({
                    "payload": json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"],
                    "qualidade": (json.loads(r["qualidade"]) if isinstance(r["qualidade"], str) else r["qualidade"]) or {}
                })
            valores, flags = filtrar(dados, [r["payload"] for r in anteriores])
            valores = media_movel(valores, anteriores)
            cur.execute("""INSERT INTO leitura
                (id_estacao, temperatura, umidade, pressao, qualidade_ar, luminosidade,
                 boot_id, sequencia, payload, qualidade, data_hora)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,UTC_TIMESTAMP())""",
                (dados.id_estacao, *(valores[k] for k in FIELDS), dados.boot_id,
                 dados.sequencia, dados.model_dump_json(), json.dumps(flags)))
            conn.commit()
            log.info("Telemetria persistida estacao=%s seq=%s duracao_ms=%.1f filtros=%s",
                     dados.id_estacao, dados.sequencia, (time.monotonic()-inicio)*1000, flags)
            return {"status": "sucesso", "filtros": flags}
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        result, _ = client.subscribe("estacoes/+/telemetria", qos=1)
        if result != mqtt.MQTT_ERR_SUCCESS:
            log.error("Falha ao solicitar assinatura MQTT: %s", result)
        else:
            log.info("MQTT conectado; assinatura solicitada: estacoes/+/telemetria")
    else:
        log.error("MQTT conexao recusada: %s", reason_code)


def on_message(client, userdata, message):
    try:
        if message.retain:
            log.warning("Mensagem retida ignorada: %s", message.topic)
            client.ack(message.mid, message.qos)
            return
        if len(message.payload) > 8192:
            raise ValueError("Payload excede 8192 bytes")
        dados = TelemetriaSchema.model_validate_json(message.payload)
        if message.topic != f"estacoes/{dados.id_estacao}/telemetria":
            raise ValueError("Topico diverge da estacao")
        log.info("MQTT recebido estacao=%s seq=%s", dados.id_estacao, dados.sequencia)
        persistir(dados)
        client.ack(message.mid, message.qos)
    except (ValidationError, ValueError) as exc:
        log.warning("Telemetria rejeitada: %s", exc)
        client.ack(message.mid, message.qos)
    except Exception:
        log.exception("Persistencia MQTT falhou; mensagem sem confirmacao")
        # Obriga nova sessao para reentrega QoS1 pelo broker (sessao persistente).
        reiniciar_mqtt.set()


async def recuperar_mqtt(client):
    while True:
        await asyncio.sleep(1)
        if reiniciar_mqtt.is_set():
            reiniciar_mqtt.clear()
            # Reiniciar o loop fora do callback para nao aguardar a propria thread.
            def reiniciar():
                client.disconnect()
                client.loop_stop()
                client.connect_async(os.getenv("MQTT_HOST", "127.0.0.1"),
                                     int(os.getenv("MQTT_PORT", "1883")), 30)
                client.loop_start()
            try:
                await asyncio.to_thread(reiniciar)
            except Exception:
                log.exception("Falha ao reiniciar MQTT; nova tentativa em 1 segundo")
                reiniciar_mqtt.set()


@asynccontextmanager
async def lifespan(app):
    global pool
    pool = MySQLConnectionPool(pool_name="estacao", pool_size=5,
        host=os.getenv("DB_HOST", "127.0.0.1"), port=int(os.getenv("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
        database=os.getenv("DB_NAME", "estacao_meteorologica"),
        connection_timeout=3, time_zone="+00:00")
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                         client_id=os.getenv("MQTT_CLIENT_ID", "estacao-backend"),
                         clean_session=False, manual_ack=True)
    if os.getenv("MQTT_USER"):
        client.username_pw_set(os.environ["MQTT_USER"], os.getenv("MQTT_PASSWORD", ""))
    client.on_connect, client.on_message = on_connect, on_message
    client.reconnect_delay_set(1, 30)
    client.connect_async(os.getenv("MQTT_HOST", "127.0.0.1"), int(os.getenv("MQTT_PORT", "1883")), 30)
    client.loop_start()
    recuperacao = asyncio.create_task(recuperar_mqtt(client))
    app.state.mqtt = client
    try:
        yield
    finally:
        recuperacao.cancel()
        try:
            await recuperacao
        except asyncio.CancelledError:
            pass
        client.disconnect()
        client.loop_stop()
        pool = None


app = FastAPI(title="Estacao Meteorologica", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
    allow_origins=[s for s in os.getenv("CORS_ORIGINS", "http://localhost:5500").split(",") if s],
    allow_methods=["GET", "POST"], allow_headers=["Content-Type", "ngrok-skip-browser-warning"],
    max_age=3600)


@app.middleware("http")
async def medir_api(request, call_next):
    inicio = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["Server-Timing"] = "api;dur=%.2f" % ((time.perf_counter() - inicio) * 1000)
        return response
    finally:
        if request.url.path.startswith("/api/"):
            log.info("API metodo=%s rota=%s status=%s duracao_ms=%.2f",
                     request.method, request.url.path, status_code,
                     (time.perf_counter() - inicio) * 1000)


def autorizar_ingestao(authorization: str | None = Header(default=None)):
    # MQTT e o fluxo principal. Ingestao HTTP fica desligada sem token privado.
    token = os.getenv("HTTP_INGEST_TOKEN", "")
    if not token:
        raise HTTPException(404, "Ingestao HTTP desabilitada")
    esperado = ("Bearer " + token).encode()
    if not secrets.compare_digest((authorization or "").encode(), esperado):
        raise HTTPException(401, "Autenticacao necessaria", headers={"WWW-Authenticate": "Bearer"})


@app.post("/api/leituras", status_code=201, dependencies=[Depends(autorizar_ingestao)])
def receber_leituras(dados: TelemetriaSchema):
    try:
        return persistir(dados)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        log.exception("Falha na ingestao HTTP")
        raise HTTPException(503, "Persistencia indisponivel") from exc


@app.get("/api/leituras/ultimas-24h")
def obter_ultimas_leituras(id_estacao: int = Query(default=1, gt=0)):
    try:
        with conexao() as conn:
            cur = CursorMedido(conn.cursor(dictionary=True))
            try:
                cur.execute("SELECT id_estacao, latitude, longitude, descricao FROM estacao WHERE id_estacao=%s", (id_estacao,))
                estacao = cur.fetchone()
                if not estacao:
                    raise HTTPException(404, "Estacao nao cadastrada")
                cur.execute("""SELECT id_leitura, temperatura, umidade, pressao, qualidade_ar,
                    luminosidade, data_hora, qualidade, payload FROM leitura
                    WHERE id_estacao=%s AND data_hora >= UTC_TIMESTAMP() - INTERVAL 1 DAY
                    ORDER BY id_leitura DESC LIMIT 50""", (id_estacao,))
                historico = cur.fetchall()
                for r in historico:
                    meta = r.pop("payload") or {}
                    if isinstance(meta, str):
                        meta = json.loads(meta)
                    r["estado_sensores"] = meta.get("estado_sensores", {})
                    r["origem_temperatura"] = meta.get("origem_temperatura")
                    if isinstance(r["qualidade"], str):
                        r["qualidade"] = json.loads(r["qualidade"])
                    # Alertas usam a amostra valida original, sem atenuacao da media.
                    r["valores_alerta"] = {
                        k: None if (r["qualidade"] or {}).get(k) else meta.get(k, r[k])
                        for k in FIELDS
                    }
                    r["data_hora"] = r["data_hora"].isoformat() + "Z"
                cur.execute("""SELECT MAX(temperatura) temp_max, MIN(temperatura) temp_min,
                    AVG(umidade) umid_media, MAX(qualidade_ar) air_max, AVG(pressao) press_media
                    FROM leitura WHERE id_estacao=%s AND data_hora >= UTC_TIMESTAMP() - INTERVAL 1 DAY""", (id_estacao,))
                stats = cur.fetchone()
                ativo = bool(historico and (datetime.now().timestamp() - datetime.fromisoformat(historico[0]["data_hora"]).timestamp()) <= 10)
                return {"estacao": estacao, "esp32_ativo": ativo,
                        "historico": historico, "estatisticas_24h": stats}
            finally:
                cur.close()
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Falha na consulta")
        raise HTTPException(503, "Historico indisponivel") from exc


# Servir dashboard e API na mesma origem evita configuracao extra e mixed content.
app.mount("/", StaticFiles(directory=Path(__file__).resolve().parents[1] / "dashboard", html=True), name="dashboard")
