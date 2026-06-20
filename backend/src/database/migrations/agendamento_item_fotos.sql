-- agendamento_item_fotos.sql
-- Fotos por item de agendamento (evidência de instalação), 1-N com agendamento_itens.

CREATE TABLE IF NOT EXISTS agendamento_item_fotos (
  id                   SERIAL PRIMARY KEY,
  agendamento_item_id  INTEGER NOT NULL REFERENCES agendamento_itens(id) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  enviado_por          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_item_fotos_item ON agendamento_item_fotos(agendamento_item_id);
