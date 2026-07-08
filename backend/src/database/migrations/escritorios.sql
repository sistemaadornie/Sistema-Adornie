CREATE TABLE IF NOT EXISTS escritorios (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  nome          VARCHAR(200) NOT NULL,
  cnpj          VARCHAR(25),
  telefone      VARCHAR(30),
  email         VARCHAR(150),
  rua           VARCHAR(200),
  numero        VARCHAR(20),
  complemento   VARCHAR(100),
  bairro        VARCHAR(100),
  cidade        VARCHAR(100),
  estado        VARCHAR(2),
  cep           VARCHAR(12),
  comprou_optin VARCHAR(50),
  chave_pix     VARCHAR(150),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escritorios_empresa ON escritorios (empresa_id);
CREATE INDEX IF NOT EXISTS idx_escritorios_deleted ON escritorios (deleted_at) WHERE deleted_at IS NULL;
