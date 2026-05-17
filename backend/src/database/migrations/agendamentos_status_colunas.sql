-- ============================================================
-- Adiciona colunas de controle de execução em agendamentos
-- Cole no SQL Editor do Supabase e execute.
-- ============================================================

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS iniciado_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS iniciado_por       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concluido_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluido_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observacoes_status TEXT;
