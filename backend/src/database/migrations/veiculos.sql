CREATE TABLE IF NOT EXISTS veiculos (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  nome         TEXT NOT NULL,
  placa        TEXT,
  tipo         TEXT DEFAULT 'carro',
  combustivel  TEXT DEFAULT 'flex',
  media_km_l   NUMERIC(6,2),
  foto_url     TEXT,
  observacoes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS abastecimentos (
  id             SERIAL PRIMARY KEY,
  empresa_id     INTEGER NOT NULL,
  veiculo_id     INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  km_atual       NUMERIC(10,1),
  litros         NUMERIC(8,2),
  valor_total    NUMERIC(10,2),
  combustivel    TEXT,
  posto_nome     TEXT,
  registrado_por INTEGER,
  observacoes    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
