# Comparação com os novos documentos

Revisão estática em 08/11/2026. Não constitui ensaio elétrico, teste de latência ou validação metrológica. Nenhuma mudança operacional foi aplicada nesta revisão.

Fontes: DECLARACAO DE IA.docx, Roteiro Orientador para o Projeto Integrador-2.docx e manual_de_normalizacao_abnt.pdf, em Downloads. Comparação com firmware, backend, dashboard, SQL e evidências locais.

## Implementado

- RF01: aquisição programada de 2,5 segundos no firmware.
- RF02: Wi-Fi/MQTT QoS 1, Mosquitto e subscriber Python, com persistência no MySQL.
- RF03: mapa com coordenadas cadastradas e marcador.
- RNF01: regras responsivas no CSS; funcionamento em dispositivos ainda requer evidência.
- RNF03: limites Pydantic e filtros temporais. Temperatura de 150 °C deve ser rejeitada pela validação, mas precisa de teste registrado.
- Banco: estação/leitura com PK, FK, índice temporal, boot/sequência e JSON original. Valores tratados e flags preservados.
- Dashboard: indicadores, histórico, gráficos, avisos e prévias identificadas.

## Parcial ou pendente

- Dashboard público: o Firebase mantém a página, mas a API configurada depende do ngrok, que ficou sem banda. localhost atende somente ao uso local. Restaurar uma API pública acessível para cumprir o acesso público completo.
- RNF02: consulta periódica de 2,5 segundos não comprova latência total inferior a 5 segundos. Medir envio, persistência e exibição sob as condições reais.
- Geometria Analítica: marcador implementado. Não foi localizado cálculo explícito de vetor de posição e distância no frontend, exigido pelo roteiro.
- RF04: avisos implementados, porém 150 PPM é um limiar escolhido de acompanhamento, não limite crítico validado. Não afirmar detecção de risco ou identificação de gás.
- MQ-135: R0 escolhido a partir de referência virtual de 0,045 V. Desligar modo de teste não transforma essa referência em calibração. Resultados abaixo de 10 extrapolam a faixa declarada do modelo. Aquecimento de três minutos é uma espera operacional, não validação de estabilidade.
- Hardware: divisor documentado 10/20 kΩ e GPIO35. Para AO=5 V, entrada nominal de 3,33 V: há pouca margem elétrica. Atestar segurança exige verificar circuito, tolerâncias e tensão. ADC em 0 dB satura antes do limite elétrico do GPIO.
- DHT22 de quatro pinos sem módulo: verificar pull-up externo de dados; fotos disponíveis não permitem confirmar sua presença. BMP280 e LDR são módulos, cujos componentes devem constar no esquema.
- Esquema formal completo Fritzing/Tinkercad/Wokwi não localizado entre os materiais revisados.
- DDL atual usa FLOAT para PPM e luminosidade, enquanto o modelo sugerido usa INT. Justificar decimais. Não há CHECKs explícitos de intervalos de sensores no DDL, embora haja validação na aplicação.
- Gestão: registrar papéis, backlog, sprints e planejado versus executado conforme ocorreu, sem criar retrospectivamente atividades inexistentes.
- DER formal, BOM detalhada, apêndices comentados e relatório consolidado precisam de revisão.
- Pluviômetro: novo roteiro contém inconsistência, com quatro sensores na metodologia e cinco nos resultados. Preservar a dispensa explícita registrada no correcoes.md e explicar no escopo.

## Testes definidos explicitamente no novo roteiro

1. CT01: variar temperatura do DHT22 e observar leitura no monitor serial sem erro. O firmware prioriza temperatura do BMP280 e usa DHT22 como reserva; mostrar especificamente leitura DHT22 para este teste.
2. CT02: desconexão forçada do Wi-Fi e reconexão sem travar aquisição. O WebREPL cai junto com o Wi-Fi; a evidência deve contemplar essa limitação.
3. CT03: enviar temperatura inconsistente, por exemplo 150 °C, e comprovar rejeição da API/backend e ausência de persistência indevida. Não utilizar credenciais públicas nem contaminar dados reais.
4. CT04: verificar marcador nas coordenadas cadastradas. Registrar a coordenada de referência e o resultado observado.

Os vídeos existentes não foram aqui certificados como execução completa desses quatro casos. O roteiro não determina liberar gás de isqueiro para produzir avisos.

## Declaração de IA

O arquivo fornecido exige discriminação de ferramenta, versão conhecida, ambiente, período, finalidade, seções afetadas e intervenção humana, além de arquivo de prompts e saídas. Apêndice F no novo roteiro.

Registrar o uso efetivo em código, SQL, diagnóstico, documentos, slides e roteiros de narração. Não inventar porcentagens, versões ou revisões manuais. A declaração contém afirmações amplas de responsabilidade e exclusividade humana da análise/conclusão: revisar a redação com o orientador diante do uso real de IA nesta conversa. Tratar as afirmações regulatórias do documento como conteúdo fornecido, sem concluir que foram verificadas em normas oficiais.

Não assinar como verificadas todas as equações, referências e medições antes da checagem humana. Guardar credenciais fora dos materiais públicos; compartilhar somente registros pertinentes e higienizados.

## Manual ABNT

Aplica-se à documentação acadêmica, não diretamente ao HTML/CSS ou firmware. Prevê Arial/Times 12, tamanho 10 nos elementos especificados, margens 3 cm superior/esquerda e 2 cm inferior/direita no anverso, recuo de 1,25 cm, entrelinhas 1,5 no texto e exceções em espaço simples. Figuras precisam de identificação, título, fonte e menção no texto. Conferir sumário, listas, paginação, citações, referências, apêndices e anexos.

O PDF V5 não foi integralmente auditado quanto à formatação nesta comparação. Os slides produzidos não substituem DER, esquema elétrico e tabela formal de CT01–CT04 exigidos no relatório e na apresentação final.

## Ordem recomendada

1. Resolver acesso público e registrar a limitação atual.
2. Completar geometria/distâncias no mapa.
3. Revisar esquema, pull-up DHT22 e condicionamento MQ-135.
4. Registrar CT01–CT04 e medir RNF02.
5. Completar DER, BOM, relatório, referências, slides e declaração de IA com revisão humana.
