# Varredura do MQ-135 — 29/10/2026

Revisados: coleta e publicação MQTT, persistência, endpoint de histórico, configuração pública da API, atualização periódica, diagnóstico bruto e tratamento de perda de conexão.

## Evidência ao vivo

Cinco mensagens consecutivas (sequências 28–32) foram acompanhadas no broker, banco e API. Payload completo recebido e persistido idêntico; ADC bruto do MQ-135 igual a zero nos três pontos; contador de descartes igual a zero. A estação estava ativa. Evidência local: `.estacao-local/dashboard-audit-2026-10-29.json`.

A API pública respondeu HTTP 200 e autorizou a origem Firebase pelo cabeçalho CORS. O endereço em config.js publicado corresponde ao túnel ativo. Essa captura não indica perda do sinal entre MQTT, banco e API e não determina a causa física do zero.

## Correções

O dashboard arredondava médias fracionárias de ADC para inteiros, exibindo zero para valores como 0,125. Agora preserva até três casas decimais. Quando a estação para de enviar ou a consulta falha, o diagnóstico bruto mantém o último valor e informa que está sem atualização. Ausência de leitura continua distinta de zero; ADC não é apresentado como ppm.

Testes de dashboard incluem sinal fracionário, dados antigos e queda de conexão. As suítes Python e de localização também passaram. Nenhuma gravação na ESP32 foi feita nesta varredura. PPM continua dependente da configuração e calibração; a correção da interface não realiza calibração.
