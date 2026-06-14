-- categorias_necessita_conferencia.sql
-- Marca categorias cujos itens exigem uma visita de conferência agendada
-- antes de definir a data de entrega/instalação do pedido.

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS necessita_conferencia BOOLEAN NOT NULL DEFAULT false;
