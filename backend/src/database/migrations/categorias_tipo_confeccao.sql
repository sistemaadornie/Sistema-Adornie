-- categorias_tipo_confeccao.sql
-- Marca quais categorias geram Ordem de Serviço com Ficha de Confecção,
-- e qual o tipo de ficha (cortina/xale usam a mesma; forro tem a sua).
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_confeccao VARCHAR(20);

UPDATE categorias SET tipo_confeccao = 'cortina' WHERE LOWER(nome) IN ('cortinas', 'xales');
UPDATE categorias SET tipo_confeccao = 'forro'   WHERE LOWER(nome) = 'forros';

CREATE INDEX IF NOT EXISTS idx_categorias_tipo_confeccao ON categorias(tipo_confeccao);
