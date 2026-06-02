-- agendamentos_aprovacao.sql
-- Workflow de aprovação de urgência para agendamentos de Instalação.
-- Usa o próprio agendamentos.status (novos valores 'pendente_aprovacao' e 'rejeitado').
-- Idempotente.

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS status_pretendido        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS motivo_urgencia          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao          TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_em             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovacao_solicitada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovacao_data_minima    DATE,
  ADD COLUMN IF NOT EXISTS aprovacao_dias_faltantes INTEGER;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pendente_aprovacao
  ON agendamentos(empresa_id)
  WHERE status = 'pendente_aprovacao';
