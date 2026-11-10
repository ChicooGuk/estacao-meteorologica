# Conexões externas confirmadas pela equipe

Desenho consolidado disponível em [Esquema da montagem confirmada.pdf](../output/documentacao/diagramas/Esquema%20da%20montagem%20confirmada.pdf), com conexões externas, pull-up do DHT22 e registro fotográfico. O arquivo é um esquema complementar separado; sua criação não substitui automaticamente as figuras do relatório principal.

A terceira página inclui a foto da ESP32 enviada pela equipe e a referência de posição dos pinos, com o USB à esquerda. O próprio bloco ESP32 da primeira página também segue essa disposição física, com VIN/GND/D35/D34 na fileira superior e GND/D4/D21/D22 na inferior. Os pinos GND aparecem com a identificação impressa na placa, sem nomes fictícios de terminal. A identificação utilizada no desenho é placa ESP32 com módulo ESP-WROOM-32.

Registro da montagem informado por Francisco em 9 de novembro de 2026. Esta lista descreve o cabeamento existente; não equivale à medição das polarizações internas dos módulos.

## Alimentação

- HW-131, saída de 5 V → linha positiva da protoboard → VIN da ESP32 e VCC do MQ-135.
- HW-131, saída de 3,3 V → linha positiva do outro lado → VCC do DHT22, BMP280 e módulo LDR.
- Um GND da ESP32 liga ao negativo do lado de 5 V; outro GND liga ao negativo do lado de 3,3 V. Todos compartilham referência de terra.

## Sinais

| Componente | Conexão externa |
|---|---|
| DHT22 DATA | GPIO4; dois resistores extras de 20 kΩ em paralelo entre DATA e 3,3 V, equivalentes a 10 kΩ, instalados posteriormente e estação religada |
| BMP280 SDA | GPIO21 |
| BMP280 SCL | GPIO22 |
| BMP280 CSB e SDO | Encaixados na protoboard, sem jumpers conectados |
| LDR AO | GPIO34 |
| LDR DO | Desconectado |
| MQ-135 AO | Resistor de 10 kΩ → nó C |
| Nó C | GPIO35 e resistor de 20 kΩ para GND |
| MQ-135 DO | Desconectado |

## Conferência elétrica a concluir

O DHT22 é o sensor de quatro terminais sem placa de interface externa. A equipe instalou o pull-up acima e informou que temperatura e umidade continuaram atualizando após religar a estação. Esse registro substitui a descrição anterior, sem resistor externo.

CSB e SDO sem jumpers não demonstram que os terminais do chip BMP280 estejam eletricamente flutuantes: a placa pode conter resistores de polarização. Para I²C, o datasheet do chip determina CSB em VDDIO; SDO define o endereço e não deve flutuar. A identificação das polarizações da placa é distinta da confirmação do cabeamento externo.

O esquema final deve representar o circuito real e discriminar qualquer ajuste físico posterior. Não registrar resistores ou jumpers propostos como já instalados.

## Tensões medidas no BMP280

Na ordem solicitada de medição CSB→GND e SDO→GND, Francisco informou 3,25 V e 0,45 V. Para VDDIO nominal de 3,3 V, a tabela 26 do datasheet define nível alto a partir de 2,64 V e nível baixo até 0,66 V. As leituras são compatíveis com CSB alto e SDO baixo no momento da medição. A medida estática não identifica o circuito de polarização da placa nem comprova que SDO esteja ligado diretamente ao terra; não foi registrada resistência interna ou continuidade com GND.

Na observação complementar, SDO variou de 0 a 0,45 V, permanecendo abaixo do limite de nível baixo. A equipe confirmou atualização normal da pressão no dashboard. Não foram adicionados jumpers a CSB ou SDO. No desenho da montagem, esses terminais devem aparecer sem conexão externa, acompanhados dos níveis observados; não representar um resistor interno ou uma ligação direta a GND que não tenham sido identificados.

Fontes técnicas: [BMP280 — Bosch Sensortec](https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf); [AM2302 — Aosong](https://www.aosong.com/uploadfiles/2025/04/20250417105409216.pdf).
