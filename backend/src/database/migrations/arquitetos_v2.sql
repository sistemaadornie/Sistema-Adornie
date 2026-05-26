-- Novos campos no cadastro de arquitetos
ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS tipo_pessoa   VARCHAR(2),
  ADD COLUMN IF NOT EXISTS cpf_cnpj      VARCHAR(25),
  ADD COLUMN IF NOT EXISTS outro_telefone VARCHAR(30);
