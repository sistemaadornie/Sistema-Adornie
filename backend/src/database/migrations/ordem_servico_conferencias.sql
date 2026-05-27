-- Dupla conferência (consultora + técnico) e integração com Google Drive

-- Campos de conferência da consultora
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS conferencia_consultora_usuario_id INTEGER REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS conferencia_consultora_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conferencia_consultora_obs        TEXT;

-- Campos de conferência do técnico
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS conferencia_tecnico_usuario_id    INTEGER REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS conferencia_tecnico_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conferencia_tecnico_obs           TEXT;

-- Pasta do Drive específica desta OS
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS drive_folder_id                   VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_os_conf_consultora ON ordem_servico(conferencia_consultora_usuario_id);
CREATE INDEX IF NOT EXISTS idx_os_conf_tecnico    ON ordem_servico(conferencia_tecnico_usuario_id);

-- Etapa da foto: classifica se foi tirada na conf. consultora, técnico ou instalação
ALTER TABLE pedido_midias
  ADD COLUMN IF NOT EXISTS etapa VARCHAR(40)
    CHECK (etapa IN ('conferencia_consultora','conferencia_tecnico','instalacao'));

CREATE INDEX IF NOT EXISTS idx_midias_etapa ON pedido_midias(etapa);
