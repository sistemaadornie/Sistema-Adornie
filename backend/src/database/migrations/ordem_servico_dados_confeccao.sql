-- ordem_servico_dados_confeccao.sql
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_confeccao         JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_em  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_por INTEGER REFERENCES usuarios(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_os_pedido_item_unico ON ordem_servico(pedido_item_id);
