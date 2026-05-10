-- Adiciona coordenadas geográficas aos agendamentos
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_agendamentos_coords ON agendamentos(lat, lng) WHERE lat IS NOT NULL;
