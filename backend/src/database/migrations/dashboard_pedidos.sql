-- backend/src/database/migrations/dashboard_pedidos.sql

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS verificacao_ok   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categorizacao_ok BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_pedido_item ON agendamento_itens(pedido_item_id);

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS agendamento_pai_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pai ON agendamentos(agendamento_pai_id);

INSERT INTO permissoes (nome, descricao) VALUES
  ('DASHBOARD_PEDIDOS_GERAL', 'Visualiza dashboard com pedidos de todas as consultoras')
ON CONFLICT DO NOTHING;
