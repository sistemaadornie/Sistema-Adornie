-- agendamento_itens_pedido_item.sql
-- Adiciona a coluna pedido_item_id na tabela agendamento_itens para relacionamento direto dos itens agendados

ALTER TABLE agendamento_itens ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_itens(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agendamento_itens_pedido_item ON agendamento_itens(pedido_item_id);
