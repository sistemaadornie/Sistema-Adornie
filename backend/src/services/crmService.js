const db = require("../database/db");

// ============================================================
// ESTATÍSTICAS E DASHBOARD CRM
// ============================================================

async function obterEstatisticas(empresaId) {
  // Queries auxiliares para consolidar dados na data atual
  const dateConds = {
    diario:   "created_at >= CURRENT_DATE",
    semanal:  "created_at >= date_trunc('week', CURRENT_DATE)",
    mensal:   "created_at >= date_trunc('month', CURRENT_DATE)",
  };

  const finConds = {
    diario:   "vencimento_em = CURRENT_DATE",
    semanal:  "vencimento_em >= date_trunc('week', CURRENT_DATE) AND vencimento_em < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'",
    mensal:   "vencimento_em >= date_trunc('month', CURRENT_DATE) AND vencimento_em < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'",
  };

  // 1. Vendas - Orçamentos
  const orcVendasRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'novo' THEN valor END), 0) as novos,
      COALESCE(SUM(CASE WHEN status = 'perdido' THEN valor END), 0) as perdidos,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.diario} THEN valor END), 0) as diario,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.semanal} THEN valor END), 0) as semanal,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.mensal} THEN valor END), 0) as mensal
    FROM crm_orcamentos
    WHERE empresa_id = $1 AND tipo = 'venda' AND deleted_at IS NULL
  `, [empresaId]);

  // 2. Vendas - Pedidos (carrega da tabela 'pedidos' e junta itens)
  const pedVendasRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN p.status IN ('pendente', 'em_andamento') THEN pi.quantidade * pi.valor END), 0) as novos,
      COALESCE(SUM(CASE WHEN p.status = 'cancelado' THEN pi.quantidade * pi.valor END), 0) as cancelados,
      COALESCE(SUM(CASE WHEN p.status = 'concluido' AND p.created_at >= CURRENT_DATE THEN pi.quantidade * pi.valor END), 0) as diario,
      COALESCE(SUM(CASE WHEN p.status = 'concluido' AND p.created_at >= date_trunc('week', CURRENT_DATE) THEN pi.quantidade * pi.valor END), 0) as semanal,
      COALESCE(SUM(CASE WHEN p.status = 'concluido' AND p.created_at >= date_trunc('month', CURRENT_DATE) THEN pi.quantidade * pi.valor END), 0) as mensal
    FROM pedidos p
    LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
    WHERE p.empresa_id = $1 AND p.deleted_at IS NULL
  `, [empresaId]);

  // 3. Financeiro - Contas a Receber
  const finReceberRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor END), 0) as pendentes,
      COALESCE(SUM(CASE WHEN status = 'vencido' OR (status = 'pendente' AND vencimento_em < CURRENT_DATE) THEN valor END), 0) as vencidos,
      COALESCE(SUM(CASE WHEN ${finConds.diario} THEN valor END), 0) as diario,
      COALESCE(SUM(CASE WHEN ${finConds.semanal} THEN valor END), 0) as semanal,
      COALESCE(SUM(CASE WHEN ${finConds.mensal} THEN valor END), 0) as mensal
    FROM crm_financeiro
    WHERE empresa_id = $1 AND tipo = 'receber' AND deleted_at IS NULL
  `, [empresaId]);

  // 4. Financeiro - Contas a Pagar
  const finPagarRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor END), 0) as pendentes,
      COALESCE(SUM(CASE WHEN status = 'vencido' OR (status = 'pendente' AND vencimento_em < CURRENT_DATE) THEN valor END), 0) as vencidos,
      COALESCE(SUM(CASE WHEN ${finConds.diario} THEN valor END), 0) as diario,
      COALESCE(SUM(CASE WHEN ${finConds.semanal} THEN valor END), 0) as semanal,
      COALESCE(SUM(CASE WHEN ${finConds.mensal} THEN valor END), 0) as mensal
    FROM crm_financeiro
    WHERE empresa_id = $1 AND tipo = 'pagar' AND deleted_at IS NULL
  `, [empresaId]);

  // 5. Compras - Orçamentos (tipo: compra)
  const orcComprasRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'novo' THEN valor END), 0) as novos,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.diario} THEN valor END), 0) as diario,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.semanal} THEN valor END), 0) as semanal,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.mensal} THEN valor END), 0) as mensal
    FROM crm_orcamentos
    WHERE empresa_id = $1 AND tipo = 'compra' AND deleted_at IS NULL
  `, [empresaId]);

  // 6. Compras - Pedidos (tipo: compra)
  const pedComprasRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'novo' THEN valor END), 0) as novos,
      COALESCE(SUM(CASE WHEN status = 'cancelado' THEN valor END), 0) as cancelados,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.diario} THEN valor END), 0) as diario,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.semanal} THEN valor END), 0) as semanal,
      COALESCE(SUM(CASE WHEN status = 'aprovado' AND ${dateConds.mensal} THEN valor END), 0) as mensal
    FROM crm_orcamentos -- ou crm_pedidos_compra se criado, como é mock usaremos orcamento aprovado tipo compra
    WHERE empresa_id = $1 AND tipo = 'compra' AND status = 'aprovado' AND deleted_at IS NULL
  `, [empresaId]);

  // 7. Comissões
  const comissoesRes = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'colaborador' AND status = 'pendente' THEN valor END), 0) as colaboradores_pendentes,
      COALESCE(SUM(CASE WHEN tipo = 'vendedor' AND status = 'pendente' THEN valor END), 0) as vendedores_pendentes
    FROM crm_comissoes
    WHERE empresa_id = $1 AND deleted_at IS NULL
  `, [empresaId]);

  return {
    vendas: {
      orcamentos: orcVendasRes.rows[0],
      pedidos: pedVendasRes.rows[0]
    },
    financeiro: {
      receber: finReceberRes.rows[0],
      pagar: finPagarRes.rows[0]
    },
    compras: {
      orcamentos: orcComprasRes.rows[0],
      pedidos: pedComprasRes.rows[0]
    },
    comissoes: {
      colaboradores: comissoesRes.rows[0].colaboradores_pendentes,
      vendedores: comissoesRes.rows[0].vendedores_pendentes
    }
  };
}

async function obterDadosPainel(empresaId) {
  // 1. Retornos ativos
  const retornos = await db.query(`
    SELECT r.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone
    FROM crm_retornos r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    WHERE r.empresa_id = $1 AND r.deleted_at IS NULL
    ORDER BY r.status ASC, r.data_retorno ASC, r.hora_retorno ASC
    LIMIT 20
  `, [empresaId]);

  // 2. Próximos Agendamentos (Tabela principal agendamentos)
  const agendamentos = await db.query(`
    SELECT id, titulo, cliente, tipo, data, hora, status, endereco
    FROM agendamentos
    WHERE empresa_id = $1 AND data >= CURRENT_DATE - INTERVAL '1 day'
    ORDER BY data ASC, hora ASC
    LIMIT 20
  `, [empresaId]);

  // 3. Pedidos recentes (Tabela principal pedidos)
  const pedidos = await db.query(`
    SELECT p.id, p.status, p.created_at, c.nome AS cliente_nome,
           (SELECT COALESCE(SUM(quantidade * valor), 0) FROM pedido_itens WHERE pedido_id = p.id) AS valor_total
    FROM pedidos p
    LEFT JOIN clientes c ON c.id = p.cliente_id
    WHERE p.empresa_id = $1 AND p.deleted_at IS NULL
    ORDER BY p.created_at DESC
    LIMIT 10
  `, [empresaId]);

  // 4. Todos os agendamentos do mês/ano atual para o calendário
  const agendamentosCalendario = await db.query(`
    SELECT id, titulo, cliente, tipo, data, hora, status
    FROM agendamentos
    WHERE empresa_id = $1 AND data >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
      AND data <= date_trunc('month', CURRENT_DATE) + INTERVAL '2 months'
  `, [empresaId]);

  return {
    retornos: retornos.rows,
    agendamentos: agendamentos.rows,
    pedidos: pedidos.rows,
    calendario: agendamentosCalendario.rows
  };
}

// ============================================================
// CRUD ORÇAMENTOS
// ============================================================

async function listarOrcamentos(empresaId, { q, status, tipo } = {}) {
  const params = [empresaId];
  const conds = ["o.deleted_at IS NULL"];

  if (tipo) {
    params.push(tipo);
    conds.push(`o.tipo = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conds.push(`o.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conds.push(`(o.titulo ILIKE $${params.length} OR c.nome ILIKE $${params.length} OR f.nome ILIKE $${params.length} OR o.numero ILIKE $${params.length})`);
  }

  const query = `
    SELECT o.*,
           c.nome      AS cliente_nome,    c.telefone AS cliente_telefone,
           f.nome      AS fornecedor_nome, f.telefone AS fornecedor_telefone
    FROM crm_orcamentos o
    LEFT JOIN clientes    c ON c.id = o.cliente_id
    LEFT JOIN fornecedores f ON f.id = o.fornecedor_id
    WHERE o.empresa_id = $1 AND ${conds.join(" AND ")}
    ORDER BY o.created_at DESC
  `;
  const res = await db.query(query, params);
  return res.rows;
}

async function buscarOrcamento(id, empresaId) {
  const res = await db.query(`
    SELECT o.*,
           c.nome      AS cliente_nome,    c.telefone AS cliente_telefone,
           f.nome      AS fornecedor_nome, f.telefone AS fornecedor_telefone
    FROM crm_orcamentos o
    LEFT JOIN clientes    c ON c.id = o.cliente_id
    LEFT JOIN fornecedores f ON f.id = o.fornecedor_id
    WHERE o.id = $1 AND o.empresa_id = $2 AND o.deleted_at IS NULL
  `, [id, empresaId]);
  return res.rows[0] || null;
}

async function criarOrcamento(empresaId, userId, userName, dados) {
  const { cliente_id, fornecedor_id, tipo = "venda", titulo, descricao, valor = 0, status = "novo", arquiteto_id, vendedora_id } = dados;

  const countRes = await db.query(`SELECT COUNT(*) FROM crm_orcamentos WHERE empresa_id = $1 AND tipo = $2`, [empresaId, tipo]);
  const seq = Number(countRes.rows[0].count) + 1;
  const prefix = tipo === "venda" ? "ORC" : "COMP";
  const numero = `${prefix}-${String(seq).padStart(4, "0")}`;

  const res = await db.query(`
    INSERT INTO crm_orcamentos (empresa_id, cliente_id, fornecedor_id, tipo, numero, titulo, descricao, valor, status, criado_por, arquiteto_id, vendedora_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [empresaId, cliente_id || null, fornecedor_id || null, tipo, numero, titulo, descricao || null, valor, status, userId, arquiteto_id || null, vendedora_id || null]);

  const orcId = res.rows[0].id;

  return buscarOrcamento(orcId, empresaId);
}

