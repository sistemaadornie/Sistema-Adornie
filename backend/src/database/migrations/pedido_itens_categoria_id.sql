-- pedido_itens_categoria_id.sql
-- Adiciona a coluna categoria_id na tabela pedido_itens para relacionamento direto de categorias de itens

ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pedido_itens_categoria ON pedido_itens(categoria_id);
