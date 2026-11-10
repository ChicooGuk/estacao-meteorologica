-- ==============================================================================
-- PROJETO ESTAÇÃO METEOROLÓGICA INTELIGENTE COM ESP32 (DISCIPLINA 68F3)
-- Modelagem de Banco de Dados Relacional (MySQL / MariaDB) - Seção 4.7
-- ==============================================================================

-- Remove a tabela antiga caso exista para atualizar a estrutura com integridade referencial
-- Criacao inicial apenas: para banco existente, use migracao_mqtt.sql.


-- ------------------------------------------------------------------------------
-- Tabela 'estacao' (Mapeamento Geográfico e Cadastro das Estações)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estacao (
    id_estacao INT AUTO_INCREMENT PRIMARY KEY,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    descricao VARCHAR(100)
);

-- Inserção da estação principal (Coordenadas padrão de referência)
INSERT IGNORE INTO estacao (id_estacao, latitude, longitude, descricao) 
VALUES (1, -23.55052, -46.63330, 'Estação Principal ESP32 - SP');

-- ------------------------------------------------------------------------------
-- Tabela 'leitura' (Persistência Cronológica da Telemetria)
-- Atende a todas as grandezas especificadas no modelo da disciplina (Seção 4.7)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leitura (
    id_leitura BIGINT AUTO_INCREMENT PRIMARY KEY,
    id_estacao INT NOT NULL,
    temperatura FLOAT NULL,              -- Em Graus Celsius (°C)
    umidade FLOAT NULL,                  -- Em Porcentagem (%)
    pressao FLOAT NULL,                  -- Em hPa
    qualidade_ar FLOAT NULL,             -- Valor em PPM (MQ-135)
    luminosidade FLOAT NULL,             -- Valor em ADC/Lux (LDR)
    pluviometria FLOAT DEFAULT 0.0,      -- Precipitação em mm (Sensor dispensado na montagem prática)
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    boot_id VARCHAR(32) NULL,
    sequencia BIGINT NULL,
    payload JSON NULL,
    qualidade JSON NULL,
    UNIQUE KEY uq_amostra (id_estacao, boot_id, sequencia),
    INDEX ix_estacao_tempo (id_estacao, data_hora),
    CONSTRAINT fk_estacao FOREIGN KEY (id_estacao) REFERENCES estacao(id_estacao),
    CONSTRAINT ck_temperatura CHECK (temperatura IS NULL OR temperatura BETWEEN -40 AND 80),
    CONSTRAINT ck_umidade CHECK (umidade IS NULL OR umidade BETWEEN 0 AND 100),
    CONSTRAINT ck_pressao CHECK (pressao IS NULL OR pressao BETWEEN 300 AND 1200),
    CONSTRAINT ck_qualidade_ar CHECK (qualidade_ar IS NULL OR qualidade_ar BETWEEN 0 AND 10000),
    CONSTRAINT ck_luminosidade CHECK (luminosidade IS NULL OR luminosidade BETWEEN 0 AND 100000)
);
