-- ============================================================
-- CRM ADORNIE — TABELAS E SEEDS
-- PostgreSQL database schema migration
-- ============================================================

-- 1. Tabela de Orçamentos
CREATE TABLE IF NOT EXISTS crm_orcamentos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  cliente_id  INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'venda', -- venda | compra
  numero      VARCHAR(50) NOT NULL,                 -- ex: ORC-0001
  titulo      VARCHAR(255) NOT NULL,
  descricao   TEXT,
  valor       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status      VARCHAR(30) NOT NULL DEFAULT 'novo',  -- novo | aprovado | recusado | perdido
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


-- 2. Tabela de Lançamentos Financeiros (Contas a Receber e Pagar)
CREATE TABLE IF NOT EXISTS crm_financeiro (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  descricao     VARCHAR(255) NOT NULL,
  tipo          VARCHAR(20) NOT NULL,                 -- receber | pagar
  valor         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status        VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | vencido | pago
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


-- 3. Tabela de Comissões (Colaboradores e Vendedores)
CREATE TABLE IF NOT EXISTS crm_comissoes (
  id             SERIAL PRIMARY KEY,
  empresa_id     INTEGER NOT NULL,
  colaborador_id INTEGER,                              -- FK para usuarios se aplicável
  colaborador_nome VARCHAR(255),                       -- Nome textual fallback
  tipo           VARCHAR(20) NOT NULL,                 -- colaborador | vendedor
  valor          NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status         VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | pago
  descricao      TEXT,
  pagamento_em   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_com_empresa ON crm_comissoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_crm_com_tipo    ON crm_comissoes(tipo);
CREATE INDEX IF NOT EXISTS idx_crm_com_status  ON crm_comissoes(status);


-- 4. Tabela de Retornos (Callback Leads / Reminders)
CREATE TABLE IF NOT EXISTS crm_retornos (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  cliente_id   INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  titulo       VARCHAR(255) NOT NULL,
  descricao    TEXT,
  data_retorno DATE NOT NULL,
  hora_retorno TIME,
  status       VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | concluido
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_ret_empresa ON crm_retornos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_crm_ret_cliente ON crm_retornos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_ret_status  ON crm_retornos(status);
CREATE INDEX IF NOT EXISTS idx_crm_ret_data    ON crm_retornos(data_retorno);


-- ============================================================
-- SEEDS DE INICIALIZAÇÃO (DADOS DE EXEMPLO REALISTAS)
-- ============================================================

DO $$
DECLARE
  v_empresa_id INT;
  v_cliente_id_roberto INT;
  v_cliente_id_ana INT;
  v_cliente_id_carlos INT;
  v_usuario_id INT;
  v_hoje DATE := CURRENT_DATE;
BEGIN
  -- Obter a primeira empresa do sistema, ou assumir 1
  SELECT COALESCE(MIN(id), 1) INTO v_empresa_id FROM empresas;
  
  -- Obter o primeiro usuário, ou assumir 1
  SELECT COALESCE(MIN(id), 1) INTO v_usuario_id FROM usuarios;

  -- Inserir clientes de exemplo se não existirem
  IF NOT EXISTS (SELECT 1 FROM clientes WHERE empresa_id = v_empresa_id LIMIT 1) THEN
    INSERT INTO clientes (empresa_id, nome, telefone, email)
    VALUES 
      (v_empresa_id, 'Roberto Miotto', '(11) 98765-4321', 'roberto.miotto@gmail.com')
      RETURNING id INTO v_cliente_id_roberto;
      
    INSERT INTO clientes (empresa_id, nome, telefone, email)
    VALUES 
      (v_empresa_id, 'Ana Maria Silveira', '(11) 99887-6655', 'ana.maria@yahoo.com.br')
      RETURNING id INTO v_cliente_id_ana;
      
    INSERT INTO clientes (empresa_id, nome, telefone, email)
    VALUES 
      (v_empresa_id, 'Carlos Eduardo Santos', '(11) 97766-5544', 'carlosedu@outlook.com')
      RETURNING id INTO v_cliente_id_carlos;
  ELSE
    SELECT MIN(id) INTO v_cliente_id_roberto FROM clientes WHERE empresa_id = v_empresa_id;
    SELECT MAX(id) INTO v_cliente_id_ana FROM clientes WHERE empresa_id = v_empresa_id AND id != v_cliente_id_roberto;
    v_cliente_id_carlos := v_cliente_id_ana;
  END IF;

  -- Limpar dados CRM antigos de exemplo se existirem (para evitar acúmulo em resets)
  DELETE FROM crm_orcamentos WHERE empresa_id = v_empresa_id;
  DELETE FROM crm_financeiro WHERE empresa_id = v_empresa_id;
  DELETE FROM crm_comissoes WHERE empresa_id = v_empresa_id;
  DELETE FROM crm_retornos WHERE empresa_id = v_empresa_id;

  -- 1. SEEDS: Orçamentos (Vendas e Compras)
  -- Orçamentos Venda
  INSERT INTO crm_orcamentos (empresa_id, cliente_id, tipo, numero, titulo, descricao, valor, status, criado_por, created_at)
  VALUES
    (v_empresa_id, v_cliente_id_roberto, 'venda', 'ORC-0001', 'Cortinas e Persianas Motorizadas - Sala', 'Projeto completo de cortinas de linho automatizadas para sacada e salas.', 2080040.79, 'novo', v_usuario_id, NOW() - INTERVAL '2 hours'),
    (v_empresa_id, v_cliente_id_ana, 'venda', 'ORC-0002', 'Papéis de Parede Importados - Quartos', 'Fornecimento e instalação de papel de parede italiano nos quartos 1 e 2.', 128491.94, 'perdido', v_usuario_id, NOW() - INTERVAL '5 days'),
    (v_empresa_id, v_cliente_id_roberto, 'venda', 'ORC-0003', 'Toldo Retrátil Articulado - Área Gourmet', 'Fornecimento de toldo de alta resistência motorizado somfy.', 90121.36, 'aprovado', v_usuario_id, NOW() - INTERVAL '1 day'),
    (v_empresa_id, v_cliente_id_carlos, 'venda', 'ORC-0004', 'Revestimentos Vinílicos - Hall de Entrada', 'Aplicação de vinílico premium acústico.', 643580.05, 'aprovado', v_usuario_id, NOW() - INTERVAL '3 weeks'),
    (v_empresa_id, v_cliente_id_ana, 'venda', 'ORC-0005', 'Projeto Corporativo - Escritório Adornie', 'Fornecimento de revestimento acústico e divisórias decorativas.', 2300580.17, 'aprovado', v_usuario_id, NOW() - INTERVAL '25 days');

  -- Orçamentos Compra
  INSERT INTO crm_orcamentos (empresa_id, cliente_id, tipo, numero, titulo, descricao, valor, status, criado_por, created_at)
  VALUES
    (v_empresa_id, NULL, 'compra', 'COMP-0001', 'Lote Tecidos Linho Belga', 'Importação direta de rolos de linho cru e linho cinza.', 0.00, 'novo', v_usuario_id, NOW() - INTERVAL '1 day'),
    (v_empresa_id, NULL, 'compra', 'COMP-0002', 'Motores para Persianas - Somfy', 'Lote de 50 motores de automação.', 0.00, 'aprovado', v_usuario_id, NOW() - INTERVAL '3 days'),
    (v_empresa_id, NULL, 'compra', 'COMP-0003', 'Lote Papéis de Parede Vinílicos', 'Importação direta de 100 rolos de papéis geométricos.', 0.00, 'aprovado', v_usuario_id, NOW() - INTERVAL '4 days');

  -- 2. SEEDS: Pedidos (Vendas e Compras)
  -- Vinculados na tabela 'pedidos' principal existente. Inseriremos também alguns pedidos de exemplo lá, caso o banco esteja limpo,
  -- e usaremos o crmService para carregar/exibir.

  -- 3. SEEDS: Lançamentos Financeiros (Contas a Receber e Pagar)
  -- Contas a Receber (tipo: receber)
  INSERT INTO crm_financeiro (empresa_id, descricao, tipo, valor, status, vencimento_em)
  VALUES
    (v_empresa_id, 'Recebimento Parcela 1/3 - Roberto Miotto', 'receber', 159014.11, 'pendente', v_hoje + 5),
    (v_empresa_id, 'Saldo Contrato Corporativo - Carlos Eduardo', 'receber', 134496.39, 'vencido', v_hoje - 3),
    (v_empresa_id, 'Taxa de Visita Técnica - Residencial Ana Maria', 'receber', 3400.00, 'pendente', v_hoje),
    (v_empresa_id, 'Adesão de Serviço - Toldos Gourmet', 'receber', 77896.39, 'pendente', v_hoje + 2);

  -- Contas a Pagar (tipo: pagar)
  INSERT INTO crm_financeiro (empresa_id, descricao, tipo, valor, status, vencimento_em)
  VALUES
    (v_empresa_id, 'Pagamento Fornecedor Tecidos Textil SA', 'pagar', 391488.82, 'pendente', v_hoje + 10),
    (v_empresa_id, 'Aluguel Galpão Logístico - Adornie', 'pagar', 232860.29, 'vencido', v_hoje - 5),
    (v_empresa_id, 'Serviços de Terceirizados Instalações', 'pagar', 3740.00, 'pendente', v_hoje),
    (v_empresa_id, 'Compra Ferragens e Trilhos Cortina', 'pagar', 115237.51, 'pendente', v_hoje + 1);

  -- 4. SEEDS: Comissões
  INSERT INTO crm_comissoes (empresa_id, colaborador_nome, tipo, valor, status, descricao)
  VALUES
    (v_empresa_id, 'Taymara Benke', 'colaborador', 133.30, 'pendente', 'Comissão sobre instalação de toldo gourmet - Ana Maria'),
    (v_empresa_id, 'Vendedor Geral 1', 'vendedor', 0.00, 'pendente', 'Ajuste de comissão mensal de vendas');

  -- 5. SEEDS: Retornos
  INSERT INTO crm_retornos (empresa_id, cliente_id, titulo, descricao, data_retorno, hora_retorno, status)
  VALUES
    (v_empresa_id, v_cliente_id_roberto, 'Ligar para confirmar medidas das cortinas', 'Agendado retorno de contato com Sr. Roberto para alinhar detalhes de medidas.', v_hoje, '14:30', 'pendente'),
    (v_empresa_id, v_cliente_id_ana, 'E-mail com novo catálogo de papéis de parede', 'Enviar o catálogo 2026 de papéis geométricos italianos.', v_hoje + 1, '10:00', 'pendente'),
    (v_empresa_id, v_cliente_id_carlos, 'Negociar desconto revestimentos vinílicos', 'Cliente solicitou margem adicional no orçamento de hall corporativo.', v_hoje + 2, '16:00', 'pendente');

END $$;
