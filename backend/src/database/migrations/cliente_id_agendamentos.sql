-- Vincula agendamentos à tabela de clientes (nullable para não quebrar dados históricos)
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_id ON agendamentos(cliente_id);
