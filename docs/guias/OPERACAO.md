# Operação

## Inicialização no Windows

1. Conectar o computador e a ESP32 à rede configurada.
2. Executar `iniciar_servicos.bat` para verificar MySQL e Mosquitto.
3. Executar `iniciar_backend.bat` e acompanhar a inicialização da API e da assinatura MQTT.
4. Ligar a estação e acessar `http://localhost:8000/`.

Os atalhos pressupõem a instalação e a configuração dos respectivos serviços. A execução manual do backend, a partir da raiz do projeto, é:

```powershell
.\.venv314\Scripts\python.exe -m uvicorn python:app --app-dir backend --env-file backend\.env --host 0.0.0.0 --port 8000
```

| Recurso | Endereço local |
|---|---|
| Dashboard | `http://localhost:8000/` |
| Documentação da API | `http://localhost:8000/docs` |
| Leituras recentes | `http://localhost:8000/api/leituras/ultimas-24h?id_estacao=1` |

## Acesso pela hospedagem web

O frontend é publicado no Firebase Hosting. Para receber dados fora da rede local, a API precisa de um endereço HTTPS acessível, configurado em `dashboard/config.js` e autorizado em `CORS_ORIGINS`.

Os atalhos `iniciar_ngrok.bat` e `iniciar_cloudflare.bat` oferecem alternativas de encaminhamento da API, com o cliente correspondente instalado e configurado. A comunicação da placa com o broker MQTT permanece na rede local. O computador que executa o backend, o banco e o broker precisa permanecer ligado durante a coleta.

Com Firebase CLI instalado e conta autorizada, a publicação da interface utiliza:

```powershell
firebase deploy --only hosting --project estacao-metedologica
```

## Recursos da interface

- Indicadores de temperatura, umidade, pressão, luminosidade e estimativa do MQ-135.
- Histórico, estatísticas e gráficos das leituras armazenadas.
- Exportação CSV e tabela paginada.
- Cadastro da estação no mapa, busca por CEP e cálculo de distância e vetor local.
- Comparação regional com dados externos de referência.
- Avisos associados à telemetria e demonstrações identificadas na interface.

As ações de limpar e restaurar a exibição alteram a visualização do histórico no navegador; os registros do MySQL são preservados. A edição da localização exige a chave administrativa da instalação.

Os campos do MQ-135 distinguem ADC bruto e PPM estimado. Durante os três minutos iniciais, o dashboard apresenta a indicação de aquecimento. Dados demonstrativos não são inseridos no banco como medições da estação.
