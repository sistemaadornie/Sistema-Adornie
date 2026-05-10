-- ============================================================
-- SCHEMA COMPLETO — Sistema Liuu
-- Cole este script no SQL Editor do Supabase e execute.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. LIMPEZA (remove qualquer versão anterior parcial)
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS pontos_partida_dia_veiculo  CASCADE;
DROP TABLE IF EXISTS enderecos_partida_veiculo   CASCADE;
DROP TABLE IF EXISTS enderecos_partida           CASCADE;
DROP TABLE IF EXISTS pontos_partida_dia          CASCADE;
DROP TABLE IF EXISTS notificacoes                CASCADE;
DROP TABLE IF EXISTS crew_agendamentos           CASCADE;
DROP TABLE IF EXISTS crew_membros                CASCADE;
DROP TABLE IF EXISTS crews                       CASCADE;
DROP TABLE IF EXISTS agendamento_logs            CASCADE;
DROP TABLE IF EXISTS agendamento_sugestoes       CASCADE;
DROP TABLE IF EXISTS agendamento_anexos          CASCADE;
DROP TABLE IF EXISTS agendamento_itens           CASCADE;
DROP TABLE IF EXISTS agendamento_equipe          CASCADE;
DROP TABLE IF EXISTS agendamentos                CASCADE;
DROP TABLE IF EXISTS cliente_enderecos           CASCADE;
DROP TABLE IF EXISTS clientes                    CASCADE;
DROP TABLE IF EXISTS abastecimentos              CASCADE;
DROP TABLE IF EXISTS security_logs               CASCADE;
DROP TABLE IF EXISTS password_reset_tokens       CASCADE;
DROP TABLE IF EXISTS refresh_tokens              CASCADE;
DROP TABLE IF EXISTS usuario_permissoes          CASCADE;
DROP TABLE IF EXISTS usuarios                    CASCADE;
DROP TABLE IF EXISTS work_schedules              CASCADE;
DROP TABLE IF EXISTS veiculos                    CASCADE;
DROP TABLE IF EXISTS permissoes                  CASCADE;
DROP TABLE IF EXISTS setores                     CASCADE;
DROP TABLE IF EXISTS empresas                    CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 1. EMPRESAS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id            SERIAL PRIMARY KEY,
  nome_fantasia TEXT        NOT NULL,
  razao_social  TEXT,
  cnpj          VARCHAR(14) UNIQUE,
  email         TEXT,
  telefone      TEXT,
  plano         VARCHAR(50) NOT NULL DEFAULT 'basico',
  status        VARCHAR(20) NOT NULL DEFAULT 'ativa',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2. SETORES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS setores (
  id         SERIAL PRIMARY KEY,
  nome       TEXT    NOT NULL,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3. PERMISSÕES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissoes (
  id            SERIAL PRIMARY KEY,
  codigo        TEXT UNIQUE,
  nome          TEXT,
  nome_exibicao TEXT,
  descricao     TEXT,
  modulo        TEXT,
  ordem         INTEGER,
  ativo         BOOLEAN DEFAULT TRUE
);

-- Seed: permissões canônicas do sistema
INSERT INTO permissoes (codigo, nome, nome_exibicao, descricao, modulo, ordem, ativo) VALUES
  ('AGENDAMENTO_INSTALADOR', 'AGENDAMENTO_INSTALADOR', 'Instalador',             'Acessa e executa os agendamentos em que está escalado.',                                      'Campo',          1, TRUE),
  ('VENDEDOR',               'VENDEDOR',               'Vendedor / Comercial',   'Cria e gerencia clientes e os próprios agendamentos.',                                        'Operação',       2, TRUE),
  ('OPERADOR_AGENDA',        'OPERADOR_AGENDA',        'Operador de Agenda',     'Gerencia toda a operação: agendamentos, clientes e veículos. Pode aprovar usuários.',         'Operação',       3, TRUE),
  ('USUARIO_APROVAR',        'USUARIO_APROVAR',        'Aprovar Usuários',       'Aprova novos usuários pendentes e altera seus setores.',                                      'Administração',  4, TRUE),
  ('USUARIO_ATRIBUIR_PERMISSOES', 'USUARIO_ATRIBUIR_PERMISSOES', 'Gerenciar Permissões', 'Atribui permissões, reseta senhas e bloqueia/desbloqueia usuários.',               'Administração',  5, TRUE),
  ('ADMIN_MASTER',           'ADMIN_MASTER',           'Admin Master',           'Acesso total ao sistema.',                                                                    'Administração',  6, TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. VEÍCULOS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS veiculos (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER     NOT NULL,
  nome              TEXT        NOT NULL,
  placa             TEXT,
  tipo              TEXT        DEFAULT 'carro',
  combustivel       TEXT        DEFAULT 'flex',
  media_km_l        NUMERIC(6,2),
  capacidade        INTEGER     DEFAULT 999,
  capacidade_tanque NUMERIC(8,2),
  foto_url          TEXT,
  observacoes       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- 5. HORÁRIOS DE TRABALHO
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_schedules (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  nome       TEXT    NOT NULL,
  descricao  TEXT,
  dias       JSONB   NOT NULL DEFAULT '[]',
  ativo      BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 6. USUÁRIOS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                  SERIAL PRIMARY KEY,
  email               TEXT        NOT NULL UNIQUE,
  senha               TEXT        NOT NULL,
  nome_completo       TEXT        NOT NULL,
  cpf                 VARCHAR(11) UNIQUE,
  setor_id            INTEGER     REFERENCES setores(id) ON DELETE SET NULL,
  empresa_id          INTEGER     NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  status              VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | aprovado | bloqueado
  foto_url            TEXT,
  solicitar_reset     BOOLEAN     DEFAULT FALSE,
  is_instalador       BOOLEAN     DEFAULT FALSE,
  endereco_padrao     TEXT,
  endereco_padrao_lat DOUBLE PRECISION,
  endereco_padrao_lng DOUBLE PRECISION,
  veiculo_id          INTEGER     REFERENCES veiculos(id) ON DELETE SET NULL,
  work_schedule_id    INTEGER     REFERENCES work_schedules(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 7. PERMISSÕES DE USUÁRIO
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuario_permissoes (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permissao_id INTEGER NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, permissao_id)
);

-- ─────────────────────────────────────────────────────────────
-- 8. TOKENS DE AUTENTICAÇÃO
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INTEGER     NOT NULL UNIQUE,
  token_hash         TEXT        NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  ip_criacao         TEXT,
  user_agent_criacao TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 9. LOGS DE SEGURANÇA
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_logs (
  id         SERIAL PRIMARY KEY,
  tipo       TEXT        NOT NULL,
  ip         TEXT,
  usuario_id INTEGER,
  detalhes   JSONB,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 10. ABASTECIMENTOS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abastecimentos (
  id             SERIAL PRIMARY KEY,
  empresa_id     INTEGER      NOT NULL,
  veiculo_id     INTEGER      NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data           DATE         NOT NULL DEFAULT CURRENT_DATE,
  km_atual       NUMERIC(10,1),
  litros         NUMERIC(8,2),
  valor_total    NUMERIC(10,2),
  combustivel    TEXT,
  posto_nome     TEXT,
  registrado_por INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
  observacoes    TEXT,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 11. CLIENTES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER     NOT NULL,
  nome       TEXT        NOT NULL,
  telefone   TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cliente_enderecos (
  id          SERIAL PRIMARY KEY,
  cliente_id  INTEGER     NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  categoria   TEXT        DEFAULT 'residencial',
  rua         TEXT,
  numero      TEXT,
  complemento TEXT,
  bairro      TEXT,
  cidade      TEXT,
  estado      CHAR(2),
  cep         VARCHAR(9),
  referencia  TEXT,
  is_padrao   BOOLEAN     DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────
-- 12. AGENDAMENTOS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agendamentos (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER      NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo        VARCHAR(255) NOT NULL,
  cliente       VARCHAR(255) NOT NULL,
  cliente_id    INTEGER      REFERENCES clientes(id) ON DELETE SET NULL,
  tipo          VARCHAR(80)  NOT NULL DEFAULT 'Instalação',
  data          DATE         NOT NULL,
  hora          TIME         NOT NULL,
  endereco      TEXT,
  descricao     TEXT,
  observacoes   TEXT,
  status        VARCHAR(50)  NOT NULL DEFAULT 'agendado',
  -- agendado | aguardando | andamento | concluido | nao_concluido | cancelado | retorno | atrasado
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  km_rota       NUMERIC(8,2),
  geocod_falhou BOOLEAN      DEFAULT FALSE,
  demanda       INTEGER      DEFAULT 1,
  criado_por    INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TIMESTAMPTZ  DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamento_equipe (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome_snapshot  TEXT,
  UNIQUE(agendamento_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS agendamento_itens (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER      NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  nome           VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS agendamento_anexos (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER      NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  nome           VARCHAR(255) NOT NULL,
  url            TEXT         NOT NULL,
  tipo           VARCHAR(50),  -- foto_antes | foto_depois | documento
  enviado_por    INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamento_sugestoes (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER     NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  usuario_id     INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo           VARCHAR(50) NOT NULL,  -- horario | data | rota | agenda
  descricao      TEXT        NOT NULL,
  status         VARCHAR(50) DEFAULT 'pendente',  -- pendente | aprovada | rejeitada
  resposta       TEXT,
  respondido_por INTEGER     REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ DEFAULT NOW(),
  respondido_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agendamento_logs (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER     NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  empresa_id     INTEGER     NOT NULL,
  usuario_id     INTEGER,
  usuario_nome   TEXT,
  acao           TEXT        NOT NULL,
  detalhes       JSONB,
  criado_em      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 13. CREWS (EQUIPES DO DIA)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crews (
  id               SERIAL PRIMARY KEY,
  empresa_id       INTEGER NOT NULL,
  data             DATE    NOT NULL,
  nome             TEXT,
  veiculo_id       INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  work_schedule_id INTEGER REFERENCES work_schedules(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
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

-- ─────────────────────────────────────────────────────────────
-- 14. NOTIFICAÇÕES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id             SERIAL PRIMARY KEY,
  empresa_id     INTEGER     NOT NULL,
  usuario_id     INTEGER,
  agendamento_id INTEGER     REFERENCES agendamentos(id) ON DELETE SET NULL,
  tipo           VARCHAR(60) NOT NULL DEFAULT 'sistema',
  titulo         TEXT        NOT NULL,
  mensagem       TEXT,
  link           TEXT,
  icone          VARCHAR(20) NOT NULL DEFAULT 'info',
  lida           BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 15. PONTOS DE PARTIDA
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pontos_partida_dia (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER          NOT NULL,
  empresa_id INTEGER          NOT NULL,
  data       DATE             NOT NULL,
  label      TEXT,
  endereco   TEXT             NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ      DEFAULT NOW(),
  UNIQUE(usuario_id, empresa_id, data)
);

CREATE TABLE IF NOT EXISTS enderecos_partida (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER          NOT NULL,
  empresa_id INTEGER          NOT NULL,
  label      TEXT             NOT NULL,
  endereco   TEXT             NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ      DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enderecos_partida_veiculo (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER          NOT NULL,
  veiculo_id INTEGER          NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  label      TEXT             NOT NULL,
  endereco   TEXT             NOT NULL,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ      DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pontos_partida_dia_veiculo (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER          NOT NULL,
  veiculo_id  INTEGER          NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data        DATE             NOT NULL,
  label       TEXT,
  endereco    TEXT             NOT NULL,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  usar_padrao BOOLEAN          DEFAULT FALSE,
  created_at  TIMESTAMPTZ      DEFAULT NOW(),
  UNIQUE(empresa_id, veiculo_id, data)
);

-- ─────────────────────────────────────────────────────────────
-- 16. ÍNDICES DE PERFORMANCE
-- ─────────────────────────────────────────────────────────────

-- empresas / setores / usuários
CREATE INDEX IF NOT EXISTS idx_usuarios_email    ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa  ON usuarios(empresa_id, status);

-- clientes
CREATE INDEX IF NOT EXISTS idx_clientes_empresa      ON clientes(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nome ON clientes(empresa_id, nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_end_cliente        ON cliente_enderecos(cliente_id) WHERE deleted_at IS NULL;

-- agendamentos
CREATE INDEX IF NOT EXISTS idx_agendamentos_empresa    ON agendamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data       ON agendamentos(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status     ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_id ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_coords     ON agendamentos(lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ag_empresa_data         ON agendamentos(empresa_id, data, hora);
CREATE INDEX IF NOT EXISTS idx_ag_empresa_status       ON agendamentos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_ag_criado_por           ON agendamentos(criado_por);

-- agendamento_equipe
CREATE INDEX IF NOT EXISTS idx_ag_equipe_agendamento ON agendamento_equipe(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_equipe_usuario      ON agendamento_equipe(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ae_agendamento         ON agendamento_equipe(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ae_usuario             ON agendamento_equipe(usuario_id);

-- agendamento_itens / anexos / sugestões / logs
CREATE INDEX IF NOT EXISTS idx_ag_anexos_agendamento    ON agendamento_anexos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_sugestoes_agendamento ON agendamento_sugestoes(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ai_agendamento           ON agendamento_itens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_aa_agendamento           ON agendamento_anexos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_logs_ag_data          ON agendamento_logs(agendamento_id, criado_em DESC);

-- notificações
CREATE INDEX IF NOT EXISTS idx_notif_empresa      ON notificacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notif_usuario      ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_lida         ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_notif_agendamento  ON notificacoes(agendamento_id) WHERE agendamento_id IS NOT NULL;

-- crews
CREATE INDEX IF NOT EXISTS idx_crew_empresa_data    ON crews(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_crew_ag_crew          ON crew_agendamentos(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_ag_agendamento   ON crew_agendamentos(agendamento_id);

-- abastecimentos
CREATE INDEX IF NOT EXISTS idx_abast_empresa_data ON abastecimentos(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_abast_veiculo       ON abastecimentos(veiculo_id);

-- refresh_tokens / security_logs
CREATE INDEX IF NOT EXISTS idx_rt_usuario   ON refresh_tokens(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sl_tipo      ON security_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_sl_criado    ON security_logs(criado_em DESC);

-- pontos de partida de veículo
CREATE INDEX IF NOT EXISTS idx_epv_veiculo      ON enderecos_partida_veiculo(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_ppdv_veiculo_data ON pontos_partida_dia_veiculo(veiculo_id, data);
