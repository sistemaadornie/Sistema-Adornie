-- ============================================================================
-- ADORNIE SISTEMA — MIGRAÇÃO CONSOLIDADA #3
-- Gerado em 2026-07-12
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Cobre todas as migrations criadas após _supabase_update_2.sql (2026-06-10):
--   categorias_vinculo_flags, pedido_itens_produto_ok, agendamento_itens_separado,
--   categorias_vinculo_trilho_cortina, categorias_vinculo_controle_persiana,
--   categorias_necessita_conferencia, categorias_distribui_canais,
--   categorias_xales_outros, agendamento_item_fotos, categorias_tipo_confeccao,
--   ordem_servico_dados_confeccao, ordem_servico_conferencia_consultoras,
--   push_subscriptions, categorias_persiana_conferencia, escritorios,
--   arquitetos_hoop, arquitetos_perfil_checklist, regioes_geo.
--
-- Idempotente — usa IF NOT EXISTS / ON CONFLICT em todas as operações,
-- pode ser executado novamente sem causar erro.
--
-- ATENÇÃO: no Supabase, usuarios.id é UUID (no local é INTEGER serial) — ver
-- [[project_db_local_vs_supabase]], Incidente 4. Todo REFERENCES usuarios(id)
-- abaixo já foi adaptado para UUID (diferente do .sql original em migrations/,
-- que usa INTEGER para rodar no banco local).
-- ============================================================================


-- ============================================================================
-- FASE 1 — CATEGORIAS: FLAGS DE VÍNCULO (categorias_vinculo_flags.sql)
-- ============================================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS vinculavel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculos BOOLEAN NOT NULL DEFAULT false;


-- ============================================================================
-- FASE 2 — PEDIDO_ITENS: PRODUTO_OK (pedido_itens_produto_ok.sql)
-- ============================================================================

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS produto_ok BOOLEAN NOT NULL DEFAULT false;


-- ============================================================================
-- FASE 3 — AGENDAMENTO_ITENS: SEPARADO (agendamento_itens_separado.sql)
-- ============================================================================

ALTER TABLE agendamento_itens
  ADD COLUMN IF NOT EXISTS separado BOOLEAN NOT NULL DEFAULT false;


-- ============================================================================
-- FASE 4 — VÍNCULO AUTOMÁTICO TRILHO/VARÃO -> CORTINA/FORRO (categorias_vinculo_trilho_cortina.sql)
-- ============================================================================

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'trilhos e varões';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) IN ('cortinas', 'forros');


-- ============================================================================
-- FASE 5 — VÍNCULO CONTROLES -> PERSIANAS (categorias_vinculo_controle_persiana.sql)
-- ============================================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS recebe_vinculo_automatico BOOLEAN NOT NULL DEFAULT false;

UPDATE categorias SET recebe_vinculo_automatico = true
WHERE LOWER(nome) IN ('cortinas', 'forros');

UPDATE categorias SET vinculavel = true
WHERE LOWER(nome) = 'controles';

UPDATE categorias SET recebe_vinculos = true
WHERE LOWER(nome) = 'persianas';


-- ============================================================================
-- FASE 6 — CATEGORIAS: NECESSITA CONFERÊNCIA (categorias_necessita_conferencia.sql)
-- ============================================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS necessita_conferencia BOOLEAN NOT NULL DEFAULT false;


-- ============================================================================
-- FASE 7 — CATEGORIAS: DISTRIBUI CANAIS + BUGFIX CORTINAS (categorias_distribui_canais.sql)
-- ============================================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS distribui_canais BOOLEAN NOT NULL DEFAULT false;

UPDATE categorias SET distribui_canais = true WHERE LOWER(nome) = 'controles';

-- Bugfix: Cortinas não deve ser vinculavel (causava falha no matching por largura)
UPDATE categorias SET vinculavel = false WHERE LOWER(nome) = 'cortinas';


-- ============================================================================
-- FASE 8 — NOVAS CATEGORIAS XALES/OUTROS (categorias_xales_outros.sql)
-- ============================================================================

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Xales', '#D4A017', 13
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'xales'
);

INSERT INTO categorias (empresa_id, nome, cor, ordem)
SELECT e.id, 'Outros', '#9E9E9E', 99
FROM empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM categorias c WHERE c.empresa_id = e.id AND LOWER(c.nome) = 'outros'
);


