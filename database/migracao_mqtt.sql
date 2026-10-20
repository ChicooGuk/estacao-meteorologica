-- Executar UMA vez no banco existente, antes de iniciar a nova API.
-- Nao executar o script antigo com DROP TABLE sobre dados existentes.
ALTER TABLE leitura
    MODIFY temperatura FLOAT NULL,
    MODIFY umidade FLOAT NULL,
    MODIFY pressao FLOAT NULL,
    MODIFY qualidade_ar FLOAT NULL,
    MODIFY luminosidade FLOAT NULL,
    ADD COLUMN boot_id VARCHAR(32) NULL,
    ADD COLUMN sequencia BIGINT NULL,
    ADD COLUMN payload JSON NULL,
    ADD COLUMN qualidade JSON NULL,
    ADD UNIQUE KEY uq_amostra (id_estacao, boot_id, sequencia),
    ADD INDEX ix_estacao_tempo (id_estacao, data_hora);
