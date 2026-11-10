# Terceira comparação dos slides

Data: 10/11/2026. Arquivos atuais: **Apresentacao Estacao Meteorologica - terceira conferencia final.pdf/.pptx**.

## Método e alcance

Esta conferência retomou o conteúdo dos documentos fornecidos, o PDF/PPTX, as capturas originais dos CTs, o esquema consolidado, o DDL, os trechos de código citados e a gravação do MySQL. Não se limitou à conclusão da segunda comparação.

Foram confrontados: a estrutura de 10–12 slides e a lista de conteúdos da seção 4 do Roteiro de Produção; as seções de arquitetura, hardware, firmware, backend, banco, geometria, testes, discussão, conclusão e bibliografia do Roteiro Orientador; e os apontamentos correspondentes de correcoes.md. O manual UNIP foi aplicado à organização das citações e referências, sem impor aos slides a diagramação de uma monografia A4.

Esta é uma auditoria da **apresentação executiva**, não uma certificação de todo o projeto nem previsão de nota. Uma entrega pode ter slides completos e ainda depender de assinatura, publicação, aferição ou defesa dos autores.

## Divergências encontradas e corrigidas nesta passagem

1. **Evidência do backend:** o slide 7 possuía código, mas não mostrava claramente a execução real. Foi incluída a captura original de CT03 com recebimento MQTT, persistência e rejeição de 150 °C.
2. **Estrutura e persistência no banco:** o slide 8 tinha DER conceitual e campos sem tipos. Agora apresenta tipos principais, nulabilidade, PK/FK/UNIQUE e uma captura autêntica da consulta SQL com registros. A imagem foi extraída aos 35 s da gravação original do MySQL, sem executar nova consulta, alterar dados ou produzir resultado sintético.
3. **Trabalhos futuros:** a expressão genérica “previsão por dados” não reproduzia todo o propósito solicitado nas correções. O slide 11 agora explicita Machine Learning para previsão do tempo e alertas preditivos de alagamento, além de caixa hermética IP65 impressa em 3D, painel solar, bateria Li-Ion e rede mesh com múltiplas estações.

## Matriz de confronto