-- ============================================================================
-- FASE 9 — FOTOS POR ITEM DE AGENDAMENTO (agendamento_item_fotos.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agendamento_item_fotos (
  id                   SERIAL PRIMARY KEY,
  agendamento_item_id  INTEGER NOT NULL REFERENCES agendamento_itens(id) ON DELETE CASCADE,
  url                  TEXT NOT NULL,
  enviado_por          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_item_fotos_item ON agendamento_item_fotos(agendamento_item_id);


-- ============================================================================
-- FASE 10 — CATEGORIAS: TIPO DE CONFECÇÃO (categorias_tipo_confeccao.sql)
-- ============================================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_confeccao VARCHAR(20);

UPDATE categorias SET tipo_confeccao = 'cortina' WHERE LOWER(nome) IN ('cortinas', 'xales');
UPDATE categorias SET tipo_confeccao = 'forro'   WHERE LOWER(nome) = 'forros';

CREATE INDEX IF NOT EXISTS idx_categorias_tipo_confeccao ON categorias(tipo_confeccao);


-- ============================================================================
-- FASE 11 — ORDEM DE SERVIÇO: FICHA DE CONFECÇÃO (ordem_servico_dados_confeccao.sql)
-- ============================================================================

ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_confeccao         JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_em  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confeccao_preenchido_por UUID REFERENCES usuarios(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_os_pedido_item_unico ON ordem_servico(pedido_item_id);


-- ============================================================================
-- FASE 12 — ORDEM DE SERVIÇO: FICHA DE CONFERÊNCIA CONSULTORAS (ordem_servico_conferencia_consultoras.sql)
-- ============================================================================

ALTER TABLE ordem_servico
  ADD COLUMN IF NOT EXISTS dados_conferencia_consultoras JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_em TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conferencia_consultoras_preenchido_por UUID REFERENCES usuarios(id);


-- ============================================================================
-- FASE 13 — PUSH NOTIFICATIONS (push_subscriptions.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id  INTEGER NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_uso  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_sub_usuario ON push_subscriptions(usuario_id);


-- ============================================================================
-- FASE 14 — PERSIANA: FICHA DE CONFERÊNCIA PRÓPRIA (categorias_persiana_conferencia.sql)
-- ============================================================================

UPDATE categorias
   SET tipo_confeccao        = 'persiana',
       necessita_conferencia = true
 WHERE LOWER(nome) IN ('persianas', 'persiana');


-- ============================================================================
-- FASE 15 — ESCRITÓRIOS (escritorios.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS escritorios (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  nome          VARCHAR(200) NOT NULL,
  cnpj          VARCHAR(25),
  telefone      VARCHAR(30),
  email         VARCHAR(150),
  rua           VARCHAR(200),
  numero        VARCHAR(20),
  complemento   VARCHAR(100),
  bairro        VARCHAR(100),
  cidade        VARCHAR(100),
  estado        VARCHAR(2),
  cep           VARCHAR(12),
  comprou_optin VARCHAR(50),
  chave_pix     VARCHAR(150),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escritorios_empresa ON escritorios (empresa_id);
CREATE INDEX IF NOT EXISTS idx_escritorios_deleted ON escritorios (deleted_at) WHERE deleted_at IS NULL;


-- ============================================================================
-- FASE 16 — ARQUITETOS: IMPORTAÇÃO PADRÃO HOOP (arquitetos_hoop.sql)
-- ============================================================================

ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS escritorio_id   INTEGER REFERENCES escritorios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS rua             VARCHAR(200),
  ADD COLUMN IF NOT EXISTS numero          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bairro          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cidade          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS estado          VARCHAR(2),
  ADD COLUMN IF NOT EXISTS cep             VARCHAR(12),
  ADD COLUMN IF NOT EXISTS comprou_optin   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS chave_pix       VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_arquitetos_escritorio ON arquitetos (escritorio_id);


-- ============================================================================
-- FASE 17 — ARQUITETOS: CHECKLIST DE PERFIL (arquitetos_perfil_checklist.sql)
-- ============================================================================

ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS perfil_checklist JSONB;


-- ============================================================================
-- FASE 18 — REGIÕES GEOGRÁFICAS: CACHE DE GEOCODIFICAÇÃO (regioes_geo.sql)
-- ============================================================================

CREATE TABLE IF NOT EXISTS regioes_geo (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('bairro','cidade')),
  chave VARCHAR(120) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  cidade VARCHAR(120),
  estado VARCHAR(2),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  geocod_falhou BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, tipo, chave)
);

CREATE INDEX IF NOT EXISTS idx_regioes_geo_busca ON regioes_geo (empresa_id, tipo, chave);


-- ============================================================================
-- FASE 19 — USUÁRIOS: ORIGEM DO CADASTRO (usuarios_cadastro_origem.sql)
-- ============================================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cadastro_origem TEXT NOT NULL DEFAULT 'web';


-- ============================================================================
-- FASE 20 — CLIENTES: CONSULTORA DE ESCOPO (clientes_consultor_id.sql)
-- ============================================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS consultor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_consultor ON clientes (consultor_id);


-- crew_logs.sql
CREATE TABLE IF NOT EXISTS crew_logs (
  id           SERIAL PRIMARY KEY,
  crew_id      INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  usuario_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  acao         TEXT NOT NULL,
  detalhes     JSONB,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crew_logs_crew ON crew_logs (crew_id, criado_em DESC);
