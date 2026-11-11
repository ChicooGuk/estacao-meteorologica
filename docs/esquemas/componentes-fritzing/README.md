# Componentes da estacao no Fritzing

Abra `Estacao-Meteorologica.fzbz` em Arquivo > Abrir para importar a colecao completa. Os arquivos `.fzpz` permitem importar as pecas individualmente.

| Arquivo | Representacao |
| --- | --- |
| ESP32.fzpz | DOIT ESP32 DevKit V1, 30 pinos |
| DHT22.fzpz | DHT22 avulso, quatro pinos: VDD, DATA, NC, GND |
| BMP280.fzpz | GY-BMP280, seis pinos: VCC, GND, SCL, SDA, CSB, SDO |
| MQ135.fzpz | Modulo MQ-135: VCC, GND, DO, AO |
| Fonte.fzpz | YwRobot para protoboard, equivalente visual para representar a HW-131 |
| LDR.fzpz | Desenho vetorial proprio do modulo LDR/LM393: AO, DO, GND, VCC |

Protoboard, resistores e fios pertencem aos recursos nativos do Fritzing. No circuito da estacao, adicionar um resistor de 10 kohms e tres de 20 kohms: divisor do MQ-135 de 10/20 kohms e pull-up do DHT22 de dois resistores de 20 kohms em paralelo.

As pecas representam as conexoes para documentacao. A colecao nao fornece uma simulacao eletrica dos sensores. A fonte e o LDR sao representacoes graficas equivalentes; conferir a posicao fisica dos terminais com a montagem real.

## Origens

- ESP32: https://github.com/silveirago/FritzingParts/blob/master/DOIT%20Esp32%20DevKit%20v1%20improved.fzpz
- DHT22: https://github.com/silveirago/FritzingParts/tree/master/Fritzing-Library/parts
- BMP280: https://forum.fritzing.org/t/gy-bme-p280-part/3064/7
- MQ-135: https://github.com/WhiteRed14/Arduino_simple_weather_station
- Fonte: https://github.com/jorgechacblogspot/librerias_fritzing/blob/main/YwRobot_Breadboard_Power_Supply_v5.fzpz
- LDR: desenho original para a estacao, com vistas de protoboard, esquema e PCB.

Foram preservados os autores e metadados existentes. Ajustes locais corrigem referencias de camadas SVG ausentes e identificam os conectores do BMP280 pelos nomes dos terminais.
