CREATE TABLE IF NOT EXISTS crews (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  data         DATE    NOT NULL,
  nome         TEXT,
  veiculo_id   INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crew_membros (
  crew_id    INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL,
  PRIMARY KEY (crew_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS crew_agendamentos (
  crew_id        INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  agendamento_id INTEGER NOT NULL,
  PRIMARY KEY (crew_id, agendamento_id)
);

ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade INTEGER DEFAULT 999;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS demanda INTEGER DEFAULT 1;
