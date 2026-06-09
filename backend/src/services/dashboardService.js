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
       p.numero_origem,
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
      numero_origem: p.numero_origem,
      status: p.status,
      cliente_nome: p.cliente_nome,
      consultor_id: p.consultor_id,
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
    `SELECT p.id, p.numero_sequencial, p.numero_origem, p.status, p.verificacao_ok, p.categorizacao_ok,
            p.total, p.created_at AS criado_em,
            p.cliente_id,
            p.cep, p.rua, p.numero AS numero_rua, p.complemento, p.bairro, p.cidade, p.estado,
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

  const [{ rows: anexos }, { rows: vinculos }, { rows: allItems }, { rows: itensRows }] = await Promise.all([
    db.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
    db.query(
      `SELECT 1 FROM pedido_item_vinculos piv
       JOIN pedido_itens pi ON pi.id = piv.item_id
       WHERE pi.pedido_id = $1 LIMIT 1`,
      [pedidoId]
    ),
    db.query(`SELECT 1 FROM pedido_itens WHERE pedido_id = $1 LIMIT 1`, [pedidoId]),
    db.query(
      `SELECT id, descricao, ambiente, quantidade, unidade, em_confeccao, confeccao_ok
       FROM pedido_itens WHERE pedido_id = $1 ORDER BY ordem ASC, id ASC`,
      [pedidoId]
    ),
  ]);
  pedido.itens = itensRows;

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

  // Etapas 1-4 — queries independentes em paralelo
  const [
    { rows: totalItensRows },
    { rows: itensCobertosRows },
    { rows: itensSemCatRows },
    { rows: itensSemVinculoRows },
    { rows: confRows },
    { rows: prodRows },
    { rows: agendadoRows },
  ] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total FROM pedido_itens WHERE pedido_id = $1`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL`,
      [pedidoId, empresaId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS sem_cat
       FROM pedido_itens pi
       LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
       LEFT JOIN produtos prod ON prod.id = oi.produto_id
       WHERE pi.pedido_id = $1
         AND COALESCE(pi.categoria_id, prod.categoria_id) IS NULL`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS sem_vinc
       FROM pedido_itens pi
       WHERE pi.pedido_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
         )`,
      [pedidoId]
    ),
    db.query(
      `SELECT
         COUNT(DISTINCT pi.id)::int AS total,
         COUNT(DISTINCT ci.pedido_item_id) FILTER (WHERE ci.status = 'conferido')::int AS conferidos
       FROM pedido_itens pi
       LEFT JOIN conferencia_itens ci ON ci.pedido_item_id = pi.id AND ci.empresa_id = $2
       WHERE pi.pedido_id = $1`,
      [pedidoId, empresaId]
    ),
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE em_confeccao = true)::int AS em_confeccao,
         COUNT(*) FILTER (WHERE em_confeccao = true AND confeccao_ok = true)::int AS confeccao_ok
       FROM pedido_itens
       WHERE pedido_id = $1`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS agendados
       FROM agendamentos a
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND a.status = 'agendado'
         AND a.agendamento_pai_id IS NULL
         AND EXISTS (
           SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id = a.id
         )`,
      [pedidoId, empresaId]
    ),
  ]);

  const totalItens = totalItensRows[0]?.total ?? 0;
  const itensCobertos = itensCobertosRows[0]?.cobertos ?? 0;
  const itensSemCategoria = itensSemCatRows[0]?.sem_cat ?? 0;
  const itensSemVinculo = itensSemVinculoRows[0]?.sem_vinc ?? 0;
  const { total: totalItensConf, conferidos: itensConferidos } = confRows[0] ?? { total: 0, conferidos: 0 };
  const { em_confeccao: totalEmConf, confeccao_ok: totalConfOk } = prodRows[0] ?? { em_confeccao: 0, confeccao_ok: 0 };
  const genitoresAgendados = agendadoRows[0]?.agendados ?? 0;

  if (!genitoresRaw.length) {
    const etapa1_ok_early = pedido.verificacao_ok &&
                             itensSemCategoria === 0 &&
                             itensSemVinculo === 0 &&
                             totalItens > 0 &&
                             itensCobertos >= totalItens;
    const etapa3_ok_no_gen = totalEmConf === 0;
    return {
      pedido,
      etapa_atual: etapa1_ok_early ? 2 : 1,
      etapas: [
        { numero: 1, concluida: etapa1_ok_early, progresso: { tem_anexo: anexos.length > 0, verificacao_ok: !!pedido.verificacao_ok, itens_sem_categoria: itensSemCategoria, itens_sem_vinculo: itensSemVinculo, total_itens: totalItens, itens_cobertos: itensCobertos } },
        { numero: 2, concluida: false, progresso: { total: totalItensConf, conferidos: itensConferidos } },
        { numero: 3, concluida: etapa3_ok_no_gen, progresso: { em_confeccao: totalEmConf, confeccao_ok: totalConfOk } },
        { numero: 4, concluida: false, progresso: { genitores_agendados: 0 } },
        { numero: 5, concluida: false, progresso: { status: pedido.status } },
      ],
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

  const etapa1_ok = pedido.verificacao_ok &&
                    itensSemCategoria === 0 &&
                    itensSemVinculo === 0 &&
                    totalItens > 0 &&
                    itensCobertos >= totalItens;

  const etapa2_ok = totalItensConf > 0 && itensConferidos >= totalItensConf;

  const etapa3_ok = totalEmConf === 0 || totalConfOk >= totalEmConf;

  const etapa4_ok = genitoresAgendados > 0;

  const etapa5_ok = pedido.status === "concluido";

  let etapa_atual = 1;
  if (etapa1_ok) etapa_atual = 2;
  if (etapa1_ok && etapa2_ok) etapa_atual = 3;
  if (etapa1_ok && etapa2_ok && etapa3_ok) etapa_atual = 4;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok) etapa_atual = 5;
  if (etapa5_ok) etapa_atual = 5;

  const etapas = [
    {
      numero: 1,
      concluida: etapa1_ok,
      progresso: {
        tem_anexo: anexos.length > 0,
        verificacao_ok: !!pedido.verificacao_ok,
        itens_sem_categoria: itensSemCategoria,
        itens_sem_vinculo: itensSemVinculo,
        total_itens: totalItens,
        itens_cobertos: itensCobertos,
      },
    },
    {
      numero: 2,
      concluida: etapa2_ok,
      progresso: { total: totalItensConf, conferidos: itensConferidos },
    },
    {
      numero: 3,
      concluida: etapa3_ok,
      progresso: { em_confeccao: totalEmConf, confeccao_ok: totalConfOk },
    },
    {
      numero: 4,
      concluida: etapa4_ok,
      progresso: { genitores_agendados: genitoresAgendados },
    },
    {
      numero: 5,
      concluida: etapa5_ok,
      progresso: { status: pedido.status },
    },
  ];

  return {
    pedido,
    etapa_atual,
    etapas,
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