async function atualizarOrcamento(id, empresaId, dados, userId = null, userName = null) {
  const { cliente_id, fornecedor_id, titulo, descricao, valor, status, arquiteto_id, vendedora_id } = dados;

  const res = await db.query(`
    UPDATE crm_orcamentos
    SET cliente_id    = COALESCE($1, cliente_id),
        fornecedor_id = COALESCE($2, fornecedor_id),
        titulo        = COALESCE($3, titulo),
        descricao     = COALESCE($4, descricao),
        valor         = COALESCE($5, valor),
        status        = COALESCE($6, status),
        arquiteto_id  = $9,
        vendedora_id  = $10,
        updated_at    = NOW()
    WHERE id = $7 AND empresa_id = $8 AND deleted_at IS NULL
    RETURNING id
  `, [cliente_id || null, fornecedor_id || null, titulo, descricao, valor, status, id, empresaId,
      arquiteto_id || null, vendedora_id || null]);

  if (res.rows.length === 0) throw new Error("Orçamento não encontrado.");

  return buscarOrcamento(id, empresaId);
}

async function excluirOrcamento(id, empresaId) {
  const res = await db.query(`
    UPDATE crm_orcamentos SET deleted_at = NOW()
    WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
    RETURNING id
  `, [id, empresaId]);
  if (res.rows.length === 0) throw new Error("Orçamento não encontrado.");
}

