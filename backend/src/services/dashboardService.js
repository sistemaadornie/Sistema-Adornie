"use strict";
const db = require("../database/db");

function calcNivelAlerta(diasParaPrazo) {
  if (diasParaPrazo == null) return null;
  if (diasParaPrazo <= 0)  return "atrasado";
  if (diasParaPrazo <= 7)  return "urgente";
  if (diasParaPrazo <= 14) return "atencao";
  return null;
}

async function listarPedidosDashboard(empresaId, userId, permissoes, filtros = {}) {
  const { consultora_id, status, alerta } = filtros;
  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  const params = [empresaId];
  const conditions = ["p.empresa_id = $1"];

  if (!temPermGeral) {
    params.push(userId);
    conditions.push(`p.consultor_id = $${params.length}`);
  } else if (consultora_id) {
    params.push(Number(consultora_id));
    conditions.push(`p.consultor_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  const where = conditions.join(" AND ");

  const { rows: pedidos } = await db.query(
    `SELECT
       p.id,
       p.numero_sequencial,
       p.status,
       p.verificacao_ok,
       p.categorizacao_ok,
       p.total,
       p.created_at AS criado_em,
       c.nome                                                   AS cliente_nome,
       u.nome_completo                                          AS consultor_nome,
       u.id                                                     AS consultor_id,
       COUNT(pi.id)                                             AS itens_count,
       EXISTS (
         SELECT 1 FROM pedido_anexos pa WHERE pa.pedido_id = p.id
       )                                                        AS pdf_ok,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM pedido_itens pi_check WHERE pi_check.pedido_id = p.id)
           THEN true
         WHEN EXISTS (
           SELECT 1 FROM pedido_item_vinculos piv
           JOIN pedido_itens pi2 ON pi2.id = piv.item_id
           WHERE pi2.pedido_id = p.id
         ) THEN true
         ELSE false
       END                                                      AS vinculos_ok
     FROM pedidos p
     LEFT JOIN clientes    c  ON c.id  = p.cliente_id
     LEFT JOIN usuarios    u  ON u.id  = p.consultor_id
     LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
     WHERE ${where}
     GROUP BY p.id, c.nome, u.nome_completo, u.id
     ORDER BY p.created_at DESC`,
    params
  );

  if (!pedidos.length) return [];

  const pedidoIds = pedidos.map((p) => p.id);

  // Genitores: agendamentos com pedido_id + itens de pedido vinculados
  const { rows: preAgs } = await db.query(
    `SELECT a.id, a.pedido_id, a.status, a.data AS data_inicio, COUNT(ai.id) AS itens_count
     FROM agendamentos a
     JOIN agendamento_itens ai ON ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
     WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
     GROUP BY a.id`,
    [pedidoIds, empresaId]
  );

  const preAgsPorPedido = {};
  for (const ag of preAgs) {
    if (!preAgsPorPedido[ag.pedido_id]) preAgsPorPedido[ag.pedido_id] = [];
    preAgsPorPedido[ag.pedido_id].push({
      id: ag.id,
      data_inicio: ag.data_inicio,
      status: ag.status,
      itens_count: Number(ag.itens_count),
    });
  }

  const hoje = new Date();

  const resultado = pedidos.map((p) => {
    const preAgendamentos = preAgsPorPedido[p.id] || [];
    const futuros = preAgendamentos.filter(
      (a) => a.status === "pre_agendado" || a.status === "agendado"
    );
    futuros.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
    const proximoPrazo = futuros[0]?.data_inicio || null;
    const diasParaPrazo = proximoPrazo
      ? Math.floor((new Date(proximoPrazo) - hoje) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: p.id,
      numero_sequencial: p.numero_sequencial,
      status: p.status,
      cliente_nome: p.cliente_nome,
      consultor_nome: p.consultor_nome,
      total: p.total,
      itens_count: Number(p.itens_count),
      criado_em: p.criado_em,
      estagio: {
        pdf_ok: p.pdf_ok,
        verificacao_ok: p.verificacao_ok,
        categorizacao_ok: p.categorizacao_ok,
        vinculos_ok: p.vinculos_ok,
        pre_agendamentos: preAgendamentos,
        proximo_prazo: proximoPrazo,
        dias_para_prazo: diasParaPrazo,
        nivel_alerta: calcNivelAlerta(diasParaPrazo),
      },
    };
  });

  if (alerta) return resultado.filter((p) => p.estagio.nivel_alerta === alerta);
  return resultado;
}

async function buscarFluxoPedido(pedidoId, empresaId, userId, permissoes) {
  const { rows: pedidos } = await db.query(
    `SELECT p.id, p.numero_sequencial, p.status, p.verificacao_ok, p.categorizacao_ok,
            p.total, p.created_at AS criado_em,
            c.nome          AS cliente_nome,
            u.nome_completo AS consultor_nome,
            u.id            AS consultor_id
     FROM pedidos p
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN usuarios u ON u.id = p.consultor_id
     WHERE p.id = $1 AND p.empresa_id = $2`,
    [pedidoId, empresaId]
  );

  if (!pedidos.length) {
    const err = new Error("Pedido não encontrado");
    err.status = 404;
    throw err;
  }

  const pedido = pedidos[0];
  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");
  if (!temPermGeral && Number(pedido.consultor_id) !== Number(userId)) {
    const err = new Error("Acesso negado");
    err.status = 403;
    throw err;
  }

  const [{ rows: anexos }, { rows: vinculos }, { rows: allItems }] = await Promise.all([
    db.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
    db.query(
      `SELECT 1 FROM pedido_item_vinculos piv
       JOIN pedido_itens pi ON pi.id = piv.item_id
       WHERE pi.pedido_id = $1 LIMIT 1`,
      [pedidoId]
    ),
    db.query(`SELECT 1 FROM pedido_itens WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
  ]);

  const { rows: genitoresRaw } = await db.query(
    `SELECT a.id, a.status, a.tipo, a.data AS data_inicio
     FROM agendamentos a
     WHERE a.pedido_id = $1 AND a.empresa_id = $2
       AND EXISTS (
         SELECT 1 FROM agendamento_itens ai
         WHERE ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
       )
     ORDER BY a.data`,
    [pedidoId, empresaId]
  );

  const vinculos_ok = allItems.length === 0 || vinculos.length > 0;
  const estagio_base = {
    pdf_ok: anexos.length > 0,
    verificacao_ok: pedido.verificacao_ok,
    categorizacao_ok: pedido.categorizacao_ok,
    vinculos_ok,
  };

  if (!genitoresRaw.length) {
    return {
      pedido,
      estagio: { ...estagio_base, pre_agendamentos: [], proximo_prazo: null, dias_para_prazo: null, nivel_alerta: null },
      pre_agendamentos: [],
    };
  }

  const genitoreIds = genitoresRaw.map((g) => g.id);

  const [{ rows: itensPorGenitor }, { rows: herdeirosRaw }] = await Promise.all([
    db.query(
      `SELECT ai.agendamento_id, ai.pedido_item_id, pi.descricao
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
      [genitoreIds]
    ),
    db.query(
      `SELECT id, agendamento_pai_id, tipo, status, data AS data_inicio
       FROM agendamentos
       WHERE agendamento_pai_id = ANY($1) AND empresa_id = $2
       ORDER BY data`,
      [genitoreIds, empresaId]
    ),
  ]);

  const itensPorAg = {};
  for (const item of itensPorGenitor) {
    if (!itensPorAg[item.agendamento_id]) itensPorAg[item.agendamento_id] = [];
    itensPorAg[item.agendamento_id].push({ pedido_item_id: item.pedido_item_id, descricao: item.descricao });
  }

  const herdeirosporPai = {};
  for (const h of herdeirosRaw) {
    if (!herdeirosporPai[h.agendamento_pai_id]) herdeirosporPai[h.agendamento_pai_id] = [];
    herdeirosporPai[h.agendamento_pai_id].push({ id: h.id, tipo: h.tipo, status: h.status, data_inicio: h.data_inicio });
  }

  const pre_agendamentos = genitoresRaw.map((g) => ({
    id: g.id,
    data_inicio: g.data_inicio,
    status: g.status,
    itens: itensPorAg[g.id] || [],
    herdeiros: herdeirosporPai[g.id] || [],
  }));

  const hoje = new Date();
  const futuros = pre_agendamentos
    .filter((a) => a.status === "pre_agendado" || a.status === "agendado")
    .sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
  const proximoPrazo = futuros[0]?.data_inicio || null;
  const diasParaPrazo = proximoPrazo
    ? Math.floor((new Date(proximoPrazo) - hoje) / (1000 * 60 * 60 * 24))
    : null;

  return {
    pedido,
    estagio: {
      ...estagio_base,
      pre_agendamentos: pre_agendamentos.map((a) => ({
        id: a.id, data_inicio: a.data_inicio, status: a.status, itens_count: a.itens.length,
      })),
      proximo_prazo: proximoPrazo,
      dias_para_prazo: diasParaPrazo,
      nivel_alerta: calcNivelAlerta(diasParaPrazo),
    },
    pre_agendamentos,
  };
}

module.exports = { listarPedidosDashboard, buscarFluxoPedido };
