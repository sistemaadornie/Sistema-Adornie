"use strict";
const db = require("../database/db");
const { encontrarVinculosControle } = require('./vinculoAutomaticoService');
const { labelProdutoConferencia } = require('../utils/produtoLabel');

function calcNivelAlerta(diasParaPrazo) {
  if (diasParaPrazo == null) return null;
  if (diasParaPrazo <= 0)  return "atrasado";
  if (diasParaPrazo <= 7)  return "urgente";
  if (diasParaPrazo <= 14) return "atencao";
  return null;
}

function calcularPrazoEAlerta(preAgendamentos, hoje = new Date()) {
  const futuros = (preAgendamentos || []).filter(
    (a) => a.status === "pre_agendado" || a.status === "agendado"
  );
  futuros.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
  const proximoPrazo = futuros[0]?.data_inicio || null;
  const diasParaPrazo = proximoPrazo
    ? Math.floor((new Date(proximoPrazo) - hoje) / (1000 * 60 * 60 * 24))
    : null;
  return { proximoPrazo, diasParaPrazo, nivelAlerta: calcNivelAlerta(diasParaPrazo) };
}

function calcularEtapaAtual({
  verificacaoOk,
  itensSemCategoria,
  itensSemVinculo,
  totalItens,
  itensCobertos,
  totalItensConferencia,
  itensComConferenciaConsultorasPreenchida,
  totalItensConf,
  itensConferidos,
  totalEmConf,
  totalConfOk,
  itensComProdutoOk,
  genitoresAgendados,
  instalacoesTotal,
  instalacoesConcluidas,
  totalItensInstalacao,
  itensSeparados,
  status,
}) {
  const conferenciaConsultorasOk = (totalItensConferencia ?? 0) === 0 ||
                        (itensComConferenciaConsultorasPreenchida ?? 0) >= totalItensConferencia;
  const etapa1_ok = verificacaoOk &&
                    itensSemCategoria === 0 &&
                    itensSemVinculo === 0 &&
                    totalItens > 0 &&
                    conferenciaConsultorasOk;

  const etapa2_ok = totalItensConf > 0 && itensConferidos >= totalItensConf;

  const etapa3_ok = totalItens > 0 && totalConfOk >= totalItens;

  const etapa4_ok = totalItens > 0 && itensComProdutoOk >= totalItens;

  const etapa5_ok = genitoresAgendados > 0;

  const etapa6_ok = instalacoesTotal > 0 &&
                    totalItensInstalacao > 0 &&
                    itensSeparados >= totalItensInstalacao;

  const etapa7_ok = instalacoesTotal > 0 && instalacoesConcluidas >= instalacoesTotal;

  const etapa8_ok = status === "concluido";

  let etapa_atual = 1;
  if (etapa1_ok) etapa_atual = 2;
  if (etapa1_ok && etapa2_ok) etapa_atual = 3;
  if (etapa1_ok && etapa2_ok && etapa3_ok) etapa_atual = 4;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok) etapa_atual = 5;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok && etapa5_ok) etapa_atual = 6;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok && etapa5_ok && etapa6_ok) etapa_atual = 7;
  if (etapa1_ok && etapa2_ok && etapa3_ok && etapa4_ok && etapa5_ok && etapa6_ok && etapa7_ok) etapa_atual = 8;
  if (etapa8_ok) etapa_atual = 8;

  return {
    etapa_atual,
    etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok,
    etapa5_ok, etapa6_ok, etapa7_ok, etapa8_ok,
  };
}

