# Instalação

## Requisitos

- Python 3.14, versão utilizada no desenvolvimento.
- MySQL Server e MySQL Workbench ou cliente SQL equivalente.
- Mosquitto e rede Wi-Fi de 2,4 GHz acessível pela ESP32 e pelo computador.
- ESP32 com MicroPython e Thonny ou mpremote para transferência dos arquivos.
- Node.js para execução das verificações JavaScript.

## Obtenção do código

```powershell
git clone https://github.com/ChicooGuk/estacao-meteorologica.git
cd estacao-meteorologica
```

O código também pode ser obtido pela opção de download ZIP do GitHub.

## Backend

Na raiz do repositório, em PowerShell:

```powershell
py -3.14 -m venv .venv314
.\.venv314\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Na primeira instalação, criar `backend/.env` a partir de `backend/.env.example`. O arquivo deve conter os parâmetros de conexão MySQL, MQTT e as origens autorizadas em `CORS_ORIGINS`. `LOCATION_ADMIN_TOKEN` controla a alteração da localização. `HTTP_INGEST_TOKEN` é opcional; o recebimento principal utiliza MQTT.

As configurações locais e as credenciais não são versionadas.

## Banco de dados

Para uma instalação nova, executar [estacao_meteorologica.sql](../../database/estacao_meteorologica.sql) no MySQL Workbench. O script cria o banco, as tabelas e o cadastro inicial da estação.

Criar um usuário próprio para a aplicação:

```sql
CREATE USER IF NOT EXISTS 'estacao'@'localhost' IDENTIFIED BY 'SENHA_DA_INSTALACAO';
GRANT SELECT, INSERT ON estacao_meteorologica.* TO 'estacao'@'localhost';
GRANT UPDATE (latitude, longitude)
ON estacao_meteorologica.estacao TO 'estacao'@'localhost';
```

Registrar a mesma senha em `DB_PASSWORD` no `.env`. Para uma base anterior à integração MQTT, a atualização está em [migracao_mqtt.sql](../../database/migracao_mqtt.sql). A migração se aplica à estrutura existente e deve ser precedida de cópia de segurança; ela não é necessária em uma instalação nova.

## Broker MQTT

Configurar o Mosquitto com um listener acessível na rede local, autenticação por usuário e senha e `allow_anonymous false`. O arquivo de senhas é criado com `mosquitto_passwd`. O acesso TCP à porta configurada, normalmente 1883, deve estar disponível entre a ESP32 e o computador.

Os parâmetros do broker devem coincidir no `.env` do backend e na configuração da ESP32. `MQTT_HOST`, na placa, recebe o endereço do computador na rede local.

## Firmware

Criar uma cópia de [config.example.py](../../firmware/config.example.py) denominada `config.py`. Preencher as redes Wi-Fi, o endereço e as credenciais MQTT, o identificador da estação e os parâmetros da montagem descritos no [guia de hardware](HARDWARE.md).

Transferir os seguintes arquivos para a raiz da ESP32:

```text
boot.py
main.py
mqtt_async.py
bmp280.py
config.py
```

A transferência pode ser realizada pelo Thonny. Os arquivos da interface web permanecem no computador ou na hospedagem do frontend.

## Verificação inicial

Após reiniciar a placa e iniciar o backend, conferir os registros de conexão Wi-Fi, conexão MQTT, recebimento e persistência. A operação e os endereços da interface estão descritos em [OPERACAO.md](OPERACAO.md).
