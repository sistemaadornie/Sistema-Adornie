-- Adiciona flag de confecção ao catálogo de produtos/serviços
-- Necessário para o Kanban de Fluxo de Vendas detectar projetos que requerem confecção
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS eh_confeccao BOOLEAN NOT NULL DEFAULT FALSE;