// ============================================================
// CRUD FINANCEIRO
// ============================================================

async function listarFinanceiro(empresaId, { q, status, tipo } = {}) {
  const params = [empresaId];
  const conds = ["cf.deleted_at IS NULL"];

  if (tipo) {
    params.push(tipo);
    conds.push(`cf.tipo = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conds.push(`cf.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conds.push(`(cf.descricao ILIKE $${params.length} OR f.nome ILIKE $${params.length})`);
  }

  const query = `
    SELECT cf.*, f.nome AS fornecedor_nome
    FROM crm_financeiro cf
    LEFT JOIN fornecedores f ON f.id = cf.fornecedor_id
    WHERE cf.empresa_id = $1 AND ${conds.join(" AND ")}
    ORDER BY cf.vencimento_em ASC, cf.id DESC
  `;
  const res = await db.query(query, params);
  return res.rows;
}

async function buscarFinanceiro(id, empresaId) {
  const res = await db.query(`
    SELECT cf.*, f.nome AS fornecedor_nome
    FROM crm_financeiro cf
    LEFT JOIN fornecedores f ON f.id = cf.fornecedor_id
    WHERE cf.id = $1 AND cf.empresa_id = $2 AND cf.deleted_at IS NULL
  `, [id, empresaId]);
  return res.rows[0] || null;
}

async function criarFinanceiro(empresaId, dados) {
  const { descricao, tipo, valor, status = "pendente", vencimento_em, pagamento_em, fornecedor_id } = dados;
  const res = await db.query(`
    INSERT INTO crm_financeiro (empresa_id, descricao, tipo, valor, status, vencimento_em, pagamento_em, fornecedor_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `, [empresaId, descricao, tipo, valor, status, vencimento_em, pagamento_em || null, fornecedor_id || null]);
  return buscarFinanceiro(res.rows[0].id, empresaId);
}

async function atualizarFinanceiro(id, empresaId, dados) {
  const { descricao, valor, status, vencimento_em, pagamento_em, fornecedor_id } = dados;
  const res = await db.query(`
    UPDATE crm_financeiro
    SET descricao     = COALESCE($1, descricao),
        valor         = COALESCE($2, valor),
        status        = COALESCE($3, status),
        vencimento_em = COALESCE($4, vencimento_em),
        pagamento_em  = $5,
        fornecedor_id = COALESCE($6, fornecedor_id),
        updated_at    = NOW()
    WHERE id = $7 AND empresa_id = $8 AND deleted_at IS NULL
    RETURNING id
  `, [descricao, valor, status, vencimento_em, pagamento_em || null, fornecedor_id || null, id, empresaId]);

  if (res.rows.length === 0) throw new Error("Lançamento financeiro não encontrado.");
  return buscarFinanceiro(id, empresaId);
}

async function excluirFinanceiro(id, empresaId) {
  const res = await db.query(`
    UPDATE crm_financeiro SET deleted_at = NOW()
    WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
    RETURNING id
  `, [id, empresaId]);
  if (res.rows.length === 0) throw new Error("Lançamento financeiro não encontrado.");
}

// ============================================================
// CRUD COMISSÕES
// ============================================================

async function listarComissoes(empresaId, { tipo, status } = {}) {
  const params = [empresaId];
  const conds = ["deleted_at IS NULL"];

  if (tipo) {
    params.push(tipo);
    conds.push(`tipo = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conds.push(`status = $${params.length}`);
  }

  const query = `
    SELECT * FROM crm_comissoes
    WHERE empresa_id = $1 AND ${conds.join(" AND ")}
    ORDER BY created_at DESC
  `;
  const res = await db.query(query, params);
  return res.rows;
}

async function criarComissao(empresaId, dados) {
  const { colaborador_id, colaborador_nome, tipo, valor, status = "pendente", descricao } = dados;
  const res = await db.query(`
    INSERT INTO crm_comissoes (empresa_id, colaborador_id, colaborador_nome, tipo, valor, status, descricao)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [empresaId, colaborador_id || null, colaborador_nome, tipo, valor, status, descricao || null]);

  const created = await db.query(`SELECT * FROM crm_comissoes WHERE id = $1`, [res.rows[0].id]);
  return created.rows[0];
}

async function atualizarComissao(id, empresaId, dados) {
  const { status, pagamento_em } = dados;
  const res = await db.query(`
    UPDATE crm_comissoes
    SET status = COALESCE($1, status),
        pagamento_em = COALESCE($2, pagamento_em),
        updated_at = NOW()
    WHERE id = $3 AND empresa_id = $4 AND deleted_at IS NULL
    RETURNING *
  `, [status, pagamento_em || null, id, empresaId]);

  if (res.rows.length === 0) throw new Error("Comissão não encontrada.");
  return res.rows[0];
}

// ============================================================
// CRUD RETORNOS
// ============================================================

async function listarRetornos(empresaId, { status } = {}) {
  const params = [empresaId];
  const conds = ["r.deleted_at IS NULL"];

  if (status) {
    params.push(status);
    conds.push(`r.status = $${params.length}`);
  }

  const query = `
    SELECT r.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone
    FROM crm_retornos r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    WHERE r.empresa_id = $1 AND ${conds.join(" AND ")}
    ORDER BY r.status ASC, r.data_retorno ASC
  `;
  const res = await db.query(query, params);
  return res.rows;
}

async function criarRetorno(empresaId, dados) {
  const { cliente_id, titulo, descricao, data_retorno, hora_retorno } = dados;
  const res = await db.query(`
    INSERT INTO crm_retornos (empresa_id, cliente_id, titulo, descricao, data_retorno, hora_retorno, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pendente')
    RETURNING id
  `, [empresaId, cliente_id || null, titulo, descricao || null, data_retorno, hora_retorno || null]);

  const created = await db.query(`
    SELECT r.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone
    FROM crm_retornos r
    LEFT JOIN clientes c ON c.id = r.cliente_id
    WHERE r.id = $1
  `, [res.rows[0].id]);
  return created.rows[0];
}

async function concluirRetorno(id, empresaId) {
  const current = await db.query(`SELECT status FROM crm_retornos WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (current.rows.length === 0) throw new Error("Retorno não encontrado.");
  const nextStatus = current.rows[0].status === "pendente" ? "concluido" : "pendente";

  const res = await db.query(`
    UPDATE crm_retornos
    SET status = $1, updated_at = NOW()
    WHERE id = $2 AND empresa_id = $3
    RETURNING *
  `, [nextStatus, id, empresaId]);

  return res.rows[0];
}

async function excluirRetorno(id, empresaId) {
  const res = await db.query(`
    UPDATE crm_retornos SET deleted_at = NOW()
    WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
    RETURNING id
  `, [id, empresaId]);
  if (res.rows.length === 0) throw new Error("Retorno não encontrado.");
}

module.exports = {
  obterEstatisticas,
  obterDadosPainel,
  // Orcamentos
  listarOrcamentos,
  buscarOrcamento,
  criarOrcamento,
  atualizarOrcamento,
  excluirOrcamento,
  // Financeiro
  listarFinanceiro,
  buscarFinanceiro,
  criarFinanceiro,
  atualizarFinanceiro,
  excluirFinanceiro,
  // Comissões
  listarComissoes,
  criarComissao,
  atualizarComissao,
  // Retornos
  listarRetornos,
  criarRetorno,
  concluirRetorno,
  excluirRetorno
};
