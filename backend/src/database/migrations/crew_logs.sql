CREATE TABLE IF NOT EXISTS crew_logs (
  id           SERIAL PRIMARY KEY,
  crew_id      INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  acao         TEXT NOT NULL,
  detalhes     JSONB,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crew_logs_crew ON crew_logs (crew_id, criado_em DESC);
