"""Validacao temporal e medias moveis da telemetria, sem acesso ao banco."""
from statistics import median

FIELDS = ("temperatura", "umidade", "pressao", "qualidade_ar", "luminosidade")
# Limiares do filtro temporal, nas unidades de cada grandeza.
JUMPS = {"temperatura": 10, "umidade": 25, "pressao": 20,
         "qualidade_ar": 1500, "luminosidade": 10000}


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


def referencias_validas(anteriores):
    """Nao reutiliza outliers rejeitados como referencia do proximo filtro."""
    return [{k: None if r['qualidade'].get(k) else r['payload'].get(k)
             for k in FIELDS} for r in anteriores]


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
