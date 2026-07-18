-- pedido_itens_unidades.sql
-- Suporta medidas técnicas independentes por unidade física quando um item
-- de categoria que exige conferência tem quantidade > 1.

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS item_pai_id    INTEGER REFERENCES pedido_itens(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS numero_unidade SMALLINT,
  ADD COLUMN IF NOT EXISTS total_unidades SMALLINT,
  ADD COLUMN IF NOT EXISTS expandido      BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pedido_itens_item_pai ON pedido_itens(item_pai_id);
