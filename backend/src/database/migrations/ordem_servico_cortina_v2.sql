-- Migration: Adicionar campos de dados técnicos para Ordem de Serviço por produto
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'cortina',
  ADD COLUMN IF NOT EXISTS dados_tecnicos JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preenchido_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preenchido_por INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_os_tipo ON ordem_servico(tipo);
