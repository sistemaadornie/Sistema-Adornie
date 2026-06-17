-- Adiciona flag distribui_canais: quando true, item distribui canais aos motorizados do ambiente
-- em vez de usar lógica de largura. Corrige também bug Cortinas.vinculavel=true.
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS distribui_canais BOOLEAN NOT NULL DEFAULT false;

UPDATE categorias SET distribui_canais = true WHERE LOWER(nome) = 'controles';

-- Bugfix: Cortinas não deve ser vinculavel (causava falha no matching por largura)
UPDATE categorias SET vinculavel = false WHERE LOWER(nome) = 'cortinas';
