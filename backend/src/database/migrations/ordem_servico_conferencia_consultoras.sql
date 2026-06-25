-- ordem_servico_conferencia_consultoras.sql
-- Ficha de Conferência Consultoras: preenchida pela consultora na Etapa 1,
-- antes de qualquer agendamento/visita técnica. Mesmos campos da Ficha de
-- Confecção (dados_confeccao), só que numa etapa anterior.
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_conferencia_consultoras JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_por INTEGER REFERENCES usuarios(id);
