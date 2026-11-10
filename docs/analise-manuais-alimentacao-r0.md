# Alimentacao e referencia R0 - 29/10/2026

## Fontes e limites de identificacao

- Manual oficial MQ135 Winsen, v1.6, sete paginas: baixado integralmente em
  `.estacao-local/manuais/MQ135_Winsen_v1.6.pdf`; texto integral extraido e
  paginas renderizadas. Tabelas e figuras das paginas 3 a 5 inspecionadas.
  https://www.winsen-sensor.com/d/files/manual/mq135.pdf
- A capsula do usuario nao tem fabricante identificado. O manual e uma
  referencia do modelo MQ135, nao prova que a capsula seja fabricada pela Winsen.
- Pagina de fabricante HW-131 encontrada, mas acesso apresentou erro de
  certificado/timeout. Nao foi encontrado manual PDF oficial da revisao exata.
  https://www.szhwmake.com/prod_view.aspx?FId=t3%3A82%3A3&Id=513&TypeId=82
- Ficha Handsontec MB102/YwRobot, tres paginas, lida integralmente pela consulta
  web, incluindo esquema. E referencia de familia, NAO manual exato do HW-131.
  O download local falhou por DNS. Nao substituir esse resultado por uma falsa
  afirmacao de que o arquivo foi baixado ou a revisao confirmada.
  https://handsontec.com/dataspecs/mb102-ps.pdf
- Inspecao pratica de HW-131 por seu autor, incluindo reguladores e esquema:
  https://www.richardmudhar.com/blog/2022/02/chinese-hw-131-breadboard-power-supply-clone-of-ywrobot-mb-u2/

## Conclusoes do manual do sensor

A referencia Winsen exige circuito e aquecedor a 5,0 V +/-0,1 V e condicionamento
inicial superior a 48 h. Define R0 como resistencia em ar limpo na Fig.3; a
Fig.4 usa OUTRA referencia, Rso em 400 ppm H2, que nao deve ser confundida com R0.
Sensibilidade depende de temperatura/umidade. O manual inclui limites contra
agua, silicone, corrosivos, sobretensao, concentracoes excessivas e danos
mecanicos. As curvas nao identificam seletivamente um gas numa mistura.

Assim, uma estimativa de R0 em ar limpo e possivel com essa definicao. Ar de
quarto fechado nao e automaticamente referencia limpa; a curva deve usar a
mesma definicao e a estimativa de campo nao equivale a calibracao certificada.

## Alimentacao

USB nao e inferior por definicao. O requisito e a tensao que efetivamente chega
ao modulo sob carga, sua estabilidade, e a capacidade de fornecer a corrente.
Se USB e fonte externa fornecessem as mesmas condicoes eletricas, mudar apenas
a origem nao exigiria outro R0. Se alteram aquecimento/tensao/resposta, e preciso
validar a alimentacao final e repetir ou conferir a referencia.

Na referencia MB102 o esquema usa regulacao linear e USB na linha de 5 V.
Logo, usar a USB dessa familia nao necessariamente evita o regulador de 5 V.
Aplicar isso ao HW-131 do usuario requer conferir a revisao. Reduzir 12 V a
5 V a 0,2 A num regulador linear dissiparia aproximadamente 1,4 W, antes das
demais cargas. Isso explica uma possibilidade termica, nao diagnostica sozinho
o defeito de uma placa. Nenhuma alteracao fisica de fonte foi executada.

## Evidencia atual

Consulta real da API: 50 amostras entre 15:05:22 e 15:07:25 de 29/10/2026
(horario de Sao Paulo); ADC medio 206,8225, minimo 198,125 e maximo 211.
Desvio-padrao 3,0433 ADC; coeficiente de variacao 1,47%. Janela anterior de
aproximadamente dois minutos: media 216,27, minimo 207 e maximo 223,25.
O sinal tem pequena dispersao na janela mais recente, mas a media diminuiu
entre janelas. Nao e prova de estabilizacao termica de longo prazo.

Esses dados sao ADC bruto, nao tensao aferida e nao ppm. As amostras nao
incluem medicao independente de VCC; o valor 5 V configurado e uma hipotese
do calculo, nao medicao da alimentacao.

## Proximo procedimento

1. Manter divisor 20/20 kOhm e RL nominal 1 kOhm identificado pelo usuario.
2. Conferir VCC e aquecedor, tempo de condicionamento e estabilidade da base.
3. Definir referencia de ar limpo de acordo com o manual/curva escolhido.
4. Coletar tensao calibrada no ADC dentro de sua faixa util; reconstruir AO.
5. Calcular Rs usando a tensao REAL de circuito e RL efetiva, incluindo a carga
   do divisor externo; para esse circuito RL efetiva = 1 || 40 = 0,97561 kOhm.
6. Se adotada a definicao Winsen v1.6 Fig.3, Rs em referencia de ar limpo e a
   estimativa de R0. Registrar ambiente, dispersao, alimentacao e metodo.
7. Validar na alimentacao final e nao apresentar concentracao precisa/seletiva
   a partir de uma referencia ambiente nao controlada.

Nao calcular R0 supondo que o ADC inteiro seja linear em 3,3 V; nao impor
400 ppm ao quarto; nao usar fator generico de ar limpo de outra curva;
nao recalibrar automaticamente a cada boot.
