-- ============================================================================
-- Pipeline de Projetos - Sistema Adornie
-- Tabelas para gerenciamento de projetos, items, histórico e estoque
-- ============================================================================

-- Tabela 1: pipeline_projetos
-- Controla o ciclo de vida completo de cada projeto
CREATE TABLE IF NOT EXISTS pipeline_projetos (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL,
  numero            VARCHAR(30) NOT NULL UNIQUE,       -- PROJ-0001
  titulo            VARCHAR(255) NOT NULL,
  cliente_id        INTEGER REFERENCES clientes(id),
  orcamento_id      INTEGER,
  pedido_id         INTEGER REFERENCES pedidos(id),
  agendamento_id    INTEGER REFERENCES agendamentos(id),
  etapa             VARCHAR(40) NOT NULL DEFAULT 'orcamento',
  requer_confeccao  BOOLEAN NOT NULL DEFAULT FALSE,
  prazo_entrega     DATE,
  valor_estimado    NUMERIC(12,2),
  prioridade        VARCHAR(10) DEFAULT 'normal',  -- baixa | normal | alta | urgente
  observacoes       TEXT,
  criado_por        INTEGER,
  criado_por_nome   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- Tabela 2: pipeline_itens
-- Items que compõem cada projeto
CREATE TABLE IF NOT EXISTS pipeline_itens (
  id                    SERIAL PRIMARY KEY,
  projeto_id            INTEGER NOT NULL REFERENCES pipeline_projetos(id),
  produto_id            INTEGER REFERENCES produtos(id),
  descricao             TEXT NOT NULL,
  ambiente              VARCHAR(150),
  quantidade            NUMERIC(10,2) DEFAULT 1,
  valor_unit            NUMERIC(12,2) DEFAULT 0,
  tipo_disponibilidade  VARCHAR(30) DEFAULT 'estoque',
  -- estoque | sob_demanda_fornecedor | sob_demanda_material
  requer_confeccao      BOOLEAN DEFAULT FALSE,
  fornecedor_id         INTEGER REFERENCES fornecedores(id),
  prazo_previsto        DATE,
  status_item           VARCHAR(30) DEFAULT 'pendente',
  -- pendente | pedido | chegou_loja | em_confeccao | confeccionado | pronto
  chegada_real          TIMESTAMPTZ,
  marcado_por           INTEGER,
  observacao            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela 3: pipeline_historico
-- Rastreamento de mudanças e eventos no projeto
CREATE TABLE IF NOT EXISTS pipeline_historico (
  id              SERIAL PRIMARY KEY,
  projeto_id      INTEGER NOT NULL REFERENCES pipeline_projetos(id),
  tipo            VARCHAR(30) NOT NULL DEFAULT 'avanco',
  -- avanco | reencaminhamento | comentario | item_chegou | agendamento_confirmado
  etapa_anterior  VARCHAR(40),
  etapa_nova      VARCHAR(40),
  observacao      TEXT,
  usuario_id      INTEGER,
  usuario_nome    TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela 4: pipeline_estoque_entradas
-- Registro de entradas de estoque relacionadas aos projetos
CREATE TABLE IF NOT EXISTS pipeline_estoque_entradas (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL,
  projeto_id      INTEGER REFERENCES pipeline_projetos(id),
  item_id         INTEGER REFERENCES pipeline_itens(id),
  produto_id      INTEGER REFERENCES produtos(id),
  descricao       TEXT,
  quantidade      NUMERIC(10,2),
  registrado_por  INTEGER,
  registrado_em   TIMESTAMPTZ DEFAULT NOW(),
  observacao      TEXT
);

-- Tabela 5: pipeline_config
-- Configurações por empresa para prazos e alertas
CREATE TABLE IF NOT EXISTS pipeline_config (
  id                      SERIAL PRIMARY KEY,
  empresa_id              INTEGER NOT NULL UNIQUE,
  prazo_agendamento_dias  INTEGER DEFAULT 7,
  prazo_confeccao_dias    INTEGER DEFAULT 14,
  prazo_sob_demanda_dias  INTEGER DEFAULT 21,
  alertar_dias_antes      INTEGER DEFAULT 2,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Índices para otimização de queries
-- ============================================================================

-- pipeline_projetos
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_empresa   ON pipeline_projetos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_etapa     ON pipeline_projetos (etapa);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_cliente   ON pipeline_projetos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_pedido    ON pipeline_projetos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_deleted   ON pipeline_projetos (deleted_at) WHERE deleted_at IS NULL;

-- pipeline_itens
CREATE INDEX IF NOT EXISTS idx_pipeline_itens_projeto      ON pipeline_itens (projeto_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_itens_status       ON pipeline_itens (status_item);
CREATE INDEX IF NOT EXISTS idx_pipeline_itens_disponib     ON pipeline_itens (tipo_disponibilidade);

-- pipeline_historico
CREATE INDEX IF NOT EXISTS idx_pipeline_hist_projeto       ON pipeline_historico (projeto_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_hist_tipo          ON pipeline_historico (tipo);

-- pipeline_estoque_entradas
CREATE INDEX IF NOT EXISTS idx_pipeline_estoque_empresa    ON pipeline_estoque_entradas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_estoque_projeto    ON pipeline_estoque_entradas (projeto_id);
