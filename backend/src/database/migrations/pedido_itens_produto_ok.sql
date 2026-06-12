-- pedido_itens_produto_ok.sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS produto_ok BOOLEAN NOT NULL DEFAULT false;
