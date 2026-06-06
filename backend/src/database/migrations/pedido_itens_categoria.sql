-- pedido_itens_categoria.sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
