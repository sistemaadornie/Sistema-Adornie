-- Adiciona endereço de entrega opcional ao orçamento (JSONB: {rua,numero,complemento,bairro,cidade,estado,cep})
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS endereco_entrega JSONB;
