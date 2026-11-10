# Correções técnicas e validação — 26/10/2026

## Escopo

Critérios: correcoes.md e Roteiro de Produção.docx, ambos em Downloads.
Excluídos nesta etapa: vídeo, slides, GIFs e revisão dos textos acadêmicos.
Mantida a dispensa do pluviômetro anotada no arquivo de correções.
Não foram acrescentados sensores, serviços, hospedagem ou valores de calibração.

## Alterações realizadas

- Firmware: diagnóstico de ADC baixo/saturado antes dos bloqueios de aquecimento e calibração do MQ135. Configuração inválida, erro de leitura e ausência de read_uv recebem estados próprios. R0 não finito é rejeitado.
- Firmware: o LDR limpa o ADC bruto antes da coleta, para não reapresentar dado antigo após erro.
- Backend: filtros e médias separados em backend/filtros.py, mantendo validação, exclusão de outliers e médias móveis solicitadas.
- Backend: referências do filtro relativas ao horário de coleta; registros posteriores à amostra não entram na janela. Leituras recentes ordenadas por horário de coleta, com desempate por identificador.
- Dashboard: estados de diagnóstico do MQ135 apresentados separadamente. Removidas classificações universais de concentração crítica em 1200/1800 ppm, sem referência de gás/calibração.
- Dashboard: variação do MQ135 rejeitada pelo filtro produz aviso de leitura suspeita, sem afirmar risco ou concentração crítica. Alertas existentes de temperatura e umidade preservados.

## Verificações executadas

30 testes Python aprovados e suítes JavaScript test_dashboard.cjs e test_locations.cjs aprovadas.
Os testes usam simulação de hardware e de banco; não representam aferição física.

| Requisito solicitado | Verificação disponível | Limite da evidência |
| --- | --- | --- |
| Firmware com JSON/MQTT e aquisição independente | Testes de aquisição, fila, publicação e protocolo; publicação real observada após reinício | Não comprova estabilidade prolongada |
| Validação e filtragem no Python | Testes de faixa física, não finitos, outliers, média móvel e janela de coleta | Limiares temporais permanecem demonstrativos |
| Persistência relacional | Testes de transação/deduplicação e API local respondendo com leituras reais | Testes automatizados simulam a conexão; não houve nova auditoria SQL independente |
| Mapa da estação, associado ao CT04 na correção | Testes de marcador, coordenadas zero e ajuste de localização | Conferência física da posição geográfica ainda necessária |
| Gráficos e alertas | Testes de histórico, atualização de gráfico, aviso de variação filtrada e ausência de classificação universal de ppm | Não representam estudo de usabilidade com usuários |
| Diagnóstico do MQ135 | Testes de sinal baixo, saturação e configuração; firmware executado na ESP32 | Não comprova funcionamento químico ou precisão em ppm |

As fontes fornecidas mencionam CT01–CT04, mas não especificam integralmente os passos de CT01–CT03. Os testes existentes foram associados às funções verificadas, sem inventar critérios oficiais para esses identificadores.

## ESP32 e integração real

COM4 encontrada. O main.py anterior da placa foi comparado e era igual à cópia local anterior. Backup preservado antes da alteração. O main.py corrigido foi gravado, relido e comparado byte a byte, com igualdade. A placa foi reiniciada e voltou a publicar mensagens confirmadas pelo broker.

Após a atualização, o diagnóstico real passou a sinal_baixo, com adc_bruto.qualidade_ar = 0 e qualidade_ar = null. Os parâmetros privados, resistores e calibração não foram alterados.

## Pendências reais

1. Medir VCC, AO e entrada GPIO35 com instrumento adequado. Confirmar montagem e funcionamento do MQ135. Software não corrige ausência de sinal elétrico.
2. Determinar referência e curva para um gás antes de habilitar ppm. Não foram inventados R0, coeficientes ou limites de concentração.
3. Recarregar o backend local: o processo Python existente recusou encerramento por acesso negado. As correções estão nos arquivos, mas o processo em execução não foi reiniciado por esta sessão. Fechar a instância atual e usar iniciar_backend.bat.
4. Executar testes prolongados com evidência de estabilidade, tempo de resposta da API e consultas SQL, como solicitado. Há instrumentação, mas não foi declarado resultado de ensaio prolongado.
5. Esquemático elétrico formal e comprovação de pull-ups/condicionamento da montagem continuam exigências de hardware; não foram presumidos a partir de uma fotografia ou da pinagem.
6. As alterações desta etapa são locais e no firmware; não houve publicação no GitHub/Firebase. O repositório remoto consultado anteriormente difere da cópia local.

Gestão Scrum/Kanban e histórico de decisões exigidos nas correções não podem ser reconstruídos como se tivessem ocorrido. A documentação deve registrar somente atividades reais.
