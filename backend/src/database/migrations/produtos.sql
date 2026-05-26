-- Tabela de produtos e serviços do catálogo
CREATE TABLE IF NOT EXISTS produtos (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  codigo       VARCHAR(50),
  referencia   VARCHAR(100),
  tipo         VARCHAR(20)  NOT NULL DEFAULT 'produto',   -- produto | servico
  nome         VARCHAR(255) NOT NULL,
  descricao    TEXT,
  marca        VARCHAR(100),
  categoria    VARCHAR(100),
  unidade      VARCHAR(20)  DEFAULT 'un',
  preco_custo  NUMERIC(12,2) DEFAULT 0,
  preco_venda  NUMERIC(12,2) DEFAULT 0,
  estoque      NUMERIC(10,3) DEFAULT 0,
  status       VARCHAR(20)  NOT NULL DEFAULT 'ativo',     -- ativo | inativo
  foto_url     TEXT,
  criado_por   INTEGER,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  eh_confeccao BOOLEAN NOT NULL DEFAULT FALSE   -- true = item é serviço de confecção
);

CREATE INDEX IF NOT EXISTS idx_produtos_empresa   ON produtos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_produtos_tipo      ON produtos (tipo);
CREATE INDEX IF NOT EXISTS idx_produtos_status    ON produtos (status);
CREATE INDEX IF NOT EXISTS idx_produtos_marca     ON produtos (marca);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos (categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo    ON produtos (empresa_id, codigo);
 