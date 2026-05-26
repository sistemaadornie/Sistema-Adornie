-- Adiciona referência de arquiteto nos pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS arquiteto_id INTEGER REFERENCES arquitetos(id);