async function listarPedidosDashboard(empresaId, userId, permissoes, filtros = {}) {
  const { consultora_id, status, alerta, busca } = filtros;
  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");

  const params = [empresaId];
  const conditions = ["p.empresa_id = $1"];

  if (!temPermGeral) {
    params.push(userId);
    conditions.push(`p.consultor_id = $${params.length}`);
  } else if (consultora_id) {
    params.push(consultora_id);
    conditions.push(`p.consultor_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  if (busca) {
    params.push(`%${busca}%`);
    conditions.push(`(
      c.nome ILIKE $${params.length}
      OR p.numero_origem ILIKE $${params.length}
      OR p.numero_sequencial::text ILIKE $${params.length}
      OR EXISTS (
        SELECT 1 FROM arquitetos arq
        WHERE arq.id = p.arquiteto_id AND arq.nome ILIKE $${params.length} AND arq.deleted_at IS NULL
      )
    )`);
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
       p.cliente_id,
       p.cidade,
       p.bairro,
       p.data_pedido,
       p.created_at AS criado_em,
       c.nome                                                   AS cliente_nome,
       u.nome_completo                                          AS consultor_nome,
       u.id                                                     AS consultor_id,
       COUNT(pi.id) FILTER (WHERE pi.item_pai_id IS NULL) AS itens_count,
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

  const [
    { rows: preAgs },
    { rows: totalItensRows },
    { rows: itensCobertosRows },
    { rows: totalConferenciaRows },
    { rows: itensCobertosConferenciaRows },
    { rows: itensSemCatRows },
    { rows: itensSemVincRows },
    { rows: confRows },
    { rows: prodRows },
    { rows: agendadoRows },
    { rows: produtoOkRows },
    { rows: instalacaoRows },
    { rows: separacaoRows },
    { rows: itensComConferenciaConsultorasRows },
  ] = await Promise.all([
    // Genitores: agendamentos com pedido_id + itens de pedido vinculados
    db.query(
      `SELECT a.id, a.pedido_id, a.status, TO_CHAR(a.data, 'YYYY-MM-DD') AS data_inicio, COUNT(ai.id) AS itens_count
       FROM agendamentos a
       JOIN agendamento_itens ai ON ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
       GROUP BY a.id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 1: total de itens por pedido
    db.query(
      `SELECT pedido_id, COUNT(*)::int AS total
       FROM pedido_itens pi
       WHERE pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
    // Etapa 1: itens cobertos por agendamento de Instalação (genitor) por pedido
    db.query(
      `SELECT a.pedido_id, COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL
         AND a.tipo = 'Instalação'
       GROUP BY a.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 1: total de itens que necessitam conferência por pedido
    db.query(
      `SELECT pi.pedido_id, COUNT(DISTINCT pi.id)::int AS total
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = ANY($1) AND cat.necessita_conferencia = true
         AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
    // Etapa 1: itens cobertos por agendamento de Conferência por pedido
    db.query(
      `SELECT a.pedido_id, COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado')
         AND a.agendamento_pai_id IS NULL
         AND a.tipo = 'Conferência'
         AND cat.necessita_conferencia = true
       GROUP BY a.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 1: itens sem categoria por pedido
    db.query(
      `SELECT pi.pedido_id, COUNT(*)::int AS sem_cat
       FROM pedido_itens pi
       LEFT JOIN orcamento_itens oi ON oi.id = pi.orcamento_item_id
       LEFT JOIN produtos prod ON prod.id = oi.produto_id
       WHERE pi.pedido_id = ANY($1)
         AND pi.item_pai_id IS NULL
         AND COALESCE(pi.categoria_id, prod.categoria_id) IS NULL
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
    // Etapa 1: itens sem vinculo por pedido
    db.query(
      `SELECT pi.pedido_id, COUNT(*)::int AS sem_vinc
       FROM pedido_itens pi
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = ANY($1)
         AND pi.item_pai_id IS NULL
         AND COALESCE(cat.vinculavel, false) = true
         AND pi.sem_vinculo = false
         AND NOT EXISTS (
           SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
         )
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
    // Etapa 2: conferencia por pedido (Ficha de Conferência Técnica — ordem_servico.dados_tecnicos)
    db.query(
      `SELECT pi.pedido_id,
              COUNT(DISTINCT pi.id)::int AS total,
              COUNT(DISTINCT pi.id) FILTER (WHERE os.dados_tecnicos IS NOT NULL)::int AS conferidos
       FROM pedido_itens pi
       LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE pi.pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
    // Etapa 3: confeccao por pedido
    db.query(
      `SELECT pedido_id,
              COUNT(*) FILTER (WHERE em_confeccao = true)::int AS em_confeccao,
              COUNT(*) FILTER (WHERE em_confeccao = true AND confeccao_ok = true)::int AS confeccao_ok
       FROM pedido_itens pi
       WHERE pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
    // Etapa 5: genitores agendados por pedido
    db.query(
      `SELECT a.pedido_id, COUNT(*)::int AS agendados
       FROM agendamentos a
       WHERE a.pedido_id = ANY($1) AND a.empresa_id = $2
         AND a.status = 'agendado'
         AND a.agendamento_pai_id IS NULL
         AND EXISTS (
           SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id = a.id
         )
       GROUP BY a.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 4: itens com produto_ok por pedido
    db.query(
      `SELECT pedido_id, COUNT(*) FILTER (WHERE produto_ok = true)::int AS produto_ok
       FROM pedido_itens pi
       WHERE pedido_id = ANY($1) AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
       GROUP BY pedido_id`,
      [pedidoIds]
    ),
    // Etapa 6/7: instalacoes (herdeiros tipo Instalacao) por pedido, via genitor
    db.query(
      `SELECT g.pedido_id,
              COUNT(*)::int AS instalacoes_total,
              COUNT(*) FILTER (WHERE h.status = 'concluido')::int AS instalacoes_concluidas
       FROM agendamentos h
       JOIN agendamentos g ON g.id = h.agendamento_pai_id
       WHERE g.pedido_id = ANY($1) AND h.empresa_id = $2 AND h.tipo = 'Instalação'
       GROUP BY g.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 6: itens de separacao das instalacoes por pedido
    db.query(
      `SELECT g.pedido_id,
              COUNT(ai.id)::int AS total_itens_instalacao,
              COUNT(ai.id) FILTER (WHERE ai.separado = true)::int AS itens_separados
       FROM agendamentos h
       JOIN agendamentos g ON g.id = h.agendamento_pai_id
       JOIN agendamento_itens ai ON ai.agendamento_id = h.id AND ai.pedido_item_id IS NOT NULL
       WHERE g.pedido_id = ANY($1) AND h.empresa_id = $2 AND h.tipo = 'Instalação'
       GROUP BY g.pedido_id`,
      [pedidoIds, empresaId]
    ),
    // Etapa 1: itens com Ficha de Conferência Consultoras preenchida por pedido
    db.query(
      `SELECT pi.pedido_id, COUNT(DISTINCT pi.id)::int AS total
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE pi.pedido_id = ANY($1) AND cat.necessita_conferencia = true
         AND NOT (pi.item_pai_id IS NULL AND pi.expandido = true)
         AND os.dados_conferencia_consultoras IS NOT NULL
       GROUP BY pi.pedido_id`,
      [pedidoIds]
    ),
  ]);

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

  const totalItensPorPedido = {};
  for (const r of totalItensRows) totalItensPorPedido[r.pedido_id] = Number(r.total);

  const itensCobertosPorPedido = {};
  for (const r of itensCobertosRows) itensCobertosPorPedido[r.pedido_id] = Number(r.cobertos);

  const totalConferenciaPorPedido = {};
  for (const r of totalConferenciaRows) totalConferenciaPorPedido[r.pedido_id] = Number(r.total);

  const itensCobertosConferenciaPorPedido = {};
  for (const r of itensCobertosConferenciaRows) itensCobertosConferenciaPorPedido[r.pedido_id] = Number(r.cobertos);

  const itensSemCatPorPedido = {};
  for (const r of itensSemCatRows) itensSemCatPorPedido[r.pedido_id] = Number(r.sem_cat);

  const itensSemVincPorPedido = {};
  for (const r of itensSemVincRows) itensSemVincPorPedido[r.pedido_id] = Number(r.sem_vinc);

  const confPorPedido = {};
  for (const r of confRows) confPorPedido[r.pedido_id] = { total: Number(r.total), conferidos: Number(r.conferidos) };

  const prodPorPedido = {};
  for (const r of prodRows) prodPorPedido[r.pedido_id] = { em_confeccao: Number(r.em_confeccao), confeccao_ok: Number(r.confeccao_ok) };

  const agendadosPorPedido = {};
  for (const r of agendadoRows) agendadosPorPedido[r.pedido_id] = Number(r.agendados);

  const produtoOkPorPedido = {};
  for (const r of produtoOkRows) produtoOkPorPedido[r.pedido_id] = Number(r.produto_ok);

  const instalacaoPorPedido = {};
  for (const r of instalacaoRows) {
    instalacaoPorPedido[r.pedido_id] = {
      total: Number(r.instalacoes_total),
      concluidas: Number(r.instalacoes_concluidas),
    };
  }

  const separacaoPorPedido = {};
  for (const r of separacaoRows) {
    separacaoPorPedido[r.pedido_id] = {
      total: Number(r.total_itens_instalacao),
      separados: Number(r.itens_separados),
    };
  }

  const itensComConferenciaConsultorasPorPedido = {};
  for (const r of itensComConferenciaConsultorasRows) itensComConferenciaConsultorasPorPedido[r.pedido_id] = Number(r.total);

  const hoje = new Date();

  const resultado = pedidos.map((p) => {
    const preAgendamentos = preAgsPorPedido[p.id] || [];
    const { proximoPrazo, diasParaPrazo, nivelAlerta } = calcularPrazoEAlerta(preAgendamentos, hoje);

    const conf = confPorPedido[p.id] || { total: 0, conferidos: 0 };
    const prod = prodPorPedido[p.id] || { em_confeccao: 0, confeccao_ok: 0 };
    const inst = instalacaoPorPedido[p.id] || { total: 0, concluidas: 0 };
    const sep = separacaoPorPedido[p.id] || { total: 0, separados: 0 };

    const { etapa_atual } = calcularEtapaAtual({
      verificacaoOk: p.verificacao_ok,
      itensSemCategoria: itensSemCatPorPedido[p.id] || 0,
      itensSemVinculo: itensSemVincPorPedido[p.id] || 0,
      totalItens: totalItensPorPedido[p.id] || 0,
      itensCobertos: itensCobertosPorPedido[p.id] || 0,
      totalItensConferencia: totalConferenciaPorPedido[p.id] || 0,
      itensCobertosConferencia: itensCobertosConferenciaPorPedido[p.id] || 0,
      itensComConferenciaConsultorasPreenchida: itensComConferenciaConsultorasPorPedido[p.id] || 0,
      totalItensConf: conf.total,
      itensConferidos: conf.conferidos,
      totalEmConf: prod.em_confeccao,
      totalConfOk: prod.confeccao_ok,
      itensComProdutoOk: produtoOkPorPedido[p.id] || 0,
      genitoresAgendados: agendadosPorPedido[p.id] || 0,
      instalacoesTotal: inst.total,
      instalacoesConcluidas: inst.concluidas,
      totalItensInstalacao: sep.total,
      itensSeparados: sep.separados,
      status: p.status,
    });

    return {
      id: p.id,
      numero_sequencial: p.numero_sequencial,
      numero_origem: p.numero_origem,
      status: p.status,
      cliente_id: p.cliente_id,
      cliente_nome: p.cliente_nome,
      consultor_id: p.consultor_id,
      consultor_nome: p.consultor_nome,
      total: p.total,
      cidade: p.cidade,
      bairro: p.bairro,
      data_pedido: p.data_pedido,
      itens_count: Number(p.itens_count),
      criado_em: p.criado_em,
      estagio: {
        pdf_ok: p.pdf_ok,
        verificacao_ok: p.verificacao_ok,
        categorizacao_ok: p.categorizacao_ok,
        vinculos_ok: p.vinculos_ok,
        etapa_atual,
        pre_agendamentos: preAgendamentos,
        proximo_prazo: proximoPrazo,
        dias_para_prazo: diasParaPrazo,
        nivel_alerta: nivelAlerta,
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
  if (!temPermGeral && String(pedido.consultor_id) !== String(userId)) {
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
      `SELECT id, descricao, ambiente, quantidade, unidade, em_confeccao, confeccao_ok, produto_ok
       FROM pedido_itens WHERE pedido_id = $1 ORDER BY ordem ASC, id ASC`,
      [pedidoId]
    ),
  ]);
  pedido.itens = itensRows;

  const { rows: genitoresRaw } = await db.query(
    `SELECT a.id, a.status, a.tipo, TO_CHAR(a.data, 'YYYY-MM-DD') AS data_inicio, a.observacoes_status
     FROM agendamentos a
     WHERE a.pedido_id = $1 AND a.empresa_id = $2
       AND a.agendamento_pai_id IS NULL
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
    { rows: totalConferenciaRows },
    { rows: itensCobertosConferenciaRows },
    { rows: itensSemCatRows },
    { rows: itensSemVinculoRows },
    { rows: confRows },
    { rows: prodRows },
    { rows: agendadoRows },
    { rows: produtoOkRows },
    { rows: itensPersianaPendentesRows },
    { rows: itensControleRows },
    { rows: itensComConferenciaConsultorasRows },
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
         AND a.status NOT IN ('cancelado','rejeitado','nao_concluido')
         AND a.agendamento_pai_id IS NULL
         AND a.tipo = 'Instalação'`,
      [pedidoId, empresaId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT pi.id)::int AS total
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = $1 AND cat.necessita_conferencia = true`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT ai.pedido_item_id)::int AS cobertos
       FROM agendamento_itens ai
       JOIN agendamentos a ON a.id = ai.agendamento_id
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE a.pedido_id = $1 AND a.empresa_id = $2
         AND ai.pedido_item_id IS NOT NULL
         AND a.status NOT IN ('cancelado','rejeitado','nao_concluido')
         AND a.agendamento_pai_id IS NULL
         AND a.tipo = 'Conferência'
         AND cat.necessita_conferencia = true`,
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
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = $1
         AND COALESCE(cat.vinculavel, false) = true
         AND pi.sem_vinculo = false
         AND NOT EXISTS (
           SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
         )`,
      [pedidoId]
    ),
    db.query(
      `SELECT
         COUNT(DISTINCT pi.id)::int AS total,
         COUNT(DISTINCT pi.id) FILTER (WHERE os.dados_tecnicos IS NOT NULL)::int AS conferidos
       FROM pedido_itens pi
       LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE pi.pedido_id = $1`,
      [pedidoId]
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
    db.query(
      `SELECT COUNT(*) FILTER (WHERE produto_ok = true)::int AS produto_ok
       FROM pedido_itens
       WHERE pedido_id = $1`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS pendentes
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id = $1
         AND cat.nome = 'Persianas'
         AND pi.modelo IS NULL`,
      [pedidoId]
    ),
    db.query(
      `SELECT pi.id, pi.ambiente, pi.descricao,
              COALESCE(c.distribui_canais, false)          AS distribui_canais,
              COALESCE(c.recebe_vinculo_automatico, false) AS recebe_vinculo_automatico,
              pi.especificacoes->>'acionamento'            AS acionamento
       FROM pedido_itens pi
       LEFT JOIN categorias c ON c.id = pi.categoria_id
       WHERE pi.pedido_id = $1
         AND pi.ambiente IS NOT NULL AND pi.ambiente <> ''`,
      [pedidoId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT pi.id)::int AS total
       FROM pedido_itens pi
       JOIN categorias cat ON cat.id = pi.categoria_id
       JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE pi.pedido_id = $1 AND cat.necessita_conferencia = true
         AND os.dados_conferencia_consultoras IS NOT NULL`,
      [pedidoId]
    ),
  ]);

  const totalItens = totalItensRows[0]?.total ?? 0;
  const itensCobertos = itensCobertosRows[0]?.cobertos ?? 0;
  const totalItensConferencia = totalConferenciaRows[0]?.total ?? 0;
  const itensCobertosConferencia = itensCobertosConferenciaRows[0]?.cobertos ?? 0;
  const itensSemCategoria = itensSemCatRows[0]?.sem_cat ?? 0;
  const itensSemVinculo = itensSemVinculoRows[0]?.sem_vinc ?? 0;
  const { total: totalItensConf, conferidos: itensConferidos } = confRows[0] ?? { total: 0, conferidos: 0 };
  const { em_confeccao: totalEmConf, confeccao_ok: totalConfOk } = prodRows[0] ?? { em_confeccao: 0, confeccao_ok: 0 };
  const genitoresAgendados = agendadoRows[0]?.agendados ?? 0;
  const itensComProdutoOk = produtoOkRows[0]?.produto_ok ?? 0;
  const itensPersianaPendentes = itensPersianaPendentesRows[0]?.pendentes ?? 0;
  const { insuficientes: ambientesCanaisInsuficientes } = encontrarVinculosControle(itensControleRows);
  const itensComConferenciaConsultorasPreenchida = itensComConferenciaConsultorasRows[0]?.total ?? 0;

  if (!genitoresRaw.length) {
    const { etapa_atual, etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok } = calcularEtapaAtual({
      verificacaoOk: pedido.verificacao_ok,
      itensSemCategoria,
      itensSemVinculo,
      totalItens,
      itensCobertos,
      totalItensConferencia,
      itensCobertosConferencia,
      itensComConferenciaConsultorasPreenchida,
      totalItensConf,
      itensConferidos,
      totalEmConf,
      totalConfOk,
      itensComProdutoOk,
      genitoresAgendados: 0,
      instalacoesTotal: 0,
      instalacoesConcluidas: 0,
      totalItensInstalacao: 0,
      itensSeparados: 0,
      status: pedido.status,
    });
    return {
      pedido,
      etapa_atual,
      etapas: [
        { numero: 1, concluida: etapa1_ok, progresso: { verificacao_ok: !!pedido.verificacao_ok, itens_sem_categoria: itensSemCategoria, itens_sem_vinculo: itensSemVinculo, total_itens: totalItens, itens_cobertos: itensCobertos, total_itens_conferencia: totalItensConferencia, itens_cobertos_conferencia: itensCobertosConferencia, itens_persiana_pendentes: itensPersianaPendentes, ambientes_canais_insuficientes: ambientesCanaisInsuficientes, itens_com_conferencia_consultoras: itensComConferenciaConsultorasPreenchida } },
        {
          numero: 2,
          concluida: etapa2_ok,
          progresso: {
            total: totalItensConf,
            conferidos: itensConferidos,
            aguardando_agendamento_conferencia:
              totalItensConferencia > 0 &&
              itensComConferenciaConsultorasPreenchida >= totalItensConferencia &&
              itensCobertosConferencia < totalItensConferencia,
          },
        },
        { numero: 3, concluida: etapa3_ok, progresso: { em_confeccao: totalEmConf, confeccao_ok: totalConfOk } },
        { numero: 4, concluida: etapa4_ok, progresso: { total_itens: totalItens, itens_produto_ok: itensComProdutoOk } },
        { numero: 5, concluida: false, progresso: { genitores_agendados: 0 } },
        { numero: 6, concluida: false, progresso: { total_itens_instalacao: 0, itens_separados: 0 } },
        { numero: 7, concluida: false, progresso: { instalacoes_total: 0, instalacoes_concluidas: 0 } },
        { numero: 8, concluida: false, progresso: { status: pedido.status } },
      ],
      estagio: { ...estagio_base, pre_agendamentos: [], proximo_prazo: null, dias_para_prazo: null, nivel_alerta: null },
      pre_agendamentos: [],
    };
  }

  const genitoreIds = genitoresRaw.map((g) => g.id);

  const [{ rows: itensPorGenitor }, { rows: herdeirosRaw }] = await Promise.all([
    db.query(
      `SELECT ai.agendamento_id, ai.pedido_item_id, pi.descricao, pi.ordem, pi.medidas,
              pi.ambiente, pi.largura, pi.altura, pi.modelo,
              pi.especificacoes->>'acionamento' AS acionamento,
              cat.tipo_confeccao,
              os.id AS ordem_servico_id,
              (os.dados_confeccao IS NOT NULL) AS confeccao_preenchida,
              (os.dados_conferencia_consultoras IS NOT NULL) AS conferencia_consultoras_preenchida,
              (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
      [genitoreIds]
    ),
    db.query(
      `SELECT id, agendamento_pai_id, tipo, status, TO_CHAR(data, 'YYYY-MM-DD') AS data_inicio, observacoes_status
       FROM agendamentos
       WHERE agendamento_pai_id = ANY($1) AND empresa_id = $2
       ORDER BY data`,
      [genitoreIds, empresaId]
    ),
  ]);

  const itensPorAg = {};
  for (const item of itensPorGenitor) {
    if (!itensPorAg[item.agendamento_id]) itensPorAg[item.agendamento_id] = [];
    itensPorAg[item.agendamento_id].push({
      pedido_item_id: item.pedido_item_id,
      descricao: item.descricao,
      ordem: item.ordem,
      medidas: item.medidas,
      ambiente: item.ambiente,
      largura: item.largura,
      altura: item.altura,
      produto: labelProdutoConferencia(item.tipo_confeccao, item.modelo, item.acionamento) || item.descricao,
      tipo_confeccao: item.tipo_confeccao,
      ordem_servico_id: item.ordem_servico_id,
      confeccao_preenchida: item.confeccao_preenchida,
      conferencia_consultoras_preenchida: item.conferencia_consultoras_preenchida,
      ficha_preenchida: item.ficha_preenchida,
    });
  }

  const instalacaoHerdeiros = herdeirosRaw.filter((h) => h.tipo === "Instalação");
  const instalacaoIds = instalacaoHerdeiros.map((h) => h.id);
  const instalacoesTotal = instalacaoHerdeiros.length;
  const instalacoesConcluidas = instalacaoHerdeiros.filter((h) => h.status === "concluido").length;

  const { rows: separacaoRows } = await db.query(
    `SELECT ai.agendamento_id, ai.pedido_item_id, ai.separado, pi.descricao, pi.ambiente
     FROM agendamento_itens ai
     JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
     WHERE ai.agendamento_id = ANY($1) AND ai.pedido_item_id IS NOT NULL`,
    [instalacaoIds]
  );

  const totalItensInstalacao = separacaoRows.length;
  const itensSeparados = separacaoRows.filter((r) => r.separado).length;

  const itensSeparacaoPorAg = {};
  for (const r of separacaoRows) {
    if (!itensSeparacaoPorAg[r.agendamento_id]) itensSeparacaoPorAg[r.agendamento_id] = [];
    itensSeparacaoPorAg[r.agendamento_id].push({
      pedido_item_id: r.pedido_item_id,
      descricao: r.descricao,
      ambiente: r.ambiente,
      separado: r.separado,
    });
  }

  const herdeirosporPai = {};
  for (const h of herdeirosRaw) {
    if (!herdeirosporPai[h.agendamento_pai_id]) herdeirosporPai[h.agendamento_pai_id] = [];
    herdeirosporPai[h.agendamento_pai_id].push({
      id: h.id,
      tipo: h.tipo,
      status: h.status,
      data_inicio: h.data_inicio,
      observacoes_status: h.observacoes_status,
      itens: itensSeparacaoPorAg[h.id] || [],
    });
  }

  const pre_agendamentos = genitoresRaw.map((g) => ({
    id: g.id,
    data_inicio: g.data_inicio,
    status: g.status,
    tipo: g.tipo,
    observacoes_status: g.observacoes_status,
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

  const { etapa_atual, etapa1_ok, etapa2_ok, etapa3_ok, etapa4_ok, etapa5_ok, etapa6_ok, etapa7_ok, etapa8_ok } = calcularEtapaAtual({
    verificacaoOk: pedido.verificacao_ok,
    itensSemCategoria,
    itensSemVinculo,
    totalItens,
    itensCobertos,
    totalItensConferencia,
    itensCobertosConferencia,
    itensComConferenciaConsultorasPreenchida,
    totalItensConf,
    itensConferidos,
    totalEmConf,
    totalConfOk,
    itensComProdutoOk,
    genitoresAgendados,
    instalacoesTotal,
    instalacoesConcluidas,
    totalItensInstalacao,
    itensSeparados,
    status: pedido.status,
  });

  const etapas = [
    {
      numero: 1,
      concluida: etapa1_ok,
      progresso: {
        verificacao_ok: !!pedido.verificacao_ok,
        itens_sem_categoria: itensSemCategoria,
        itens_sem_vinculo: itensSemVinculo,
        total_itens: totalItens,
        itens_cobertos: itensCobertos,
        total_itens_conferencia: totalItensConferencia,
        itens_cobertos_conferencia: itensCobertosConferencia,
        itens_persiana_pendentes: itensPersianaPendentes,
        ambientes_canais_insuficientes: ambientesCanaisInsuficientes,
        itens_com_conferencia_consultoras: itensComConferenciaConsultorasPreenchida,
      },
    },
    {
      numero: 2,
      concluida: etapa2_ok,
      progresso: {
        total: totalItensConf,
        conferidos: itensConferidos,
        aguardando_agendamento_conferencia:
          totalItensConferencia > 0 &&
          itensComConferenciaConsultorasPreenchida >= totalItensConferencia &&
          itensCobertosConferencia < totalItensConferencia,
      },
    },
    {
      numero: 3,
      concluida: etapa3_ok,
      progresso: { em_confeccao: totalEmConf, confeccao_ok: totalConfOk },
    },
    {
      numero: 4,
      concluida: etapa4_ok,
      progresso: { total_itens: totalItens, itens_produto_ok: itensComProdutoOk },
    },
    {
      numero: 5,
      concluida: etapa5_ok,
      progresso: { genitores_agendados: genitoresAgendados },
    },
    {
      numero: 6,
      concluida: etapa6_ok,
      progresso: { total_itens_instalacao: totalItensInstalacao, itens_separados: itensSeparados },
    },
    {
      numero: 7,
      concluida: etapa7_ok,
      progresso: { instalacoes_total: instalacoesTotal, instalacoes_concluidas: instalacoesConcluidas },
    },
    {
      numero: 8,
      concluida: etapa8_ok,
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

module.exports = { listarPedidosDashboard, buscarFluxoPedido, calcularEtapaAtual, calcularPrazoEAlerta };
