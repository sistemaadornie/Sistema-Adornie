ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS escritorio_id   INTEGER REFERENCES escritorios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS rua             VARCHAR(200),
  ADD COLUMN IF NOT EXISTS numero          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bairro          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cidade          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado          VARCHAR(2),
  ADD COLUMN IF NOT EXISTS cep             VARCHAR(12),
  ADD COLUMN IF NOT EXISTS comprou_optin   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS chave_pix       VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_arquitetos_escritorio ON arquitetos (escritorio_id);