| Ponto dos documentos | Conferência da versão atual | Resultado |
|---|---|---|
| Apresentação executiva em PDF, 10–12 lâminas | 12 páginas, proporção 16:9 | Presente |
| Capa e equipe | Três nomes, RAs, UNIP, curso, disciplina e professor no slide 1 | Presente |
| Problema urbano e acesso a informações | Variações entre bairros e informação local no slide 2 | Presente |
| Conceito e relevância de cidades inteligentes | Dados para decisões urbanas e conscientização, slide 2 | Presente |
| Diagrama IoT ponta a ponta | Sensores, ESP32, Mosquitto, Python/FastAPI, MySQL e dashboard, slide 3 | Presente |
| MQTT e backend integrado, sem retorno ao HTTP direto da placa | Fluxo, código e logs, slides 3, 6 e 7 | Presente |
| Pinagem e alimentação | GPIO4, 21, 22, 34 e 35; HW-131, 5 V, 3,3 V e GND comum, slide 4 | Presente |
| Resistores e condicionamento | Divisor 10/20 kΩ do MQ-135 e pull-up equivalente de 10 kΩ do DHT22, slides 4–5 | Presente |
| Foto correta de cada circuito | Foto do divisor ao lado de sua explicação; foto do pull-up ao lado de sua explicação, slide 5 | Presente |
| Esquema em ferramenta mencionada nos documentos | Há diagrama elétrico técnico consolidado. Não foi produzido no Fritzing/Tinkercad/Wokwi | Ressalva de formato, descrita abaixo |
| Cinco sensores e interrupção/debounce de chuva | Quatro sensores; pluviômetro e respectiva rotina de pulsos não são simulados | Exceção documentada nas correções |
| MicroPython, temporização e JSON | Coleta de 2,5 s, tarefas assíncronas, fila e payload, slide 6 | Presente |
| Perda de Wi-Fi e reconexão | Explicação no slide 6 e resultado CT02 no slide 10 | Presente |
| API/subscriber Python e validação lógica | Callback MQTT, faixa −40 a 80 °C, filtros e média móvel, slide 7 | Presente |
| Logs reais de recebimento e persistência | Captura do backend no slide 7 | Presente nesta versão |
| DER e cardinalidade | ESTACAO 1:N LEITURA, slide 8 | Presente |
| Tipos, chaves e restrições | Tipos principais, NULL/NOT NULL, PK, FK e unicidade, slide 8 | Presente nesta versão |
| Massa de dados e SQL | Captura de SELECT com registros reais no slide 8 | Presente nesta versão |
| CHECK no DDL versus banco instalado | O texto distingue o CHECK previsto no DDL da validação executada no backend | Sem atribuir instalação não comprovada |
| Dashboard, histórico, mapa e alertas | Captura e explicações no slide 9; demonstração funcional no vídeo vinculado | Presente |
| Geometria analítica e posição | Latitude/longitude, vetor local leste/norte e Haversine, slide 9; compatíveis com dashboard/app.js | Presente |
| CT01: temperatura DHT22 | 22,5 → 23,6 °C, seguido de redução; slide 10 e evidência original | Presente; não é calibração de precisão |
| CT02: perda de rede | Ausência de dados e retomada; slide 10 e vídeos de duas execuções separadas | Presente; não são capturas simultâneas |
| CT03: leitura de 150 °C | Rejeição no backend e contagem zero na consulta do teste; slides 7 e 10 | Presente; o log não contém boot_id |
| CT04: localização no mapa | Marcador e coordenadas aproximadas da região de testes; slides 9–10 | Presente |
| Limitações físicas/computacionais | Protoboard, estimativas e dependência do notebook, slide 11 | Presente |
| Soluções efetivamente aplicadas | Pull-up, divisor, filtros e fila/reconexão, slide 11 | Presente |
| Integração nominal das disciplinas | Python, Circuitos Digitais, Lógica Matemática, Geometria Analítica e Banco de Dados, slide 11 | Presente |
| Caixa hermética IP65 impressa em 3D | Texto explícito no slide 11 | Presente |
| Painel solar e bateria Li-Ion | Texto explícito no slide 11 | Presente |
| Machine Learning, previsão do tempo e alertas preditivos de alagamento | Texto explícito no slide 11 | Corrigido nesta passagem |
| Rede mesh com múltiplas estações | Texto explícito no slide 11 | Presente |
| Oito obras curriculares | Alencar Filho; Ascencio/Campos; Idoeta/Capuano; Kolban; Lourenço; Menezes; Oliveira; Winterle, slide 12 | Presentes |
| Bibliografia ligada às áreas | Chamadas nos slides 2–7 e 9 | Presente |
| Obra correta de Oliveira e inclusão de Ascencio/Campos | Título com ESP8266, Arduino e Raspberry Pi; obra de algoritmos no slide 12 | Presente |
| Fontes complementares sem substituir livros | MicroPython, Espressif, Winsen e MQSensorsLib também no slide 12 | Presente |
| Referências e citações | Títulos destacados uniformemente, ordem alfabética por coluna, chamadas autor-data e datas de acesso das fontes online | Conferidas na apresentação |
| Link do vídeo | Link clicável do Google Drive na capa e no README | Presente; não se afirma nova verificação externa de permissões |

## Ressalva sobre o esquema

Os documentos mencionam esquemas em Fritzing/Tinkercad e, em outro trecho, Wokwi. O conteúdo das conexões está no diagrama técnico do slide 4 e no PDF completo do esquema. Entretanto, não foi localizado um projeto nativo dessas ferramentas nos materiais inspecionados. Portanto, **não há base para garantir atendimento literal caso o docente exija especificamente o uso dessas ferramentas**, em vez de aceitar o esquema técnico equivalente. Não foi inventada uma aprovação do professor nem um arquivo de simulador.

## Pontos do relatório que não viram exigência automática de um slide dedicado

As críticas a resumo de aproximadamente 500 palavras, sumário, revisão bibliográfica extensa, Scrum/backlog, stakeholders, cronograma, discussão longa, ficha catalográfica e apêndices são dirigidas ao relatório. O roteiro executivo não pede um slide separado para cada uma dessas seções. A apresentação sintetiza o projeto; esta terceira conferência não declara que todos esses itens da monografia estão aprovados.

Tampouco se afirma precisão metrológica do MQ-135, identificação seletiva de gás, aprovação do RNF02 completo de até 5 s, permanência ilimitada da fila, validação de anos de operação, leitura integral dos livros ou assinatura/atestado dos integrantes. As citações curriculares são gerais; não foram inventadas frases literais ou páginas de livros.

## Conclusão da terceira passagem

As omissões de evidência e o detalhe dos trabalhos futuros encontrados nesta passagem foram corrigidos. O conteúdo executivo e a bibliografia estão cobertos, com a dispensa do pluviômetro registrada. Permanece a ressalva de formato do esquema caso a ferramenta específica seja exigida literalmente. Por isso, não se apresenta uma promessa de “certeza absoluta” sobre conformidade integral ou nota: a conclusão é delimitada pelas fontes e pelas evidências verificadas.
