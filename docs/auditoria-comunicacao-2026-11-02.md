# Revisão de continuidade e comunicação — 02/11/2026

Escopo: aquisição, ADC e conversão MQ-135, barramento BMP280, recuperação de sensores, tarefas assíncronas, reconexão Wi-Fi/MQTT, fila e descarte, PUBACK, validação/persistência, seleção de histórico, atualização e estado visual do dashboard. Não constitui garantia de ausência de defeitos ou validação metrológica dos sensores.

## Falhas e riscos corrigidos

1. A recuperação do BMP280 fazia scan completo do barramento. Sem alimentação dos sensores, observamos pausas de 12–14 s no uptime entre amostras, não apenas atrasos no navegador. Agora são sondados somente 0x76/0x77. O timeout I2C foi ajustado para 20 ms: limita falhas e deixa margem para a leitura de 24 bytes de coeficientes em 100 kHz; o valor anterior de 2 ms era curto para uma transação desse tamanho.
2. Uma exceção não tratada em uma tarefa de Wi-Fi ou comunicação poderia encerrá-la enquanto o loop principal continuava dormindo. As tarefas agora são supervisionadas e reiniciadas individualmente após 2 s. Cancelamento é propagado, sem reiniciar tarefa que está sendo encerrada intencionalmente.
3. O contador de sequência permanece no contexto do boot, inclusive se a aquisição for recuperada. Evita reapresentar sequência 1 no mesmo boot e sofrer deduplicação/rejeição pelo banco.
4. MQTT.close podia manter estado quebrado se writer.close levantasse erro. O estado agora é liberado primeiro e o fechamento tem tratamento e prazo. Falhas de publicação continuam preservando a amostra na fila.
5. Corrigidas anteriormente mensagens concorrentes no card MQ135, sobrescrita de ppm numérico por estado de faixa, status offline por pequeno adiantamento do relógio e interpolação repetida do gráfico.

## Verificação

41 testes Python passaram, incluindo vetor de compensação BMP280, sondagem dos dois endereços sem scan, recuperação, sequência, fila limitada, falha MQTT, persistência, relógio e conversão. Testes JavaScript do dashboard e localização também passaram. Firmware main.py e mqtt_async.py relidos da COM4 e comparados byte a byte. No trecho posterior à gravação: 21 amostras do novo boot, intervalo máximo 2,642 s, zero descartes informados e API ativa. É uma validação curta de continuidade, não um ensaio prolongado de alimentação.

Header desktop: position sticky a partir de 1024 px, fundo opaco e prioridade sobre o mapa. Verificado em viewport de 1280 px: depois de rolar 947 px, o topo do header permaneceu em 0. CSS publicado conferido com arquivo local.

## PPM abaixo de 10

A leitura usa tensão estimada com read_uv(), não ADC como ppm. Na consulta desta revisão, cerca de 160 ADC e 0,112 V resultaram abaixo de 10 pela curva de álcool. O card <10 é coerente com os parâmetros escolhidos; não se aumenta o número por apresentação. A alimentação 4,90 V e R0 provisório de 6,11477572 kOhm continuam hipóteses documentadas em estimativa-alcool-mq135.md. Nenhum valor abaixo ou acima de 10–300 ppm é extrapolado numericamente no card.

## Limites e próximos ensaios

A instabilidade física entre fontes ainda precisa ser medida; software não prova tensão de alimentação nem integridade de jumpers. A fila em RAM é limitada e pode descartar após perda prolongada de rede; o contador permanece explícito. A supervisão recupera exceções, mas não interrompe uma chamada síncrona que nunca retorna; as operações I2C agora têm prazo limitado. A recuperação do BMP280 energizado deve ser validada na montagem completa. Manter acompanhamento contínuo após a apresentação não é substituído por estes testes.
