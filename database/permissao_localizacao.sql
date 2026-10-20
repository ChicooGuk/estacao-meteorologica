-- Executar como administrador do MySQL, para o usuario configurado no backend.
GRANT UPDATE (latitude, longitude) ON estacao_meteorologica.estacao TO 'estacao'@'localhost';
