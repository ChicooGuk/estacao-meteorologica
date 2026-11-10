# Estimativa equivalente de álcool — MQ-135

O dashboard usa o rótulo PPM estimado. O modelo representa álcool equivalente; o sensor não identifica substâncias nem distingue misturas. Resposta a combustível não mede concentração desse combustível pela curva de álcool.

Fonte dos coeficientes: exemplo MQ-135-ALL da MQSensorsLib, https://github.com/miguel5612/MQSensorsLib/blob/master/examples/MQ-135-ALL/MQ-135-ALL.ino . A = 77.255, B = -3.18, relação de referência Rs/R0 = 3.6. Esses coeficientes são do modelo da biblioteca, não uma equação fornecida explicitamente pelo manual.

O datasheet Hanwei define R0 por uma referência de 100 ppm de NH3 e descreve álcool em 10–300 ppm: https://datasheet4u.com/pdf-down/M/Q/1/MQ135_Hanwei.pdf . A cápsula da montagem não tem fabricante confirmado, portanto a transferência da curva é uma hipótese.

Referência ambiental provisória registrada em 02/11/2026: tensão ADC média 0.137561435 V. Alimentação assumida de 4.90 V, RL identificado pelo usuário de 1 kOhm, divisor 10/20 kOhm, fator 1.5, carga efetiva 1 || 30 = 0.967741935 kOhm. Rs do ambiente = 22.013193 kOhm. Para o modelo da biblioteca, assume-se que esse ambiente corresponde à relação 3.6; logo R0 provisório = 6.11477572 kOhm. Isso não foi validado por gás de concentração conhecida. Não se usa Rs diretamente como R0 e não há ajuste automático a cada inicialização.

O ambiente apresentava umidade em torno de 84%, diferente das condições de ensaio do datasheet. Não foi aplicada compensação ambiental sem caracterização. A alimentação real também não foi medida com resolução suficiente. A estabilidade elétrica não comprova exatidão da concentração; o resultado não deve ser usado para decisões de segurança.

ppm = 77.255 * (Rs/R0)**(-3.18). O firmware pode publicar valores positivos abaixo de 10 ppm, com quatro casas decimais, e mantém o limite superior configurado. Valores abaixo de 10 são apresentados como estimativas numéricas da curva. Não há piso artificial, nem ppm para ADC saturado. Histórico e gráfico mantêm lacunas em vez de números inventados.

PPM está habilitado na configuração local da montagem, com a referência provisória explícita. O exemplo público mantém habilitação desligada e R0 vazio para não transportar uma referência de uma unidade para outra. A ESP32 precisa receber a configuração por USB; a edição local não modifica a placa pelo Wi-Fi.

## Atualizacao da referencia em 02/11/2026

Por solicitacao do usuario, a nova referencia usa 20 medias de 32 leituras, ADC medio 239.35312, tensao ADC media 0.13017812 V, AO estimado 0.19526718 V. Mantidos alimentacao assumida 4.90 V, RL 1 kOhm, divisor 10/20 kOhm e relacao de referencia assumida 3.6. Rs ambiental = 23.31660264 kOhm e R0 provisorio = 6.47683407 kOhm. A referencia anterior continua registrada acima como historico; fallback privado salvo em .estacao-local/config-fallback-referencia-20261102T222512Z.py. A tensao de cada amostra continua dinamica, lida por read_uv(), e nao e fixada nesta media. O modelo calcula aproximadamente 1.3149 ppm no ponto de referencia, abaixo da faixa publicada; o painel preserva <10. A mudanca de baseline nao valida concentracao nem eleva arbitrariamente o resultado.
