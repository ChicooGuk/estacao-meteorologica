# Simulação de referências do MQ-135

**Simulação matemática: não modifica o firmware, a alimentação ou a telemetria.**

Amostra: 2026-11-02T22:38:46Z; ADC 338.875; D35 medido pelo ADC: 0.153875 V. Alimentação assumida: 4,90 V. Divisor 10/20 kΩ; RL 1 kΩ.

| Referência usada | R0 calculado | Resultado matemático | Origem |
|---|---:|---:|---|
| 0.130178 V | 6.477 kΩ | 2.29 ppm | referencia real registrada |
| 0.100000 V | 8.513 kΩ | 5.47 ppm | hipotese virtual; nao medida |
| 0.080000 V | 10.708 kΩ | 11.34 ppm | hipotese virtual; nao medida |
| 0.065089 V | 13.222 kΩ | 22.18 ppm | hipotese virtual; nao medida |

A tensão física da amostra é idêntica em todos os cenários. A diferença nos resultados é causada somente pela referência escolhida. Referências inferiores não foram obtidas por medição; valores virtuais abaixo de 0,1 V também ficam abaixo da faixa linear aproximada documentada de 0 dB. A relação Rs/R0=3,6 é uma hipótese de referência do modelo. Não usar os cenários como calibração, leitura de mistura ou indicador de segurança. Valores matemáticos fora de 10–300 ppm são extrapolações.

Fallback privado preservado: `.estacao-local/config-fallback-simulacao-20261102T223842Z.py`. A configuração original não foi alterada.

## Referencias virtuais inferiores a 0,060 V

Mesma amostra de 0,153875 V, sem alterar placa ou dashboard. Todas as referencias abaixo sao hipoteticas e inferiores a faixa linear aproximada documentada do ADC em 0 dB. Resultados acima de 300 ppm tambem extrapolam o modelo de alcool.

| Referencia virtual | Resultado matematico |
|---|---:|
| 0.05900 V | 30.50 ppm |
| 0.05500 V | 38.27 ppm |
| 0.05000 V | 52.08 ppm |
| 0.04500 V | 73.17 ppm |
| 0.04000 V | 106.94 ppm |
| 0.03500 V | 164.32 ppm |
| 0.03000 V | 269.60 ppm |
| 0.02000 V | 988.46 ppm |
| 0.01000 V | 9046.51 ppm |

## Perfil de teste selecionado

Referencia virtual escolhida: 0,035 V; R0 virtual: 24.82078853 kOhm. Perfil salvo separadamente em `.estacao-local/mq135-perfil-teste-0035.json`. Resultado rotulado PPM simulado. Firmware e dashboard real permanecem usando a referencia medida anterior; nenhuma tensao fisica foi alterada.

## Ativacao do perfil de teste na placa e no site

Por solicitacao do usuario, o perfil de 0,035 V foi preparado para execucao no firmware e exibicao no dashboard publicado. R0 virtual = 24,82078853 kOhm. A tensao fisica continua sendo obtida por read_uv(); nao e fixada nem reduzida por software.

O firmware usa MQ135_REFERENCE_IS_SIMULATION=True e envia mq135_modo_teste=True. O valor fica em mq135_ppm_simulado; qualidade_ar permanece null para nao misturar simulacao com concentracoes. O backend rejeita payloads que tentem preencher concentracao e modo simulado ao mesmo tempo. O card e o comparativo mostram PPM simulado e a descricao de referencia virtual. A simulacao respeita os estados de aquecimento, sinal baixo e limites de 10–300 do modelo; nao transforma falhas do ADC em resultados ficticios.

O fallback operacional anterior foi relido da placa e guardado em .estacao-local/config-antes-teste035.py. Para restaurar, gravar esse arquivo como config.py e reiniciar. O backend aceita tanto a telemetria antiga quanto a nova. A curva e a alimentacao continuam sendo as hipoteses documentadas anteriormente.

