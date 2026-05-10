-- ============================================================
-- AGENDAMENTOS — migração
-- Rode este script no banco PostgreSQL do sistema
-- ============================================================

-- Tabela principal
CREATE TABLE IF NOT EXISTS agendamentos (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo        VARCHAR(255) NOT NULL,
  cliente       VARCHAR(255) NOT NULL,
  tipo          VARCHAR(80)  NOT NULL DEFAULT 'Instalação',
  data          DATE NOT NULL,
  hora          TIME NOT NULL,
  endereco      TEXT,
  descricao     TEXT,
  observacoes   TEXT,
  status        VARCHAR(50)  NOT NULL DEFAULT 'agendado',
  -- agendado | aguardando | andamento | concluido | nao_concluido | cancelado | retorno | atrasado
  criado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Equipe do agendamento (N:N usuarios)
CREATE TABLE IF NOT EXISTS agendamento_equipe (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE(agendamento_id, usuario_id)
);

-- Itens para levar
CREATE TABLE IF NOT EXISTS agendamento_itens (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  nome            VARCHAR(255) NOT NULL
);

-- Anexos (fotos antes/depois, documentos)
CREATE TABLE IF NOT EXISTS agendamento_anexos (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  nome            VARCHAR(255) NOT NULL,
  url             TEXT NOT NULL,
  tipo            VARCHAR(50),  -- foto_antes | foto_depois | documento
  enviado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em      TIMESTAMP DEFAULT NOW()
);

-- Sugestões dos instaladores
CREATE TABLE IF NOT EXISTS agendamento_sugestoes (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo            VARCHAR(50) NOT NULL,  -- horario | data | rota | agenda
  descricao       TEXT NOT NULL,
  status          VARCHAR(50) DEFAULT 'pendente',  -- pendente | aprovada | rejeitada
  resposta        TEXT,
  respondido_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TIMESTAMP DEFAULT NOW(),
  respondido_em   TIMESTAMP
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_agendamentos_empresa    ON agendamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data       ON agendamentos(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status     ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_ag_equipe_agendamento   ON agendamento_equipe(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_equipe_usuario       ON agendamento_equipe(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ag_anexos_agendamento   ON agendamento_anexos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_sugestoes_agendamento ON agendamento_sugestoes(agendamento_id);

-- Permissão nova (opcional — adicione ao seed de permissões)
-- INSERT INTO permissoes (codigo, nome_exibicao, descricao, modulo, ativo)
-- VALUES ('AGENDAMENTO_INSTALADOR', 'Instalador', 'Pode ser escalado em agendamentos', 'Agendamentos', true)
-- ON CONFLICT DO NOTHING;
