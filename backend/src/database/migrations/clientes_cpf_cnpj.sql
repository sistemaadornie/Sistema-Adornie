ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cpf  VARCHAR(14);

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cnpj VARCHAR(18);

CREATE INDEX IF NOT EXISTS idx_clientes_cpf
  ON clientes(empresa_id, cpf)  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_cnpj
  ON clientes(empresa_id, cnpj) WHERE deleted_at IS NULL;
