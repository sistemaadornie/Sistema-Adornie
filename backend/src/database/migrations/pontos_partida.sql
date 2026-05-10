ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_instalador BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco_padrao TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco_padrao_lat DOUBLE PRECISION;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco_padrao_lng DOUBLE PRECISION;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS pontos_partida_dia (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  data         DATE NOT NULL,
  label        TEXT,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, empresa_id, data)
);

CREATE TABLE IF NOT EXISTS enderecos_partida (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  label        TEXT NOT NULL,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
