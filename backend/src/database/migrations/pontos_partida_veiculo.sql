CREATE TABLE IF NOT EXISTS enderecos_partida_veiculo (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  veiculo_id   INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epv_veiculo ON enderecos_partida_veiculo(veiculo_id);

CREATE TABLE IF NOT EXISTS pontos_partida_dia_veiculo (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  veiculo_id   INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data         DATE NOT NULL,
  label        TEXT,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  usar_padrao  BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, veiculo_id, data)
);

CREATE INDEX IF NOT EXISTS idx_ppdv_veiculo_data ON pontos_partida_dia_veiculo(veiculo_id, data);
