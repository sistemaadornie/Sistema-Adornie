-- Campo sem_vinculo em pedido_itens
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS sem_vinculo BOOLEAN NOT NULL DEFAULT false;

-- Tabela de auditoria de pedidos
CREATE TABLE IF NOT EXISTS pedido_auditoria (
  id           SERIAL PRIMARY KEY,
  pedido_id    INTEGER      NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id   INTEGER      NOT NULL,
  usuario_id   UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  etapa        VARCHAR(30)  NOT NULL,
  acao         VARCHAR(60)  NOT NULL,
  descricao    TEXT,
  dados_antes  JSONB,
  dados_depois JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_auditoria_pedido ON pedido_auditoria(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_auditoria_etapa  ON pedido_auditoria(pedido_id, etapa);
