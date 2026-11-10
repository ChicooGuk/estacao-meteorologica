# Auditoria do MQ-135 e da telemetria

Revisão de 22/10/2026. Escopo: código local, verificações anteriores por USB,
cinco mensagens reais do broker, MySQL, API local e API/dashboard publicados.
Nesta revisão nenhuma porta serial foi encontrada: não foi possível comparar
novamente o conteúdo atual da placa nem gravar as correções locais abaixo.

## Resultado observado

Cinco mensagens consecutivas do mesmo boot, sequências 90 a 94, foram capturadas
por um assinante MQTT independente, sem publicar dados de teste no sistema.
Os payloads completos recebidos foram iguais aos armazenados em MySQL. O ADC
exposto na API também foi igual ao ADC de cada mensagem.

| Sequência | MQTT: ADC bruto | MySQL: ADC bruto | API: ADC bruto |
|---|---:|---:|---:|
| 90 | 1977,375 | 1977,375 | 1977,375 |
| 91 | 1984,375 | 1984,375 | 1984,375 |
| 92 | 1972,625 | 1972,625 | 1972,625 |
| 93 | 1974,5 | 1974,5 | 1974,5 |
| 94 | 1973,75 | 1973,75 | 1973,75 |

As cinco mensagens informavam atraso de envio de 43 ms e contador de descartes
zero. Isso não mede a latência total até o navegador nem garante ausência de
perdas fora da janela observada. A API pública respondeu com estação ativa e
ADC não nulo. HTML e JavaScript publicados incluíam a exibição do ADC bruto.

A última montagem informada pelo usuário estava em teste com 3,3 V da fonte
na entrada do divisor 20/20 kΩ, com AO desconectado. Esses dados comprovam
transporte e resposta da entrada, não o funcionamento do MQ-135.

## Revisão de cada etapa

1. `firmware/main.py`: somente a inicialização do MQ usa GPIO35; LDR usa GPIO34,
   DHT22 usa GPIO4 e BMP280 usa GPIO21/22. O MQ faz média de oito leituras de
   `ADC.read()` e salva o resultado em `adc_bruto.qualidade_ar` antes dos
   bloqueios por aquecimento, habilitação ou R0. Esses bloqueios retornam
   `qualidade_ar = null`, sem zerar o ADC bruto.
2. A aquisição gera uma cópia do dicionário de ADC para cada amostra. A fila é
   limitada e registra descartes; MQTT publica o JSON com QoS 1 e espera PUBACK.
   PUBACK confirma recebimento pelo broker, não gravação no banco. O backend
   confirma sua própria entrega depois de persistir e deduplica boot/sequência.
3. `backend/python.py`: valida o JSON; filtros e médias atuam nos campos de
   medição. O ADC bruto permanece no payload original salvo no MySQL. Não há
   transformação de ADC em ppm no backend.
4. A API recupera `adc_bruto` do payload e o inclui em cada registro recente.
5. O dashboard lê a amostra mais recente e apresenta ADC em elemento próprio,
   separado de ppm. O valor exibido é arredondado para inteiro; zero é preservado
   como diagnóstico e não convertido em concentração. O gráfico e a comparação
   de gases continuam usando ppm, não ADC. Aquecimento não impede exibir bruto.

## Problemas encontrados e correções locais

- **Divisor desatualizado:** configuração privada local e exemplo ainda usavam
  40/20 kΩ. Foram atualizados para a última montagem informada, 20/20 kΩ. O erro
  afetaria a reconstrução da tensão e a futura estimativa em ppm; não explica
  ADC bruto zero. Calibração continua desabilitada, R0 e RL continuam ausentes.
- **Bruto antigo após erro:** a função preservava o último bruto se uma nova
  leitura lançasse exceção. Agora limpa o campo para `None` no início de cada
  coleta. Adicionado teste para leitura bem-sucedida seguida de falha.
- **Truncamento de Rs/R0:** removido o piso artificial de 0,1 antes da curva.
  Parâmetros do circuito agora também rejeitam NaN e infinito. A curva continua
  desabilitada no uso real, aguardando calibração.
- **Limitações de ppm:** os coeficientes empíricos 110,47 e -2,862 e a janela
  300–3500 ppm são legados do projeto; não são uma calibração universal nem
  identificação seletiva de gás. Documentação e comentários foram corrigidos.
- **Aquecimento:** três minutos são apenas temporizador operacional. O manual
  do fabricante estabelece condicionamento inicial superior a 48 horas nas
  condições de teste. Terminar o temporizador não comprova estabilidade.

## Conflito com Wi-Fi e interpretação do zero

