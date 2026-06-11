-- categorias_vinculo_flags.sql
-- Adiciona flags de classificação para vínculo de itens (acessório/principal)

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS vinculavel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculos BOOLEAN NOT NULL DEFAULT false;
