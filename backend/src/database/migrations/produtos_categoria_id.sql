ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_categoria_id ON produtos (categoria_id);
