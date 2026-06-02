-- pedido_itens_v4.sql
-- Separa o campo medidas em largura e altura individuais
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS largura  NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS altura   NUMERIC(10,4);
