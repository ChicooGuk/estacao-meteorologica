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

## Acesso público pelo Firebase e Cloudflare

O site continua em https://estacao-metedologica.web.app/. O Cloudflare encaminha as consultas HTTPS para a API do notebook; a ESP32 continua publicando no broker MQTT local. As limitações do Quick Tunnel estão descritas na [documentação oficial](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

1. Conectar o notebook e a ESP32 à rede configurada.
2. Confirmar MySQL e Mosquitto com `iniciar_servicos.bat`.
3. Iniciar `iniciar_backend.bat` e conferir `http://localhost:8000/`.
4. Executar `iniciar_cloudflare.bat`. O iniciador valida a API, cria ou reutiliza o túnel, atualiza a configuração pública e publica somente o Hosting no Firebase.
5. Aguardar a mensagem `SITE PUBLICO` e testar o site pelo celular com dados móveis.

O Firebase CLI deve estar instalado e autenticado previamente com `firebase login`. O iniciador não exibe as credenciais de login. Os domínios do Firebase precisam estar em `CORS_ORIGINS` no arquivo privado do backend.

Manter o notebook conectado, o backend e o iniciador Cloudflare abertos, e MySQL e Mosquitto em funcionamento. O endereço temporário da API muda ao criar um novo túnel: executar novamente o iniciador faz a republicação, mantendo o endereço do site Firebase. Outra execução enquanto o iniciador estiver ativo não cria um túnel duplicado.

Para encerrar o túnel, executar `encerrar_cloudflare.bat`; se iniciado em uma janela visível, também é possível usar Ctrl+C. O iniciador encerra somente o processo que criou. Uma instância reutilizada não é encerrada pelo segundo iniciador. O acesso local continua funcionando quando o túnel termina, desde que o backend esteja aberto.

Se a verificação pública ou a publicação falhar, a configuração anterior é preservada ou restaurada. As cópias de configuração e os registros ficam em `.estacao-local/cloudflare/`, fora do repositório. Corrigir a falha antes de anunciar o restabelecimento do acesso público.

Se o endereço `trycloudflare.com` não resolver, conferir o DNS da rede antes de publicar. O iniciador não altera o DNS do Windows. No notebook da apresentação, o ajuste de DNS deve ser autorizado pelo responsável; guardar a configuração anterior para restauração.

O Quick Tunnel é temporário e não possui garantia de disponibilidade. Fechar o notebook ou perder a conexão interrompe as atualizações públicas. Ele não transforma a instalação local em hospedagem permanente. O ngrok permanece como alternativa antiga e não é utilizado pelo fluxo atual.

## Recursos da interface

- Indicadores de temperatura, umidade, pressão, luminosidade e estimativa do MQ-135.
- Histórico, estatísticas e gráficos das leituras armazenadas.
- Exportação CSV e tabela paginada.
- Cadastro da estação no mapa, busca por CEP e cálculo de distância e vetor local.
- Comparação regional com dados externos de referência.
- Avisos associados à telemetria e demonstrações identificadas na interface.

As ações de limpar e restaurar a exibição alteram a visualização do histórico no navegador; os registros do MySQL são preservados. A edição da localização exige a chave administrativa da instalação.

Os campos do MQ-135 distinguem ADC bruto e PPM estimado. Durante os três minutos iniciais, o dashboard apresenta a indicação de aquecimento. Dados demonstrativos não são inseridos no banco como medições da estação.
