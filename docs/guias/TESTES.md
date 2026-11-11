# Testes e evidências

## Casos de teste do projeto

| Caso | Procedimento | Resultado registrado | Evidência |
|---|---|---|---|
| CT01 — DHT22 | Observar a leitura durante uma variação de temperatura | Variação de 22,5 °C a 23,6 °C, seguida de redução | [Inicial](../evidencias/CT01/01-temperatura-inicial-DHT22.png) · [Pico](../evidencias/CT01/02-temperatura-pico-DHT22.png) |
| CT02 — Comunicação | Interromper e restabelecer a rede | Indicação de ausência de dados recentes e retomada após reconexão | [Online](../evidencias/CT02/03-dashboard-online-antes.png) · [Sem dados recentes](../evidencias/CT02/04-dashboard-sem-dados-recentes.png) |
| CT03 — Validação | Publicar mensagem com temperatura de 150 °C | Rejeição no backend e zero registros inválidos na consulta do teste | [Envio](../evidencias/CT03/01-envio-temperatura-150C.png) · [Backend](../evidencias/CT03/02-backend-rejeicao-150C.png) · [MySQL](../evidencias/CT03/03-mysql-zero-registros-invalidos.png) |
| CT04 — Localização | Consultar o cadastro da estação no mapa | Marcador exibido na região cadastrada para os testes | [Localização](../evidencias/CT04/01-localizacao-atual-aproximada.png) |

Os registros são de 8 de novembro de 2026. As gravações de dashboard e backend do CT02 correspondem a execuções separadas. Os vídeos integrais e a discussão dos resultados estão incorporados ao [relatório técnico](https://github.com/ChicooGuk/estacao-meteorologica/releases/download/entrega-2026-11-10/Documentacao_Estacao_Meteorologica_V5_atualizada.pdf).

## Verificações automatizadas

Os testes verificam validação das mensagens, tratamento dos sensores, persistência, comportamento da interface, localização e geometria. As verificações utilizam dados controlados e substitutos de hardware ou serviços quando necessário; os ensaios físicos são documentados separadamente pelos CTs.

Na raiz do repositório:

```powershell
.\.venv314\Scripts\python.exe -m pip install -r backend\requirements-test.txt
.\.venv314\Scripts\python.exe -m unittest discover -s tests -p test_pipeline.py
node --test tests/test_dashboard.cjs tests/test_location.cjs tests/test_locations.cjs tests/test_requirements.cjs tests/test_config.cjs
```

## Reprodução do CT03

Com broker e backend em execução e `backend/.env` configurado:

```powershell
.\.venv314\Scripts\python.exe tests/integracao/publicar_ct03.py
```

O programa pública uma mensagem identificada com temperatura de 150 °C. A confirmação MQTT indica recepção pelo broker; a rejeição é verificada no backend. O identificador exibido permite consultar a ausência do registro inválido no banco.

## Iniciador Cloudflare

Executar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/test_cloudflare.ps1` para verificar a extração de endereços, a geração de configuração e a identidade do processo. Esses testes não iniciam túnel nem publicam no Firebase. A verificação de rede real exige API, Cloudflare e Firebase em execução.
