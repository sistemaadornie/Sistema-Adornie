CREATE TABLE IF NOT EXISTS work_schedules (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  dias        JSONB NOT NULL DEFAULT '[]',
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crews ADD COLUMN IF NOT EXISTS work_schedule_id INTEGER REFERENCES work_schedules(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS work_schedule_id INTEGER REFERENCES work_schedules(id) ON DELETE SET NULL;
