# Revisão documental de 09/11/2026

Versão atual: Documentacao_Estacao_Meteorologica_V5_atualizada.pdf. A V5 original foi preservada. O relatório mantém Times New Roman, texto preto, quadros azul-claro, margens 3/2 cm, corpo 12 e espaçamento 1,5. Não foi aplicado o tema da V6.

## Correções aplicadas

- Removidos do corpo os lembretes sobre conferência da curva, divisão a confirmar, validação futura da conclusão e consolidação de custos. Resumo e Abstract equivalentes foram atualizados.
- Desenvolvidas as seções de lógica, conversão ADC, algoritmos, banco relacional e geometria; incluído exemplo calculado de Haversine e deslocamento vetorial.
- Atualizadas as contribuições técnicas dos três integrantes conforme confirmação de Francisco; atividades compartilhadas identificadas como trabalho em grupo. Incluídos os RAs R330EC8, R4487J0 e R954838 nas identificações. Marcos históricos detalhados sem inventar sprints Scrum.
- Inserido esquema das conexões externas com disposição física da ESP32, divisor 10/20 kΩ, referência comum e pull-up de dois resistores de 20 kΩ em paralelo no DHT22. Incluídos a foto atual e o PDF do esquema como anexo. A figura não é apresentada como projeto Fritzing nem como inspeção de trilhas internas.
- Conferidos os coeficientes da curva equivalente de álcool no exemplo primário MQSensorsLib e acrescentada a referência. RL, R0, referência virtual, ADC e PPM têm funções distintas no texto.
- Corrigidos campos obrigatórios/anuláveis, alcance do filtro temporal de ar e descrição das restrições instaladas no MySQL.
- Incluídas capturas reais dos cartões, gráficos/mapa e prévia de aviso. O teste de layout em Chrome foi executado com recursos externos carregados em 1366 e 390 pixels.
- Incluída transcrição de cinco linhas reais do MySQL e contagem pontual da base. Não houve inserção, exclusão ou alteração de dados para produzir essa evidência.
- Medido o trecho entre recebimento pelo assinante MQTT de observação e resposta da API: 14 correlações, 1,885–2,869 s, mediana 2,105 s. Esse teste não mede o transporte anterior ao broker nem a renderização DOM.
- Consolidados resultados CT01–CT04, distinção entre execuções CT02 e distinção entre cadastro atual e faculdade. Três vídeos originais continuam incorporados, com verificação byte a byte.
- Conclusão reescrita a partir dos fatos registrados, sem instrução editorial. Trabalhos futuros incluem caixa 3D/IP65, solar/Li-Ion, mesh e estudo de previsão por aprendizado de máquina.
- Custos atualizados: aquisição inicial R$ 200,49; MQ-135 de reposição R$ 23,27; resistores doados sem custo; hardware R$ 223,76; multímetro separado como instrumento de teste R$ 24,99; desembolso total informado R$ 248,75. Declaração de IA separada atualizada para discriminar também redação assistida, sem assinaturas ou atestações automáticas.

## Limites que não podem ser encerrados por alteração de redação

1. A medição do RNF02 completo, desde o envio da ESP32 até a exibição, não foi realizada. A medição parcial está identificada no relatório e não é apresentada como aprovação desse requisito.
2. O esquema incluído documenta conexões externas. A montagem externa foi consolidada com os dados fornecidos pela equipe. As trilhas internas dos módulos não foram reconstruídas; não foi inventado um arquivo Fritzing ou um ensaio elétrico.
3. Contribuições, compras posteriores e RAs foram informados por Francisco e incorporados: Francisco R330EC8; Lucas R4487J0 (último caractere zero); Matheus R954838. Os valores financeiros são identificados como informados pela equipe, sem afirmar auditoria de comprovantes.
4. O manual UNIP 2025 classifica ficha catalográfica e folha de aprovação como obrigatórias nas seções 3.2.1.2 e 3.2.1.4. O roteiro específico não repete nominalmente essa exigência. Mantidos os espaços, conforme decisão do grupo de conservar a folha de aprovação. A ficha oficial vem da biblioteca; aprovação e assinaturas são preenchidas pelos responsáveis. Não foi atribuída aprovação inexistente.
5. A fonte primária da curva e dados editoriais acessíveis foram conferidos. A revisão acadêmica pelos integrantes e o cumprimento das vedações de autoria do documento de IA não podem ser assinados pelo assistente. Não foi afirmada leitura integral de livros não disponibilizados.
6. O vídeo final está separado dos registros CT, com as três saudações e narrações de Lucas, Matheus e Francisco, em aproximadamente 6min51s. A publicação pública da API depende de conectividade externa; o ensaio desta revisão utilizou localhost.

Ver Verificacao-final.json, Auditoria-de-normalizacao.json e Registros-verificacoes/. A auditoria anterior permanece como histórico; sua paginação e sua lista de defeitos não descrevem integralmente esta versão corrigida.
