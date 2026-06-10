-- Etapa 3: controle de confecção por item
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS em_confeccao BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confeccao_ok BOOLEAN NOT NULL DEFAULT false;

-- Etapa 2: ficha de conferência técnica
CREATE TABLE IF NOT EXISTS conferencia_itens (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  pedido_item_id INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  status         VARCHAR(20) NOT NULL DEFAULT 'pendente',
  -- 'pendente' | 'conferido' | 'reprovado'
  observacoes    TEXT,
  dados          JSONB,
  conferido_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  conferido_em   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id, pedido_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_agendamento ON conferencia_itens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ci_pedido_item ON conferencia_itens(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_ci_empresa ON conferencia_itens(empresa_id);
