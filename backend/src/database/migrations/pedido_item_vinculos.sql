-- pedido_item_vinculos.sql
-- Cria tabela de vínculos entre itens de pedido e migra dados de item_vinculado_id

CREATE TABLE IF NOT EXISTS pedido_item_vinculos (
  id                SERIAL PRIMARY KEY,
  item_id           INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  item_vinculado_id INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  tipo_vinculo      VARCHAR(40) NOT NULL DEFAULT 'acessorio',
  UNIQUE (item_id, item_vinculado_id)
);

CREATE INDEX IF NOT EXISTS idx_piv_item           ON pedido_item_vinculos(item_id);
CREATE INDEX IF NOT EXISTS idx_piv_item_vinculado ON pedido_item_vinculos(item_vinculado_id);

-- Migra vínculos existentes (se a coluna ainda existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pedido_itens' AND column_name = 'item_vinculado_id' AND table_schema = 'public'
  ) THEN
    INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
    SELECT id, item_vinculado_id, 'acessorio'
    FROM pedido_itens
    WHERE item_vinculado_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE pedido_itens DROP COLUMN item_vinculado_id;
  END IF;
END $$;

-- Garante que nenhum item se vincule a si mesmo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_piv_no_self_ref'
  ) THEN
    ALTER TABLE pedido_item_vinculos
      ADD CONSTRAINT chk_piv_no_self_ref CHECK (item_id <> item_vinculado_id);
  END IF;
END $$;
