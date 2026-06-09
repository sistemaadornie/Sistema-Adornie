-- Etapa 5: campo para pesquisa de satisfação (pós-conclusão)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS pesquisa_satisfacao TEXT;
