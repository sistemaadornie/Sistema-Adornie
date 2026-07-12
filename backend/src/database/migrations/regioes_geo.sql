CREATE TABLE regioes_geo (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('bairro','cidade')),
  chave VARCHAR(120) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  cidade VARCHAR(120),
  estado VARCHAR(2),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  geocod_falhou BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, tipo, chave)
);

CREATE INDEX idx_regioes_geo_busca ON regioes_geo (empresa_id, tipo, chave);
