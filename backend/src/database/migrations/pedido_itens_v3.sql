-- pedido_itens_v3.sql
-- Adiciona campos de modelo, especificacoes e vinculação entre itens
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS modelo             VARCHAR(120),
  ADD COLUMN IF NOT EXISTS especificacoes     JSONB,
  ADD COLUMN IF NOT EXISTS item_vinculado_id  INTEGER REFERENCES pedido_itens(id);