GPIO35 pertence ao ADC1. A restrição de uso simultâneo com Wi-Fi documentada
pela Espressif refere-se ao ADC2. Não foi identificado conflito de pinagem no
código revisado. O LDR compartilha a unidade ADC1, mas usa outro canal.

Zero bruto não prova tensão física exatamente zero: o ADC tem faixa útil
limitada, sobretudo no extremo inferior. Em verificações anteriores pelo USB,
o canal retornou zero também em 0 dB. As leituras mínimas de `read_uv()` com
ADC bruto zero não devem ser tratadas como medidas confiáveis de AO.

O fato de a entrada responder à fonte pelo divisor e retornar zero com AO
localiza a investigação no sinal anterior à leitura: alimentação real do
módulo, AO, contatos e condicionamento. Não identifica sozinho qual componente
falhou nem comprova que o sensor esteja danificado.

## Validação e pendências

- 26 testes Python aprovados, incluindo ambos os divisores e falha de ADC.
- Testes JavaScript de dashboard e localização aprovados. Eles verificam que
  ADC zero e ADC não zero aparecem no diagnóstico sem serem convertidos em ppm.
- Verificação ao vivo de cinco mensagens, banco e API aprovada.
- Verificação dos arquivos publicados e da API pública aprovada.
- Ainda falta conectar USB para comparar e atualizar o firmware/configuração
  efetivamente gravados. Não houve gravação nesta auditoria.
- Ainda falta confirmar se a entrada atual é 3,3 V de teste ou AO e medir VCC,
  AO e ponto do ADC com instrumento adequado. Não habilitar ppm sem RL/R0 e
  referência compatível com a curva escolhida.

## Atualização após conexão USB

O usuário confirmou retorno de AO à entrada do divisor e conectou USB. Foi
encontrada COM4. A leitura dos arquivos confirmou cliente MQTT igual ao local
e configuração gravada ainda em 40/20 kΩ. Foram feitos backups privados,
gravados `main.py` e `config.py` atualizados, e ambos foram relidos com igualdade
byte a byte. Após reinício, a placa confirmou 20/20 kΩ e ppm desabilitado.
Doze leituras diretas de GPIO35 com AO conectado continuaram em zero.
Isso confirma que a configuração antiga de ppm não era a causa do ADC bruto zero.

## Referências técnicas

Atualização de montagem: depois da auditoria, o usuário confirmou retorno aos
três resistores de 20 kΩ em série. A configuração voltou a 40/20 kΩ na placa,
no arquivo privado local, no exemplo e no README. Foi conferida por releitura
e importação após reinício; ppm permanece desabilitado. Os resultados anteriores
com 20/20 kΩ acima são registros dos testes daquela montagem, não a atual.

- [Espressif: ADC, canais, atenuação e restrições de Wi-Fi](https://docs.espressif.com/projects/esp-idf/en/v4.4.1/esp32/api-reference/peripherals/adc.html).
- [Winsen: manual do MQ135, alimentação, circuito, Rs e condicionamento](https://www.winsen-sensor.com/manual/mq135.html).

## Identificacao de RL em 26/10/2026

O usuario confirmou por inspecao das trilhas que o resistor 102 central e RL.
Valor nominal configurado: 1 kOhm. Confirmacao por inspecao do usuario; nao
representa medicao independente do valor pelo software ou afericao do modulo.
R0 continua pendente, e a conversao para ppm permanece desabilitada.

## Comparacao com firmware original em 26/10/2026

Backup original de 21/10: criava R0 = Rs/0.637 na primeira leitura, de modo
que a primeira concentracao calculada era aproximadamente 401.60 ppm por
construcao. Impunha piso de 300 ppm, teto de 3500 ppm e retornava 2500 ppm
fixos quando classificava o ADC como saturado. Assumia alimentacao de 3.3 V
e RL de 10 kOhm. Esses valores nao comprovavam calibracao nem concentracao.

Nova releitura da COM4: main.py e config.py identicos byte a byte aos locais,
RL = 1 kOhm, divisor = 40/20 kOhm, conversao desabilitada. Doze leituras diretas
em 11 dB e doze em 0 dB retornaram zero. Atenuacao original restaurada e placa
reiniciada. Nao houve alteracao de firmware nesta verificacao.

O divisor reduz a tensao aplicada ao ADC a um terco; nao reduz por si so a
sensibilidade quimica do sensor. Com RL de 1 kOhm e divisor total de 60 kOhm,
a carga efetiva ideal e 0.9836 kOhm. A principal reducao na entrada ADC e a
razao 1/3. Ainda nao foi aferida a tensao analogica de AO com resolucao adequada.
