-- Pedido itens v2: campos de produto (referencia, cor, medidas, unidade, preco)
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS referencia     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS cor            VARCHAR(120),
  ADD COLUMN IF NOT EXISTS medidas        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS unidade        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS preco_unitario NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ordem          INTEGER DEFAULT 0;
