-- Logos persistentes para o gerador de etiquetas
CREATE TABLE IF NOT EXISTS etiqueta_logos (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome       VARCHAR(100) NOT NULL,
  url        TEXT NOT NULL,
  public_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etiqueta_logos_empresa ON etiqueta_logos(empresa_id);
