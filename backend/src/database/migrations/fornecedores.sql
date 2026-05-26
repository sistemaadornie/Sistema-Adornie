-- Tabela de fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER      NOT NULL,
  nome            VARCHAR(255) NOT NULL,
  tipo            VARCHAR(5)   NOT NULL DEFAULT 'PJ',   -- PJ | PF
  cnpj            VARCHAR(20),
  cpf             VARCHAR(14),
  email           VARCHAR(255),
  telefone        VARCHAR(30),
  whatsapp        VARCHAR(30),
  contato         VARCHAR(150),   -- nome da pessoa de contato
  website         VARCHAR(255),
  categoria       VARCHAR(100),
  endereco        VARCHAR(255),
  numero          VARCHAR(20),
  complemento     VARCHAR(100),
  bairro          VARCHAR(100),
  cidade          VARCHAR(100),
  estado          CHAR(2),
  cep             VARCHAR(9),
  observacoes     TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'ativo',  -- ativo | inativo
  criado_por      INTEGER,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_empresa   ON fornecedores (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_status    ON fornecedores (status);
CREATE INDEX IF NOT EXISTS idx_fornecedores_categoria ON fornecedores (categoria);
CREATE INDEX IF NOT EXISTS idx_fornecedores_tipo      ON fornecedores (tipo);

-- Vincula fornecedor aos orçamentos de compra
ALTER TABLE crm_orcamentos ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL;

-- Vincula fornecedor aos lançamentos financeiros (contas a pagar)
ALTER TABLE crm_financeiro ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_orcamentos_fornecedor ON crm_orcamentos (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_crm_financeiro_fornecedor ON crm_financeiro (fornecedor_id);
