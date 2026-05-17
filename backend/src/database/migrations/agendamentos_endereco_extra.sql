-- ============================================================
-- Adiciona campos de endereço detalhado, duração e pessoa obrigatória
-- Cole no SQL Editor do Supabase e execute.
-- ============================================================

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS cep                   VARCHAR(9);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS rua                   TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS numero                TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS complemento           TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS bairro                TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS cidade                TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS estado                CHAR(2);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao_minutos       INTEGER;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS pessoa_obrigatoria_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
