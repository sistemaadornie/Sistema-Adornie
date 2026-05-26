-- ============================================================================
-- ADORNIE SISTEMA — MIGRAÇÃO CONSOLIDADA
-- Gerado em 2026-05-25
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute.
-- Todas as operações usam IF NOT EXISTS / IF NOT EXISTS — idempotente.
--
-- ATENÇÃO: agendamentos_status_colunas.sql original usava UUID para
-- iniciado_por/concluido_por, mas usuarios.id é INTEGER no schema base.
-- Corrigido para INTEGER neste arquivo consolidado.
-- ============================================================================


-- ============================================================================
-- FASE 1 — TABELAS BASE
-- ============================================================================

-- clientes.sql
CREATE TABLE IF NOT EXISTS clientes (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  nome        TEXT NOT NULL,
  telefone    TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cliente_enderecos (
  id           SERIAL PRIMARY KEY,
  cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
  label        TEXT NOT NULL,
  categoria    TEXT DEFAULT 'residencial',
  rua          TEXT,
  numero       TEXT,
  complemento  TEXT,
  bairro       TEXT,
  cidade       TEXT,
  estado       CHAR(2),
  cep          VARCHAR(9),
  referencia   TEXT,
  is_padrao    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- veiculos.sql
CREATE TABLE IF NOT EXISTS veiculos (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  nome         TEXT NOT NULL,
  placa        TEXT,
  tipo         TEXT DEFAULT 'carro',
  combustivel  TEXT DEFAULT 'flex',
  media_km_l   NUMERIC(6,2),
  foto_url     TEXT,
  observacoes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS abastecimentos (
  id             SERIAL PRIMARY KEY,
  empresa_id     INTEGER NOT NULL,
  veiculo_id     INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data           DATE NOT NULL DEFAULT CURRENT_DATE,
  km_atual       NUMERIC(10,1),
  litros         NUMERIC(8,2),
  valor_total    NUMERIC(10,2),
  combustivel    TEXT,
  posto_nome     TEXT,
  registrado_por INTEGER,
  observacoes    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- agendamentos.sql
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
  criado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamento_equipe (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE(agendamento_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS agendamento_itens (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  nome            VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS agendamento_anexos (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  nome            VARCHAR(255) NOT NULL,
  url             TEXT NOT NULL,
  tipo            VARCHAR(50),
  enviado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  enviado_em      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamento_sugestoes (
  id              SERIAL PRIMARY KEY,
  agendamento_id  INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo            VARCHAR(50) NOT NULL,
  descricao       TEXT NOT NULL,
  status          VARCHAR(50) DEFAULT 'pendente',
  resposta        TEXT,
  respondido_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TIMESTAMP DEFAULT NOW(),
  respondido_em   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agendamento_logs (
  id             SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  empresa_id     INTEGER NOT NULL,
  usuario_id     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome   TEXT,
  acao           TEXT NOT NULL,
  detalhe        TEXT,
  criado_em      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_empresa    ON agendamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data       ON agendamentos(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status     ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_ag_equipe_agendamento   ON agendamento_equipe(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_equipe_usuario       ON agendamento_equipe(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ag_anexos_agendamento   ON agendamento_anexos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_sugestoes_agendamento ON agendamento_sugestoes(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_logs_ag              ON agendamento_logs(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ag_logs_emp             ON agendamento_logs(empresa_id);

-- categorias.sql
CREATE TABLE IF NOT EXISTS categorias (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  nome       VARCHAR(100) NOT NULL,
  cor        VARCHAR(20)  DEFAULT '#C9A96E',
  ordem      INTEGER      DEFAULT 0,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  updated_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_nome    ON categorias (empresa_id, nome);
CREATE INDEX        IF NOT EXISTS idx_categorias_empresa ON categorias (empresa_id);

-- notificacoes.sql
CREATE TABLE IF NOT EXISTS notificacoes (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  usuario_id  INTEGER,
  tipo        VARCHAR(60)  NOT NULL DEFAULT 'sistema',
  titulo      TEXT         NOT NULL,
  mensagem    TEXT,
  link        TEXT,
  icone       VARCHAR(20)  NOT NULL DEFAULT 'info',
  lida        BOOLEAN      NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_empresa ON notificacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_lida    ON notificacoes(lida);


-- ============================================================================
-- FASE 2 — EXTENSÕES DAS TABELAS BASE
-- ============================================================================

-- crews.sql
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

ALTER TABLE veiculos     ADD COLUMN IF NOT EXISTS capacidade INTEGER DEFAULT 999;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS demanda    INTEGER DEFAULT 1;

-- work_schedules.sql
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

ALTER TABLE crews    ADD COLUMN IF NOT EXISTS work_schedule_id INTEGER REFERENCES work_schedules(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS work_schedule_id INTEGER REFERENCES work_schedules(id) ON DELETE SET NULL;

-- pontos_partida.sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_instalador         BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco_padrao       TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco_padrao_lat   DOUBLE PRECISION;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS endereco_padrao_lng   DOUBLE PRECISION;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS veiculo_id            INTEGER REFERENCES veiculos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS pontos_partida_dia (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  data         DATE NOT NULL,
  label        TEXT,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, empresa_id, data)
);

CREATE TABLE IF NOT EXISTS enderecos_partida (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL,
  empresa_id   INTEGER NOT NULL,
  label        TEXT NOT NULL,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- pontos_partida_veiculo.sql
CREATE TABLE IF NOT EXISTS enderecos_partida_veiculo (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  veiculo_id   INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epv_veiculo ON enderecos_partida_veiculo(veiculo_id);

CREATE TABLE IF NOT EXISTS pontos_partida_dia_veiculo (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  veiculo_id   INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data         DATE NOT NULL,
  label        TEXT,
  endereco     TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  usar_padrao  BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, veiculo_id, data)
);

CREATE INDEX IF NOT EXISTS idx_ppdv_veiculo_data ON pontos_partida_dia_veiculo(veiculo_id, data);

-- lat_lng_agendamentos.sql
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lat          DOUBLE PRECISION;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS lng          DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_agendamentos_coords ON agendamentos(lat, lng) WHERE lat IS NOT NULL;

-- combustivel_tanque.sql
ALTER TABLE veiculos     ADD COLUMN IF NOT EXISTS capacidade_tanque NUMERIC(8,2);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS km_rota            NUMERIC(8,2);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS geocod_falhou      BOOLEAN DEFAULT FALSE;

-- agendamento_equipe_nome_snapshot.sql
ALTER TABLE agendamento_equipe ADD COLUMN IF NOT EXISTS nome_snapshot TEXT;

-- agendamentos_status_colunas.sql
-- usuarios.id é UUID no Supabase
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS iniciado_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS iniciado_por       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concluido_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS concluido_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observacoes_status TEXT;

-- agendamentos_endereco_extra.sql
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS cep                   VARCHAR(9);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS rua                   TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS numero                TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS complemento           TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS bairro                TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS cidade                TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS estado                CHAR(2);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao_minutos       INTEGER;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS pessoa_obrigatoria_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- clientes_cpf_cnpj.sql
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf  VARCHAR(14);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnpj VARCHAR(18);

CREATE INDEX IF NOT EXISTS idx_clientes_cpf  ON clientes(empresa_id, cpf)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(empresa_id, cnpj) WHERE deleted_at IS NULL;


-- ============================================================================
-- FASE 3 — TABELAS DE NEGÓCIO
-- ============================================================================

-- crm_tables.sql
CREATE TABLE IF NOT EXISTS crm_orcamentos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  cliente_id  INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'venda',
  numero      VARCHAR(50) NOT NULL,
  titulo      VARCHAR(255) NOT NULL,
  descricao   TEXT,
  valor       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status      VARCHAR(30) NOT NULL DEFAULT 'novo',
  criado_por  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_orc_empresa    ON crm_orcamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_crm_orc_cliente    ON crm_orcamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_orc_tipo       ON crm_orcamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_crm_orc_status     ON crm_orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_crm_orc_created_at ON crm_orcamentos(created_at DESC);

CREATE TABLE IF NOT EXISTS crm_financeiro (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  descricao     VARCHAR(255) NOT NULL,
  tipo          VARCHAR(20) NOT NULL,
  valor         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status        VARCHAR(20) NOT NULL DEFAULT 'pendente',
  vencimento_em DATE NOT NULL,
  pagamento_em  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_fin_empresa    ON crm_financeiro(empresa_id);
CREATE INDEX IF NOT EXISTS idx_crm_fin_tipo       ON crm_financeiro(tipo);
CREATE INDEX IF NOT EXISTS idx_crm_fin_status     ON crm_financeiro(status);
CREATE INDEX IF NOT EXISTS idx_crm_fin_vencimento ON crm_financeiro(vencimento_em);

CREATE TABLE IF NOT EXISTS crm_comissoes (
  id               SERIAL PRIMARY KEY,
  empresa_id       INTEGER NOT NULL,
  colaborador_id   INTEGER,
  colaborador_nome VARCHAR(255),
  tipo             VARCHAR(20) NOT NULL,
  valor            NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status           VARCHAR(20) NOT NULL DEFAULT 'pendente',
  descricao        TEXT,
  pagamento_em     DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_com_empresa ON crm_comissoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_crm_com_tipo    ON crm_comissoes(tipo);
CREATE INDEX IF NOT EXISTS idx_crm_com_status  ON crm_comissoes(status);

CREATE TABLE IF NOT EXISTS crm_retornos (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  cliente_id   INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  titulo       VARCHAR(255) NOT NULL,
  descricao    TEXT,
  data_retorno DATE NOT NULL,
  hora_retorno TIME,
  status       VARCHAR(20) NOT NULL DEFAULT 'pendente',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_ret_empresa ON crm_retornos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_crm_ret_cliente ON crm_retornos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_ret_status  ON crm_retornos(status);
CREATE INDEX IF NOT EXISTS idx_crm_ret_data    ON crm_retornos(data_retorno);

-- Seeds de inicialização do CRM (só insere se a empresa não tiver dados)
-- usuarios.id é UUID no Supabase — criado_por usa NULL nas seeds
DO $$
DECLARE
  v_empresa_id        INT;
  v_cliente_id_roberto INT;
  v_cliente_id_ana    INT;
  v_cliente_id_carlos INT;
  v_hoje              DATE := CURRENT_DATE;
BEGIN
  SELECT COALESCE(MIN(id), 1) INTO v_empresa_id FROM empresas;

  IF NOT EXISTS (SELECT 1 FROM clientes WHERE empresa_id = v_empresa_id LIMIT 1) THEN
    INSERT INTO clientes (empresa_id, nome, telefone, email)
    VALUES (v_empresa_id, 'Roberto Miotto', '(11) 98765-4321', 'roberto.miotto@gmail.com')
    RETURNING id INTO v_cliente_id_roberto;
    INSERT INTO clientes (empresa_id, nome, telefone, email)
    VALUES (v_empresa_id, 'Ana Maria Silveira', '(11) 99887-6655', 'ana.maria@yahoo.com.br')
    RETURNING id INTO v_cliente_id_ana;
    INSERT INTO clientes (empresa_id, nome, telefone, email)
    VALUES (v_empresa_id, 'Carlos Eduardo Santos', '(11) 97766-5544', 'carlosedu@outlook.com')
    RETURNING id INTO v_cliente_id_carlos;
  ELSE
    SELECT MIN(id) INTO v_cliente_id_roberto FROM clientes WHERE empresa_id = v_empresa_id;
    SELECT MAX(id) INTO v_cliente_id_ana     FROM clientes WHERE empresa_id = v_empresa_id AND id != v_cliente_id_roberto;
    v_cliente_id_carlos := v_cliente_id_ana;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_orcamentos WHERE empresa_id = v_empresa_id LIMIT 1) THEN
    INSERT INTO crm_orcamentos (empresa_id, cliente_id, tipo, numero, titulo, descricao, valor, status, criado_por, created_at)
    VALUES
      (v_empresa_id, v_cliente_id_roberto, 'venda', 'ORC-0001', 'Cortinas e Persianas Motorizadas - Sala', 'Projeto completo de cortinas de linho automatizadas para sacada e salas.', 2080040.79, 'novo', NULL, NOW() - INTERVAL '2 hours'),
      (v_empresa_id, v_cliente_id_ana,     'venda', 'ORC-0002', 'Papéis de Parede Importados - Quartos', 'Fornecimento e instalação de papel de parede italiano nos quartos 1 e 2.', 128491.94, 'perdido', NULL, NOW() - INTERVAL '5 days'),
      (v_empresa_id, v_cliente_id_roberto, 'venda', 'ORC-0003', 'Toldo Retrátil Articulado - Área Gourmet', 'Fornecimento de toldo de alta resistência motorizado somfy.', 90121.36, 'aprovado', NULL, NOW() - INTERVAL '1 day'),
      (v_empresa_id, v_cliente_id_carlos,  'venda', 'ORC-0004', 'Revestimentos Vinílicos - Hall de Entrada', 'Aplicação de vinílico premium acústico.', 643580.05, 'aprovado', NULL, NOW() - INTERVAL '3 weeks'),
      (v_empresa_id, v_cliente_id_ana,     'venda', 'ORC-0005', 'Projeto Corporativo - Escritório Adornie', 'Fornecimento de revestimento acústico e divisórias decorativas.', 2300580.17, 'aprovado', NULL, NOW() - INTERVAL '25 days'),
      (v_empresa_id, NULL, 'compra', 'COMP-0001', 'Lote Tecidos Linho Belga', 'Importação direta de rolos de linho cru e linho cinza.', 0.00, 'novo', NULL, NOW() - INTERVAL '1 day'),
      (v_empresa_id, NULL, 'compra', 'COMP-0002', 'Motores para Persianas - Somfy', 'Lote de 50 motores de automação.', 0.00, 'aprovado', NULL, NOW() - INTERVAL '3 days'),
      (v_empresa_id, NULL, 'compra', 'COMP-0003', 'Lote Papéis de Parede Vinílicos', 'Importação direta de 100 rolos de papéis geométricos.', 0.00, 'aprovado', NULL, NOW() - INTERVAL '4 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_financeiro WHERE empresa_id = v_empresa_id LIMIT 1) THEN
    INSERT INTO crm_financeiro (empresa_id, descricao, tipo, valor, status, vencimento_em)
    VALUES
      (v_empresa_id, 'Recebimento Parcela 1/3 - Roberto Miotto', 'receber', 159014.11, 'pendente', v_hoje + 5),
      (v_empresa_id, 'Saldo Contrato Corporativo - Carlos Eduardo', 'receber', 134496.39, 'vencido', v_hoje - 3),
      (v_empresa_id, 'Taxa de Visita Técnica - Residencial Ana Maria', 'receber', 3400.00, 'pendente', v_hoje),
      (v_empresa_id, 'Adesão de Serviço - Toldos Gourmet', 'receber', 77896.39, 'pendente', v_hoje + 2),
      (v_empresa_id, 'Pagamento Fornecedor Tecidos Textil SA', 'pagar', 391488.82, 'pendente', v_hoje + 10),
      (v_empresa_id, 'Aluguel Galpão Logístico - Adornie', 'pagar', 232860.29, 'vencido', v_hoje - 5),
      (v_empresa_id, 'Serviços de Terceirizados Instalações', 'pagar', 3740.00, 'pendente', v_hoje),
      (v_empresa_id, 'Compra Ferragens e Trilhos Cortina', 'pagar', 115237.51, 'pendente', v_hoje + 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_comissoes WHERE empresa_id = v_empresa_id LIMIT 1) THEN
    INSERT INTO crm_comissoes (empresa_id, colaborador_nome, tipo, valor, status, descricao)
    VALUES
      (v_empresa_id, 'Taymara Benke', 'colaborador', 133.30, 'pendente', 'Comissão sobre instalação de toldo gourmet - Ana Maria'),
      (v_empresa_id, 'Vendedor Geral 1', 'vendedor', 0.00, 'pendente', 'Ajuste de comissão mensal de vendas');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_retornos WHERE empresa_id = v_empresa_id LIMIT 1) THEN
    INSERT INTO crm_retornos (empresa_id, cliente_id, titulo, descricao, data_retorno, hora_retorno, status)
    VALUES
      (v_empresa_id, v_cliente_id_roberto, 'Ligar para confirmar medidas das cortinas', 'Agendado retorno de contato com Sr. Roberto para alinhar detalhes de medidas.', v_hoje, '14:30', 'pendente'),
      (v_empresa_id, v_cliente_id_ana,     'E-mail com novo catálogo de papéis de parede', 'Enviar o catálogo 2026 de papéis geométricos italianos.', v_hoje + 1, '10:00', 'pendente'),
      (v_empresa_id, v_cliente_id_carlos,  'Negociar desconto revestimentos vinílicos', 'Cliente solicitou margem adicional no orçamento de hall corporativo.', v_hoje + 2, '16:00', 'pendente');
  END IF;
END $$;

-- fornecedores.sql
CREATE TABLE IF NOT EXISTS fornecedores (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER      NOT NULL,
  nome            VARCHAR(255) NOT NULL,
  tipo            VARCHAR(5)   NOT NULL DEFAULT 'PJ',
  cnpj            VARCHAR(20),
  cpf             VARCHAR(14),
  email           VARCHAR(255),
  telefone        VARCHAR(30),
  whatsapp        VARCHAR(30),
  contato         VARCHAR(150),
  website         VARCHAR(255),
  categoria       VARCHAR(100),
  endereco        VARCHAR(255),
  numero          VARCHAR(20),
  complemento     VARCHAR(100),
  bairro          VARCHAR(100),
  cidade          VARCHAR(100),
  estado          CHAR(2),
  cep             VARCHAR(9),
  observacoes     TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'ativo',
  criado_por      INTEGER,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_empresa   ON fornecedores (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_status    ON fornecedores (status);
CREATE INDEX IF NOT EXISTS idx_fornecedores_categoria ON fornecedores (categoria);
CREATE INDEX IF NOT EXISTS idx_fornecedores_tipo      ON fornecedores (tipo);

ALTER TABLE crm_orcamentos ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL;
ALTER TABLE crm_financeiro  ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_orcamentos_fornecedor ON crm_orcamentos (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_crm_financeiro_fornecedor ON crm_financeiro  (fornecedor_id);

-- pedidos.sql
CREATE TABLE IF NOT EXISTS pedidos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  cliente_id  INTEGER REFERENCES clientes(id),
  status      VARCHAR(30) NOT NULL DEFAULT 'pendente',
  descricao   TEXT,
  observacoes TEXT,
  criado_por  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pedidos_empresa    ON pedidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente    ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status     ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at DESC);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id         SERIAL PRIMARY KEY,
  pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  ambiente   VARCHAR(120),
  descricao  TEXT NOT NULL,
  quantidade NUMERIC(10,2) NOT NULL DEFAULT 1,
  valor      NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON pedido_itens(pedido_id);

-- pedidos_v2.sql
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS numero_sequencial   INTEGER,
  ADD COLUMN IF NOT EXISTS consultor_id        UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS cpf_cnpj            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email_cliente       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subtotal            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS desconto            NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total               NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS data_pedido         DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS numero_origem       VARCHAR(30),
  ADD COLUMN IF NOT EXISTS observacoes_entrega TEXT;

CREATE SEQUENCE IF NOT EXISTS pedidos_numero_seq;

-- pedidos_endereco.sql
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS cep         VARCHAR(10),
  ADD COLUMN IF NOT EXISTS rua         TEXT,
  ADD COLUMN IF NOT EXISTS numero      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS bairro      TEXT,
  ADD COLUMN IF NOT EXISTS cidade      TEXT,
  ADD COLUMN IF NOT EXISTS estado      CHAR(2),
  ADD COLUMN IF NOT EXISTS endereco    TEXT;

-- etiqueta_logos.sql
CREATE TABLE IF NOT EXISTS etiqueta_logos (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome       VARCHAR(100) NOT NULL,
  url        TEXT NOT NULL,
  public_id  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etiqueta_logos_empresa ON etiqueta_logos(empresa_id);

-- produtos.sql
CREATE TABLE IF NOT EXISTS produtos (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  codigo       VARCHAR(50),
  referencia   VARCHAR(100),
  tipo         VARCHAR(20)  NOT NULL DEFAULT 'produto',
  nome         VARCHAR(255) NOT NULL,
  descricao    TEXT,
  marca        VARCHAR(100),
  categoria    VARCHAR(100),
  unidade      VARCHAR(20)  DEFAULT 'un',
  preco_custo  NUMERIC(12,2) DEFAULT 0,
  preco_venda  NUMERIC(12,2) DEFAULT 0,
  estoque      NUMERIC(10,3) DEFAULT 0,
  status       VARCHAR(20)  NOT NULL DEFAULT 'ativo',
  foto_url     TEXT,
  eh_confeccao BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por   INTEGER,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_produtos_empresa   ON produtos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_produtos_tipo      ON produtos (tipo);
CREATE INDEX IF NOT EXISTS idx_produtos_status    ON produtos (status);
CREATE INDEX IF NOT EXISTS idx_produtos_marca     ON produtos (marca);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos (categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo    ON produtos (empresa_id, codigo);

-- produtos_eh_confeccao.sql (já incluído na criação acima)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS eh_confeccao BOOLEAN NOT NULL DEFAULT FALSE;

-- produtos_categoria_id.sql
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_categoria_id ON produtos (categoria_id);


-- ============================================================================
-- FASE 4 — TABELAS COMPLEXAS (dependem de várias outras)
-- ============================================================================

-- pipeline.sql
CREATE TABLE IF NOT EXISTS pipeline_projetos (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL,
  numero            VARCHAR(30) NOT NULL UNIQUE,
  titulo            VARCHAR(255) NOT NULL,
  cliente_id        INTEGER REFERENCES clientes(id),
  orcamento_id      INTEGER,
  pedido_id         INTEGER REFERENCES pedidos(id),
  agendamento_id    INTEGER REFERENCES agendamentos(id),
  etapa             VARCHAR(40) NOT NULL DEFAULT 'orcamento',
  requer_confeccao  BOOLEAN NOT NULL DEFAULT FALSE,
  prazo_entrega     DATE,
  valor_estimado    NUMERIC(12,2),
  prioridade        VARCHAR(10) DEFAULT 'normal',
  observacoes       TEXT,
  criado_por        INTEGER,
  criado_por_nome   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pipeline_itens (
  id                    SERIAL PRIMARY KEY,
  projeto_id            INTEGER NOT NULL REFERENCES pipeline_projetos(id),
  produto_id            INTEGER REFERENCES produtos(id),
  descricao             TEXT NOT NULL,
  ambiente              VARCHAR(150),
  quantidade            NUMERIC(10,2) DEFAULT 1,
  valor_unit            NUMERIC(12,2) DEFAULT 0,
  tipo_disponibilidade  VARCHAR(30) DEFAULT 'estoque',
  requer_confeccao      BOOLEAN DEFAULT FALSE,
  fornecedor_id         INTEGER REFERENCES fornecedores(id),
  prazo_previsto        DATE,
  status_item           VARCHAR(30) DEFAULT 'pendente',
  chegada_real          TIMESTAMPTZ,
  marcado_por           INTEGER,
  observacao            TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_historico (
  id              SERIAL PRIMARY KEY,
  projeto_id      INTEGER NOT NULL REFERENCES pipeline_projetos(id),
  tipo            VARCHAR(30) NOT NULL DEFAULT 'avanco',
  etapa_anterior  VARCHAR(40),
  etapa_nova      VARCHAR(40),
  observacao      TEXT,
  usuario_id      INTEGER,
  usuario_nome    TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS pipeline_config (
  id                      SERIAL PRIMARY KEY,
  empresa_id              INTEGER NOT NULL UNIQUE,
  prazo_agendamento_dias  INTEGER DEFAULT 7,
  prazo_confeccao_dias    INTEGER DEFAULT 14,
  prazo_sob_demanda_dias  INTEGER DEFAULT 21,
  alertar_dias_antes      INTEGER DEFAULT 2,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_empresa ON pipeline_projetos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_etapa   ON pipeline_projetos (etapa);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_cliente ON pipeline_projetos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_pedido  ON pipeline_projetos (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_projetos_deleted ON pipeline_projetos (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_itens_projeto    ON pipeline_itens (projeto_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_itens_status     ON pipeline_itens (status_item);
CREATE INDEX IF NOT EXISTS idx_pipeline_itens_disponib   ON pipeline_itens (tipo_disponibilidade);
CREATE INDEX IF NOT EXISTS idx_pipeline_hist_projeto     ON pipeline_historico (projeto_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_hist_tipo        ON pipeline_historico (tipo);
CREATE INDEX IF NOT EXISTS idx_pipeline_estoque_empresa  ON pipeline_estoque_entradas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_estoque_projeto  ON pipeline_estoque_entradas (projeto_id);

-- arquitetos.sql
CREATE TABLE IF NOT EXISTS arquitetos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  nome        VARCHAR(150) NOT NULL,
  telefone    VARCHAR(30),
  email       VARCHAR(150),
  escritorio  VARCHAR(200),
  cau         VARCHAR(30),
  observacoes TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arquitetos_empresa ON arquitetos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_arquitetos_deleted ON arquitetos (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE clientes           ADD COLUMN IF NOT EXISTS arquiteto_id   INTEGER REFERENCES arquitetos(id);
ALTER TABLE crm_orcamentos     ADD COLUMN IF NOT EXISTS arquiteto_id   INTEGER REFERENCES arquitetos(id);
ALTER TABLE crm_orcamentos     ADD COLUMN IF NOT EXISTS vendedora_id   INTEGER;
ALTER TABLE pipeline_projetos  ADD COLUMN IF NOT EXISTS arquiteto_id   INTEGER REFERENCES arquitetos(id);
ALTER TABLE pipeline_projetos  ADD COLUMN IF NOT EXISTS arquiteto_nome TEXT;
ALTER TABLE pipeline_projetos  ADD COLUMN IF NOT EXISTS vendedora_id   INTEGER;
ALTER TABLE pipeline_projetos  ADD COLUMN IF NOT EXISTS vendedora_nome TEXT;

-- arquitetos_v2.sql
ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS tipo_pessoa    VARCHAR(2),
  ADD COLUMN IF NOT EXISTS cpf_cnpj       VARCHAR(25),
  ADD COLUMN IF NOT EXISTS outro_telefone VARCHAR(30);

-- arquitetos_consultor_id.sql
ALTER TABLE arquitetos
  ADD COLUMN IF NOT EXISTS consultor_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_arquitetos_consultor ON arquitetos (consultor_id);

-- pedidos_arquiteto_id.sql
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS arquiteto_id INTEGER REFERENCES arquitetos(id);

-- pedido_itens_v2.sql
ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS referencia     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS cor            VARCHAR(120),
  ADD COLUMN IF NOT EXISTS medidas        VARCHAR(80),
  ADD COLUMN IF NOT EXISTS unidade        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS preco_unitario NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ordem          INTEGER DEFAULT 0;

-- pedido_pagamentos.sql
CREATE TABLE IF NOT EXISTS pedido_pagamentos (
  id         SERIAL PRIMARY KEY,
  pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  forma      VARCHAR(80) NOT NULL,
  parcela    VARCHAR(10),
  vencimento DATE,
  valor      NUMERIC(12,2),
  ordem      INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedido_pagamentos_pedido ON pedido_pagamentos(pedido_id);

-- google_drive_upload.sql
CREATE TABLE IF NOT EXISTS ordem_servico (
  id               SERIAL PRIMARY KEY,
  pedido_item_id   INTEGER NOT NULL REFERENCES pedido_itens(id),
  status           VARCHAR(30) NOT NULL DEFAULT 'aberta',
  responsavel_id   UUID REFERENCES usuarios(id),
  aberta_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_em     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_pedido_item ON ordem_servico(pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_os_status      ON ordem_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_responsavel ON ordem_servico(responsavel_id);

CREATE TABLE IF NOT EXISTS pedido_midias (
  id                SERIAL PRIMARY KEY,
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_file_id     VARCHAR(255) NOT NULL,
  drive_url         TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_original     VARCHAR(255),
  tipo              VARCHAR(10)  NOT NULL CHECK (tipo IN ('foto','video')),
  tamanho_bytes     BIGINT,
  duracao_segundos  INTEGER,
  descricao         TEXT,
  hash_md5          VARCHAR(32),
  enviado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_por       UUID NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX        IF NOT EXISTS idx_midias_pedido ON pedido_midias(pedido_id);
CREATE INDEX        IF NOT EXISTS idx_midias_item   ON pedido_midias(pedido_item_id);
CREATE INDEX        IF NOT EXISTS idx_midias_os     ON pedido_midias(ordem_servico_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_midias_hash   ON pedido_midias(pedido_id, hash_md5) WHERE hash_md5 IS NOT NULL;

CREATE TABLE IF NOT EXISTS upload_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         INTEGER NOT NULL REFERENCES pedidos(id),
  pedido_item_id    INTEGER NOT NULL REFERENCES pedido_itens(id),
  ordem_servico_id  INTEGER REFERENCES ordem_servico(id),
  drive_upload_uri  TEXT NOT NULL,
  drive_folder_id   VARCHAR(255),
  nome_arquivo      VARCHAR(255) NOT NULL,
  tamanho_bytes     BIGINT NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  tipo              VARCHAR(10)  NOT NULL CHECK (tipo IN ('foto','video')),
  hash_md5          VARCHAR(32),
  bytes_confirmados BIGINT NOT NULL DEFAULT 0,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','em_andamento','concluido','expirado','erro')),
  iniciado_por      UUID NOT NULL REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em         TIMESTAMPTZ NOT NULL,
  concluido_em      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_pedido  ON upload_sessions(pedido_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status  ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expira  ON upload_sessions(expira_em) WHERE status NOT IN ('concluido','expirado');


-- ============================================================================
-- FASE 5 — FKs ADICIONAIS EM TABELAS EXISTENTES
-- ============================================================================

-- agendamento_pedido_id.sql
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS pedido_id  INTEGER REFERENCES pedidos(id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_pedido     ON agendamentos(pedido_id);

-- cliente_id_agendamentos.sql
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_id ON agendamentos(cliente_id);


-- ============================================================================
-- FASE 6 — ÍNDICES ADICIONAIS (indices.sql + notificacoes.agendamento_id)
-- ============================================================================

-- notificacoes precisa da coluna agendamento_id antes do índice abaixo
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS agendamento_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL;

-- indices.sql
CREATE INDEX IF NOT EXISTS idx_ag_empresa_data    ON agendamentos(empresa_id, data, hora);
CREATE INDEX IF NOT EXISTS idx_ag_empresa_status  ON agendamentos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_ag_criado_por      ON agendamentos(criado_por);
CREATE INDEX IF NOT EXISTS idx_ae_agendamento     ON agendamento_equipe(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_ae_usuario         ON agendamento_equipe(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ai_agendamento     ON agendamento_itens(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_aa_agendamento     ON agendamento_anexos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_notif_agendamento  ON notificacoes(agendamento_id) WHERE agendamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crew_empresa_data  ON crews(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_crew_ag_crew       ON crew_agendamentos(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_ag_agendamento ON crew_agendamentos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_abast_empresa_data ON abastecimentos(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_abast_veiculo      ON abastecimentos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_rt_usuario         ON refresh_tokens(usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email     ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa   ON usuarios(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa      ON clientes(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_nome ON clientes(empresa_id, nome) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cli_end_cliente       ON cliente_enderecos(cliente_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ag_logs_ag_data       ON agendamento_logs(agendamento_id, criado_em DESC);
