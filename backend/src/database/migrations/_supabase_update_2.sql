-- ============================================================================
-- ADORNIE SISTEMA — MIGRAÇÃO CONSOLIDADA #2
-- Gerado em 2026-06-10
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Cobre todas as migrations criadas após _supabase_update.sql (2026-05-25):
--   orcamentos_v1, orcamentos_v2, orcamentos_endereco, ordem_servico_cortina_v2,
--   ordem_servico_conferencias, pedido_itens_v3, pedido_itens_v4,
--   pedido_itens_categoria_id, pedido_itens_confeccao, pedido_item_vinculos,
--   agendamentos_hora_nullable, agendamento_itens_pedido_item,
--   agendamentos_aprovacao, dashboard_pedidos, categoria_prazos,
--   categorias_padrao_v2, pedido_anexos, pedido_auditoria, fluxo_5_etapas,
--   pedidos_pesquisa_satisfacao.
--
-- Idempotente — usa IF NOT EXISTS / ON CONFLICT em todas as operações,
-- pode ser executado novamente sem causar erro.
-- ============================================================================


-- ============================================================================
-- FASE 1 — ORÇAMENTOS (orcamentos_v1.sql)
-- ============================================================================

-- Orçamentos: cabeçalho do orçamento de venda (vinculado a cliente + consultora)
CREATE TABLE IF NOT EXISTS orcamentos (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL,
  cliente_id      INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  consultora_id   INTEGER REFERENCES usuarios(id),
  arquiteto_id    INTEGER REFERENCES arquitetos(id),
  numero          VARCHAR(50),       -- ex: ORC-00001 (gerado na app)
  status          VARCHAR(20) NOT NULL DEFAULT 'novo',
  -- 'novo' | 'aprovado' | 'cancelado'
  observacoes     TEXT,
  valor_total     NUMERIC(12,2),
  criado_por      INTEGER REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE SEQUENCE IF NOT EXISTS orcamentos_numero_seq;

CREATE INDEX IF NOT EXISTS idx_orcamentos_empresa    ON orcamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente    ON orcamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_consultora ON orcamentos(consultora_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status     ON orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_created_at ON orcamentos(created_at DESC);

-- Itens do orçamento: um por ambiente/produto
CREATE TABLE IF NOT EXISTS orcamento_itens (
  id                SERIAL PRIMARY KEY,
  orcamento_id      INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  produto_id        INTEGER REFERENCES produtos(id),
  produto_nome      VARCHAR(255),     -- fallback quando produto não está no catálogo
  ambiente          VARCHAR(120),
  largura           NUMERIC(7,3),
  altura            NUMERIC(7,3),
  quantidade        NUMERIC(10,3) NOT NULL DEFAULT 1,
  unidade           VARCHAR(10) DEFAULT 'un',
  cor               VARCHAR(120),
  referencia        VARCHAR(120),
  especificacoes    JSONB DEFAULT '{}',
  preco_unitario    NUMERIC(12,2),
  valor_total_item  NUMERIC(12,2),
  ordem             INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orc_itens_orcamento ON orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_orc_itens_produto   ON orcamento_itens(produto_id);


-- ============================================================================
-- FASE 2 — ORÇAMENTOS V2 (orcamentos_v2.sql)
-- ============================================================================

-- Campos de cabeçalho
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS taxar_nf       BOOLEAN DEFAULT false;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS de_onde_veio   TEXT;

-- Campos de pessoas
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS gerente_id     INTEGER REFERENCES usuarios(id);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS clube          TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS vendedor_id    INTEGER REFERENCES usuarios(id);

-- Custo dos itens (margem)
ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS custo_unitario  NUMERIC(12,2);
ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS custo_total_item NUMERIC(12,2);

-- Tabela de pagamentos/condições do orçamento
CREATE TABLE IF NOT EXISTS orcamento_pagamentos (
  id              SERIAL PRIMARY KEY,
  orcamento_id    INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  forma           VARCHAR(80),        -- DINHEIRO, BOLETO, PIX/DEPOSITO, etc.
  condicao        VARCHAR(120),       -- Condição (parcelas, prazo etc.)
  conta_bancaria  VARCHAR(120),       -- Conta bancária
  categoria       VARCHAR(120),       -- Categoria financeira
  centro_custo    VARCHAR(120),       -- Centro de custo
  num_doc         VARCHAR(60),        -- Nº do documento
  data_inicial    DATE,
  valor           NUMERIC(12,2),
  taxa            NUMERIC(5,2),       -- Taxa %
  ordem           INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orc_pagamentos_orcamento ON orcamento_pagamentos(orcamento_id);

-- Endereço de entrega detalhado (decomposto de JSONB para campos individuais)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_cep         VARCHAR(10);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_rua         TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_numero      VARCHAR(20);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_complemento TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_bairro      TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_cidade      TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS entrega_estado      VARCHAR(2);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS faturamento_diferente BOOLEAN DEFAULT false;


-- ============================================================================
-- FASE 3 — ENDEREÇO DE ENTREGA JSONB (orcamentos_endereco.sql)
-- ============================================================================

-- Adiciona endereço de entrega opcional ao orçamento (JSONB: {rua,numero,complemento,bairro,cidade,estado,cep})
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS endereco_entrega JSONB;


-- ============================================================================
-- FASE 4 — ORDEM DE SERVIÇO: DADOS TÉCNICOS (ordem_servico_cortina_v2.sql)
-- ============================================================================

-- Migration: Adicionar campos de dados técnicos para Ordem de Serviço por produto
ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'cortina',
  ADD COLUMN IF NOT EXISTS dados_tecnicos JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preenchido_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preenchido_por INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_os_tipo ON ordem_servico(tipo);


-- ============================================================================
-- FASE 5 — ORDEM DE SERVIÇO: DUPLA CONFERÊNCIA + DRIVE (ordem_servico_conferencias.sql)
-- ============================================================================

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


-- ============================================================================
-- FASE 6 — PEDIDO_ITENS V3 (modelo, especificações, vínculo) (pedido_itens_v3.sql)
-- ============================================================================

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS modelo             VARCHAR(120),
  ADD COLUMN IF NOT EXISTS especificacoes     JSONB,
  ADD COLUMN IF NOT EXISTS item_vinculado_id  INTEGER REFERENCES pedido_itens(id);


-- ============================================================================
-- FASE 7 — PEDIDO_ITENS V4 (largura/altura) (pedido_itens_v4.sql)
-- ============================================================================

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS largura  NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS altura   NUMERIC(10,4);


-- ============================================================================
-- FASE 8 — PEDIDO_ITENS: CATEGORIA (pedido_itens_categoria_id.sql)
-- ============================================================================

ALTER TABLE pedido_itens ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pedido_itens_categoria ON pedido_itens(categoria_id);


-- ============================================================================
-- FASE 9 — LIGAÇÃO PEDIDOS <-> ORÇAMENTOS + CONFECÇÃO (pedido_itens_confeccao.sql)
-- ============================================================================

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS orcamento_id INTEGER REFERENCES orcamentos(id);

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS orcamento_item_id    INTEGER REFERENCES orcamento_itens(id),
  ADD COLUMN IF NOT EXISTS tipo_disponibilidade VARCHAR(20)
    CHECK (tipo_disponibilidade IN ('estoque','pronta_entrega')),
  ADD COLUMN IF NOT EXISTS em_confeccao         BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pedidos_orcamento      ON pedidos(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_orc_item  ON pedido_itens(orcamento_item_id);


-- ============================================================================
-- FASE 10 — TABELA DE VÍNCULOS ENTRE ITENS (pedido_item_vinculos.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pedido_item_vinculos (
  id                SERIAL PRIMARY KEY,
  item_id           INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  item_vinculado_id INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  tipo_vinculo      VARCHAR(40) NOT NULL DEFAULT 'acessorio',
  UNIQUE (item_id, item_vinculado_id)
);

CREATE INDEX IF NOT EXISTS idx_piv_item           ON pedido_item_vinculos(item_id);
CREATE INDEX IF NOT EXISTS idx_piv_item_vinculado ON pedido_item_vinculos(item_vinculado_id);

-- Migra vínculos existentes (se a coluna ainda existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pedido_itens' AND column_name = 'item_vinculado_id' AND table_schema = 'public'
  ) THEN
    INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
    SELECT id, item_vinculado_id, 'acessorio'
    FROM pedido_itens
    WHERE item_vinculado_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE pedido_itens DROP COLUMN item_vinculado_id;
  END IF;
END $$;

-- Garante que nenhum item se vincule a si mesmo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_piv_no_self_ref'
  ) THEN
    ALTER TABLE pedido_item_vinculos
      ADD CONSTRAINT chk_piv_no_self_ref CHECK (item_id <> item_vinculado_id);
  END IF;
END $$;


-- ============================================================================
-- FASE 11 — AGENDAMENTOS: HORA OPCIONAL (agendamentos_hora_nullable.sql)
-- ============================================================================

ALTER TABLE agendamentos ALTER COLUMN hora DROP NOT NULL;


-- ============================================================================
-- FASE 12 — AGENDAMENTO_ITENS <-> PEDIDO_ITENS (agendamento_itens_pedido_item.sql)
-- ============================================================================

ALTER TABLE agendamento_itens ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_itens(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agendamento_itens_pedido_item ON agendamento_itens(pedido_item_id);


-- ============================================================================
-- FASE 13 — AGENDAMENTOS: APROVAÇÃO DE URGÊNCIA (agendamentos_aprovacao.sql)
-- ============================================================================

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS status_pretendido        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS motivo_urgencia          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao          TEXT,
  ADD COLUMN IF NOT EXISTS aprovado_por             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_em             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovacao_solicitada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aprovacao_data_minima    DATE,
  ADD COLUMN IF NOT EXISTS aprovacao_dias_faltantes INTEGER;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pendente_aprovacao
  ON agendamentos(empresa_id)
  WHERE status = 'pendente_aprovacao';


-- ============================================================================
-- FASE 14 — DASHBOARD DE PEDIDOS (dashboard_pedidos.sql)
-- ============================================================================

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS verificacao_ok   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categorizacao_ok BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_pedido_item ON agendamento_itens(pedido_item_id);

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS agendamento_pai_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_pai ON agendamentos(agendamento_pai_id);

INSERT INTO permissoes (nome, descricao) VALUES
  ('DASHBOARD_PEDIDOS_GERAL', 'Visualiza dashboard com pedidos de todas as consultoras')
ON CONFLICT DO NOTHING;


-- ============================================================================
-- FASE 15 — PRAZOS POR CATEGORIA (categoria_prazos.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS categoria_prazos (
  id                      SERIAL PRIMARY KEY,
  empresa_id              INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria_id            INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  logistica_interna_dias  INTEGER NOT NULL DEFAULT 2,
  confeccao_dias          INTEGER NOT NULL DEFAULT 10,
  expedicao_dias          INTEGER NOT NULL DEFAULT 3,
  outros_dias             INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_categoria_prazos_emp_cat ON categoria_prazos(empresa_id, categoria_id);


-- ============================================================================
-- FASE 16 — NOVAS CATEGORIAS PADRÃO (categorias_padrao_v2.sql)
-- ============================================================================

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Forros', '#7B68EE', 9
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'forros'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Motorização', '#C04A1A', 10
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'motorização'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Controles', '#20B2AA', 11
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'controles'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Almofadas', '#C0397A', 12
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'almofadas'
);


-- ============================================================================
-- FASE 17 — ANEXO PDF ORIGINAL DO PEDIDO (pedido_anexos.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pedido_anexos (
  id             SERIAL PRIMARY KEY,
  pedido_id      INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL,
  nome_arquivo   VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(50)  NOT NULL DEFAULT 'application/pdf',
  tamanho_bytes  INTEGER      NOT NULL,
  conteudo       BYTEA        NOT NULL,
  criado_por     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(pedido_id)
);

CREATE INDEX IF NOT EXISTS idx_pedido_anexos_empresa_created ON pedido_anexos (empresa_id, created_at DESC);


-- ============================================================================
-- FASE 18 — AUDITORIA DE PEDIDOS + SEM_VINCULO (pedido_auditoria.sql)
-- ============================================================================

-- Campo sem_vinculo em pedido_itens
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS sem_vinculo BOOLEAN NOT NULL DEFAULT false;

-- Tabela de auditoria de pedidos
CREATE TABLE IF NOT EXISTS pedido_auditoria (
  id           SERIAL PRIMARY KEY,
  pedido_id    INTEGER      NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id   INTEGER      NOT NULL,
  usuario_id   UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  etapa        VARCHAR(30)  NOT NULL,
  acao         VARCHAR(60)  NOT NULL,
  descricao    TEXT,
  dados_antes  JSONB,
  dados_depois JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_auditoria_pedido ON pedido_auditoria(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_auditoria_etapa  ON pedido_auditoria(pedido_id, etapa);


-- ============================================================================
-- FASE 19 — FLUXO 5 ETAPAS: CONFERÊNCIA + CONFECÇÃO (fluxo_5_etapas.sql)
-- ============================================================================

-- Etapa 3: controle de confecção por item
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS em_confeccao BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confeccao_ok BOOLEAN NOT NULL DEFAULT false;

-- Etapa 2: ficha de conferência técnica
CREATE TABLE IF NOT EXISTS conferencia_itens (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  pedido_item_id INTEGER NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  status         VARCHAR(20) NOT NULL DEFAULT 'pendente',
  -- 'pendente' | 'conferido' | 'reprovado'
  observacoes    TEXT,
  dados          JSONB,
  conferido_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  conferido_em   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id, pedido_item_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_agendamento ON conferencia_itens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ci_pedido_item ON conferencia_itens(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_ci_empresa ON conferencia_itens(empresa_id);


-- ============================================================================
-- FASE 20 — PESQUISA DE SATISFAÇÃO (pedidos_pesquisa_satisfacao.sql)
-- ============================================================================

-- Etapa 5: campo para pesquisa de satisfação (pós-conclusão)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS pesquisa_satisfacao TEXT;
