-- categorias_vinculo_controle_persiana.sql
-- Habilita Controles como vinculável e Persianas como receptora de vínculo manual.
-- Cortinas/Forros passam a ter recebe_vinculo_automatico=true explicitamente,
-- preservando o comportamento do motor automático do subprojeto 3.
BEGIN;

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculo_automatico BOOLEAN NOT NULL DEFAULT false;

UPDATE categorias SET recebe_vinculo_automatico = true
WHERE LOWER(nome) IN ('cortinas', 'forros');

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'controles';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) = 'persianas';

COMMIT;
