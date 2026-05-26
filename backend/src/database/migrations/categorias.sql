CREATE TABLE IF NOT EXISTS categorias (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  nome       VARCHAR(100) NOT NULL,
  cor        VARCHAR(20)  DEFAULT '#C9A96E',
  ordem      INTEGER      DEFAULT 0,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_nome ON categorias (empresa_id, nome);
CREATE INDEX IF NOT EXISTS idx_categorias_empresa ON categorias (empresa_id);