## Faixa ampliada no modo de teste

Mantida a referencia virtual de 0,035 V e R0 virtual de 24,82078853 kOhm. O parametro MQ135_SIMULATION_PPM_MAX=4000 amplia somente o resultado simulado para 10–4.000. O parametro MQ135_PPM_MAX continua 300 fora do teste. Acima de 300, o card identifica extrapolacao da curva; acima de 4.000 exibe >4000. Nao ha limitacao artificial do valor para caber na faixa nem transformacao de saturacao do ADC em ppm. Aquecimento, sinal baixo e erro de leitura continuam impedindo calculo. O campo qualidade_ar permanece null neste perfil e o resultado e armazenado em mq135_ppm_simulado. Fallback anterior da placa em .estacao-local/config-antes-faixa4000.py.

## Perfil de teste atualizado para 0,050 V

Referencia virtual atual: 0,050 V; R0 virtual 17.29390681 kOhm. Mantidos modo de simulacao, alimentacao assumida de 4,90 V e limite simulado de 4.000 ppm, com identificacao de extrapolacao acima de 300. Fallback do perfil 0,035 V em `.estacao-local/config-fallback-0035-20261102T230944Z.py`. O aumento da referencia virtual reduz a saida para a mesma tensao fisica; nao altera a alimentacao nem valida concentracao.

## Perfil atual: 0,055 V e faixa 10–300

Referencia virtual de 0,055 V, R0 virtual 15.69729554 kOhm, limite de simulacao 300. Mantido modo de teste identificado. Dois registros reais de aproximadamente 191 ADC e 0,118 V produzem, neste perfil hipotetico, aproximadamente 16 ppm simulados. Isso nao estabelece equivalencia universal ADC/ppm. Fallback do perfil 0,050 V / 4000 em `.estacao-local/config-fallback-0050-faixa4000-20261102T232504Z.py`. Acima de 300, exibir >300 sem valor numerico extrapolado.

## Perfil atual: 0 dB, 0,055 V e faixa simulada 10–1.000

Mantidos GPIO35, atenuacao 0 dB, referencia virtual 0,055 V e R0 virtual 15,69729554 kOhm. MQ135_SIMULATION_PPM_MAX=1000; faixa do modelo fora da simulacao permanece 10–300. Valores simulados acima de 300 sao identificados como extrapolacao; acima de 1000 mostra >1000. Mantidas protecoes de aquecimento, sinal baixo e saturacao, e separacao dos resultados simulados no banco.

## Perfil atualizado: 0 dB, 0,050 V e faixa simulada 10–1.000

Referencia virtual definida em 0,050 V; R0 virtual correspondente 17,29390681 kOhm. Mantidos GPIO35, atenuacao 0 dB, modo de simulacao e limite simulado de 1.000 ppm. O valor 0,050 V e apenas parametro matematico da referencia, nao uma tensao fisica aplicada ao sensor. A tensao medida pelo ADC continua sendo lida dinamicamente por `read_uv()`.

## Exibicao de estimativas abaixo de 10 ppm

O limite inferior configurado foi alterado para 0 ppm para que a curva possa exibir seus resultados positivos abaixo de 10 ppm. O firmware mantém quatro casas decimais nesses valores. O limite superior da simulação segue em 1.000 ppm; leituras inválidas, saturação e sinais no limite inferior do ADC continuam sem gerar PPM.

## Configuracao operacional escolhida: 0,045 V

Por solicitacao do usuario, a referencia foi alterada para 0,045 V e o R0 correspondente para 19,21545201 kOhm. O firmware sai do modo de teste e publica a curva como PPM estimado no campo `qualidade_ar`; o limite operacional passa a 0–300 ppm, com valores positivos abaixo de 10 apresentados numericamente. A referencia continua sendo um parametro virtual do modelo, nao uma tensao fisica do sensor.
