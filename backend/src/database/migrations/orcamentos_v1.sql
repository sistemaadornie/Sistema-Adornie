-- Orçamentos: cabeçalho do orçamento de venda (vinculado a cliente + consultora)
CREATE TABLE IF NOT EXISTS orcamentos (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL,
  cliente_id      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  consultora_id   INTEGER REFERENCES usuarios(id),
  arquiteto_id    INTEGER REFERENCES arquitetos(id),
  numero          VARCHAR(50),       -- ex: ORC-00001 (gerado na app)
  status          VARCHAR(20) NOT NULL DEFAULT 'novo',
  -- 'novo' | 'aprovado' | 'cancelado'
  observacoes     TEXT,
  valor_total     NUMERIC(12,2),
  criado_por      INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE SEQUENCE IF NOT EXISTS orcamentos_numero_seq;

CREATE INDEX IF NOT EXISTS idx_orcamentos_empresa    ON orcamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente    ON orcamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_consultora ON orcamentos(consultora_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status     ON orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_created_at ON orcamentos(created_at DESC);

-- Itens do orçamento: um por ambiente/produto
CREATE TABLE IF NOT EXISTS orcamento_itens (
  id                SERIAL PRIMARY KEY,
  orcamento_id      INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  produto_id        INTEGER REFERENCES produtos(id),
  produto_nome      VARCHAR(255),     -- fallback quando produto não está no catálogo
  ambiente          VARCHAR(120),
  largura           NUMERIC(7,3),
  altura            NUMERIC(7,3),
  quantidade        NUMERIC(10,3) NOT NULL DEFAULT 1,
  unidade           VARCHAR(10) DEFAULT 'un',
  cor               VARCHAR(120),
  referencia        VARCHAR(120),
  especificacoes    JSONB DEFAULT '{}',
  preco_unitario    NUMERIC(12,2),
  valor_total_item  NUMERIC(12,2),
  ordem             INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orc_itens_orcamento ON orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_orc_itens_produto   ON orcamento_itens(produto_id);
