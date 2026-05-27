-- Liga pedidos e itens ao orçamento de origem
-- Adiciona controle de disponibilidade e envio para confecção

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS orcamento_id INTEGER REFERENCES orcamentos(id);

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS orcamento_item_id    INTEGER REFERENCES orcamento_itens(id),
  ADD COLUMN IF NOT EXISTS tipo_disponibilidade VARCHAR(20)
    CHECK (tipo_disponibilidade IN ('estoque','pronta_entrega')),
  ADD COLUMN IF NOT EXISTS em_confeccao         BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pedidos_orcamento      ON pedidos(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_orc_item  ON pedido_itens(orcamento_item_id);
