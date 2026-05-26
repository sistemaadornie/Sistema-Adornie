-- Pagamentos do pedido (múltiplas formas parceladas)
CREATE TABLE IF NOT EXISTS pedido_pagamentos (
  id         SERIAL PRIMARY KEY,
  pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  forma      VARCHAR(80) NOT NULL,
  parcela    VARCHAR(10),
  vencimento DATE,
  valor      NUMERIC(12,2),
  ordem      INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_pagamentos_pedido ON pedido_pagamentos(pedido_id);
