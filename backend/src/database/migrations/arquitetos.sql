-- Tabela de Arquitetos
CREATE TABLE IF NOT EXISTS arquitetos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  nome        VARCHAR(150) NOT NULL,
  telefone    VARCHAR(30),
  email       VARCHAR(150),
  escritorio  VARCHAR(200),
  cau         VARCHAR(30),
  observacoes TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arquitetos_empresa ON arquitetos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_arquitetos_deleted ON arquitetos (deleted_at) WHERE deleted_at IS NULL;

-- Vínculos nas tabelas existentes
ALTER TABLE clientes        ADD COLUMN IF NOT EXISTS arquiteto_id INTEGER REFERENCES arquitetos(id);
ALTER TABLE crm_orcamentos  ADD COLUMN IF NOT EXISTS arquiteto_id INTEGER REFERENCES arquitetos(id);
ALTER TABLE crm_orcamentos  ADD COLUMN IF NOT EXISTS vendedora_id INTEGER;  -- id do usuario
ALTER TABLE pipeline_projetos ADD COLUMN IF NOT EXISTS arquiteto_id   INTEGER REFERENCES arquitetos(id);
ALTER TABLE pipeline_projetos ADD COLUMN IF NOT EXISTS arquiteto_nome TEXT;
ALTER TABLE pipeline_projetos ADD COLUMN IF NOT EXISTS vendedora_id   INTEGER;
ALTER TABLE pipeline_projetos ADD COLUMN IF NOT EXISTS vendedora_nome TEXT;
