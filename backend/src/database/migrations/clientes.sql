CREATE TABLE IF NOT EXISTS clientes (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  nome        TEXT NOT NULL,
  telefone    TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cliente_enderecos (
  id           SERIAL PRIMARY KEY,
  cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
  label        TEXT NOT NULL,
  categoria    TEXT DEFAULT 'residencial',
  rua          TEXT,
  numero       TEXT,
  complemento  TEXT,
  bairro       TEXT,
  cidade       TEXT,
  estado       CHAR(2),
  cep          VARCHAR(9),
  referencia   TEXT,
  is_padrao    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
