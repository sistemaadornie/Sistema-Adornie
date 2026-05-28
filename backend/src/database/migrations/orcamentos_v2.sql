-- Orcamentos v2: campos adicionais para o novo formulário completo

-- Campos de cabeçalho
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS taxar_nf       BOOLEAN DEFAULT false;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS de_onde_veio   TEXT;

-- Campos de pessoas
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS gerente_id     INTEGER REFERENCES usuarios(id);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS clube          TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS vendedor_id    INTEGER REFERENCES usuarios(id);

-- Custo dos itens (margem)
ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS custo_unitario  NUMERIC(12,2);
ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS custo_total_item NUMERIC(12,2);

-- Tabela de pagamentos/condições do orçamento
CREATE TABLE IF NOT EXISTS orcamento_pagamentos (
  id              SERIAL PRIMARY KEY,
  orcamento_id    INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  forma           VARCHAR(80),        -- DINHEIRO, BOLETO, PIX/DEPOSITO, etc.
  condicao        VARCHAR(120),       -- Condição (parcelas, prazo etc.)
  conta_bancaria  VARCHAR(120),       -- Conta bancária
  categoria       VARCHAR(120),       -- Categoria financeira
  centro_custo    VARCHAR(120),       -- Centro de custo
  num_doc         VARCHAR(60),        -- Nº do documento
  data_inicial    DATE, 
  valor           NUMERIC(12,2),
  taxa            NUMERIC(5,2),       -- Taxa %
  ordem           INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orc_pagamentos_orcamento ON orcamento_pagamentos(orcamento_id);

-- Endereço de entrega detalhado (decomposto de JSONB para campos individuais)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_cep         VARCHAR(10);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_rua         TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_numero      VARCHAR(20);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_complemento TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_bairro      TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_cidade      TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_estado      VARCHAR(2);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS faturamento_diferente BOOLEAN DEFAULT false;
