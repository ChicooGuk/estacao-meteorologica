# Montagem da estação no Fritzing

O arquivo `.fzz` contém o projeto editável. As exportações SVG e PNG mostram a vista de protoboard utilizada no relatório e na apresentação.

A montagem representa ESP32 DevKit V1 de 30 pinos, DHT22, BMP280 de seis pinos, módulo LDR e módulo MQ-135. A fonte desenhada é um modelo visual equivalente à HW-131, com as linhas identificadas em 5 V e 3,3 V e referência GND comum.

- DHT22: DATA na GPIO4; dois resistores de 20 kΩ em paralelo entre DATA e 3,3 V.
- BMP280: SDA na GPIO21 e SCL na GPIO22; CSB e SDO sem jumpers externos.
- LDR: AO na GPIO34; DO desconectado.
- MQ-135: AO → 10 kΩ → ponto GPIO35 → 20 kΩ → GND; DO desconectado.
- Alimentação: 5 V no VIN da ESP32 e VCC do MQ-135; 3,3 V nos demais sensores.

O [PDF da montagem e da pinagem](../docs/esquemas/esquema-eletrico.pdf) inclui a figura ampliada e os complementos de hardware. A vista de protoboard documenta as conexões; não constitui simulação eletrônica dos sensores.
