-- Vincula agendamento a um pedido
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS pedido_id INTEGER REFERENCES pedidos(id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_pedido ON agendamentos(pedido_id);
