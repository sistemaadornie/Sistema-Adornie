ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS consultor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_arquitetos_consultor ON arquitetos (consultor_id);
