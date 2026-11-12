# Diagnóstico da atualização pública

## Coleta no cliente externo

1. Com os serviços e o túnel ativos, abrir [a página de diagnóstico](https://estacao-metedologica.web.app/diagnostico.html) em outro computador conectado à internet.
2. Selecionar 15 minutos, clicar em **Iniciar teste** e manter a página visível. Não minimizar nem trocar de aba durante a coleta.
3. Ao terminar, clicar em **Baixar resultado** e preservar o JSON original. A página não envia os resultados automaticamente ao backend.
4. Anotar a conexão utilizada e informar qualquer interrupção de rede ou ocultação da página. Os eventos de visibilidade também constam no arquivo.

A página consulta a saúde da API e a telemetria a cada cinco segundos, com requisições identificadas. Registra separadamente a chegada dos cabeçalhos, a conclusão do JSON, os erros e a leitura mais recente. Não possui controles administrativos nem grava medições no banco.

## Correlação dos registros

A API devolve `X-Request-ID` e `Server-Timing`. As duas origens autorizadas do Firebase podem consultar esses cabeçalhos. O identificador `diag_id`, quando válido, permite relacionar uma requisição aos registros do aplicativo. Ele serve apenas à correlação e não constitui autenticação.

O backend registra o início da consulta, a preparação dos cabeçalhos e a conclusão do processamento, incluindo o total de bytes e a confirmação de que o último bloco foi entregue à camada ASGI. Essa entrega não prova a recepção pelo navegador. O evento de conclusão do JSON no cliente é necessário para medir o transporte completo.

`GET /api/saude` retorna somente o estado do serviço e o horário UTC do servidor, sem consulta ao MySQL. A rota permite separar a conectividade da execução de consultas ao banco. As operações de escrita continuam sujeitas às proteções existentes.

A diferença aproximada entre os relógios é calculada pela página de diagnóstico usando o horário da API e o ponto médio da requisição. A metade do tempo de resposta representa uma estimativa da incerteza de rede, não uma garantia de simetria. A duração de cada consulta utiliza o relógio monotônico do próprio cliente.

## Interpretação

Uma consulta HTTP 200, um túnel ativo ou um tempo curto de SQL não comprovam, isoladamente, a atualização dos cartões. Correlacionar MQTT, resposta local completa, resposta pública completa, JSON e exibição dos valores. Consultas canceladas e intervalos sem nova leitura devem integrar o resultado.

O intervalo entre dois registros exibidos difere da latência de uma leitura específica. A interface consulta a amostra mais recente e pode não exibir cada mensagem MQTT individualmente. A avaliação desde o envio da ESP32 permanece estimada enquanto o relógio e o instante de envio da placa não forem aferidos com precisão suficiente.

Métricas e registros do túnel permanecem locais. A referência de monitoramento é a [documentação de observabilidade do Cloudflare](https://developers.cloudflare.com/tunnel/observability/). A configuração de transporte deve ser conferida na [documentação de configuração](https://developers.cloudflare.com/tunnel/configuration/), distinguindo o protocolo do navegador do protocolo entre o conector e a borda.
