-- Pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  cliente_id  INTEGER REFERENCES clientes(id),
  status      VARCHAR(30) NOT NULL DEFAULT 'pendente',
  descricao   TEXT,
  observacoes TEXT,
  criado_por  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pedidos_empresa    ON pedidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente    ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status     ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at DESC);

-- Itens do pedido (implementação futura)
CREATE TABLE IF NOT EXISTS pedido_itens (
  id         SERIAL PRIMARY KEY,
  pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  ambiente   VARCHAR(120),
  descricao  TEXT NOT NULL,
  quantidade NUMERIC(10,2) NOT NULL DEFAULT 1,
  valor      NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id);
