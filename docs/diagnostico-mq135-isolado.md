# Diagnostico de conflito de rotinas MQ-135

Foi preparada uma variante em `.estacao-local/main-teste-mq-isolado.py`, sem substituir o firmware de producao. Mantem ADC GPIO35, atenuacao e configuracao atuais, Wi-Fi, fila, MQTT e payload normal. Nao inicializa BMP280, DHT22 ou LDR e nao executa recuperacao I2C. Nao altera sinais para gerar ppm ou sair de zero. Outros sensores aparecem indisponiveis intencionalmente.

Objetivo: comparar o mesmo circuito e a mesma alimentacao na fonte, primeiro com firmware completo, depois com somente MQ-135 e comunicacao. Nao desconectar sensores entre os dois testes, para nao confundir carga eletrica com interferencia de software. USB serve para gravar; o resultado comparavel e depois de voltar a mesma fonte. Alimentacoes nao devem ser unidas inadvertidamente.

Se o ADC continuar zero na variante, fica menos provavel conflito entre as rotinas dos sensores; ainda restam alimentacao, referencia GND, contatos e comportamento do ADC. Se recuperar, repetir A/B antes de atribuir causa e reinserir as rotinas individualmente. Nenhum dos resultados sozinho confirma dano na fonte ou na ESP32. A variante usa a mesma conversao simulada atual, separada da concentracao no banco.

A gravacao precisa copiar essa variante como main.py na placa e manter config.py. Para restaurar, gravar firmware/main.py de producao. A variante ainda NAO foi gravada ou executada nesta preparacao; nao havia porta USB disponivel.
