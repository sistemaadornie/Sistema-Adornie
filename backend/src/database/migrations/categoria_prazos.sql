-- categoria_prazos.sql
-- Tabela para armazenar as parametrizações de tempo mínimo por categoria de produto e por empresa

CREATE TABLE IF NOT EXISTS categoria_prazos (
  id                      SERIAL PRIMARY KEY,
  empresa_id              INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria_id            INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  logistica_interna_dias  INTEGER NOT NULL DEFAULT 2,
  confeccao_dias          INTEGER NOT NULL DEFAULT 10,
  expedicao_dias          INTEGER NOT NULL DEFAULT 3,
  outros_dias             INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_categoria_prazos_emp_cat ON categoria_prazos(empresa_id, categoria_id);
