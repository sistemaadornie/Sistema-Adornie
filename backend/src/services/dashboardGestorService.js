"use strict";
const db = require("../database/db");
const dashboardService = require("./dashboardService");
const { getPeriodoAtual, getPeriodoAnterior } = require("../utils/periodoGestor");
const {
  ETAPAS_FUNIL,
  MAPA_BAIRROS, MAPA_BAIRROS_OUTROS,
  MAPA_CIDADES, MAPA_CIDADES_OUTROS,
  buscarCoordenada,
} = require("../config/dashboardGestorConfig");

async function buscarPedidosEnriquecidos(empresaId, { consultoraId } = {}) {
  return dashboardService.listarPedidosDashboard(
    empresaId,
    null,
    ["DASHBOARD_PEDIDOS_GERAL"],
    { consultora_id: consultoraId || null, status: null, alerta: null }
  );
}

function filtrarPorCidade(pedidos, cidade) {
  if (!cidade) return pedidos;
  const alvo = cidade.toLowerCase();
  return pedidos.filter((p) => (p.cidade || "").toLowerCase() === alvo);
}

function filtrarPorPeriodo(pedidos, periodoRange) {
  return pedidos.filter((p) => {
    if (!p.data_pedido) return false;
    const iso = new Date(p.data_pedido).toISOString().slice(0, 10);
    return iso >= periodoRange.inicio && iso <= periodoRange.fim;
  });
}

function filtrarAtivos(pedidos) {
  return pedidos.filter((p) => !["concluido", "cancelado"].includes(p.status));
}

function filtrarNaoCancelados(pedidos) {
  return pedidos.filter((p) => p.status !== "cancelado");
}

async function buscarFiltros(empresaId) {
  const [{ rows: consultoras }, { rows: cidadesRows }] = await Promise.all([
    db.query(
      `SELECT DISTINCT u.id, u.nome_completo AS nome
       FROM usuarios u
       JOIN usuario_permissoes up ON up.usuario_id = u.id
       JOIN permissoes perm ON perm.id = up.permissao_id
       WHERE u.empresa_id = $1 AND u.status = 'aprovado'
         AND (perm.codigo = 'COMERCIAL' OR perm.nome = 'COMERCIAL')
       ORDER BY u.nome_completo`,
      [empresaId]
    ),
    db.query(
      `SELECT DISTINCT cidade
       FROM pedidos
       WHERE empresa_id = $1 AND cidade IS NOT NULL AND cidade != '' AND status != 'cancelado'
       ORDER BY cidade`,
      [empresaId]
    ),
  ]);
  return { consultoras, cidades: cidadesRows.map((r) => r.cidade) };
}

async function contarInstalacoesSemana(empresaId, { consultoraId, cidade }, deslocamentoSemanas) {
  const params = [empresaId];
  const cond = [
    "a.empresa_id = $1",
    "a.tipo = 'Instalação'",
    "a.status NOT IN ('cancelado','rejeitado')",
  ];
  cond.push(
    deslocamentoSemanas === 0
      ? "a.data BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'"
      : "a.data BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE - INTERVAL '1 day'"
  );
  if (consultoraId) {
    params.push(Number(consultoraId));
    cond.push(`p.consultor_id = $${params.length}`);
  }
  if (cidade) {
    params.push(cidade);
    cond.push(`LOWER(p.cidade) = LOWER($${params.length})`);
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS valor
     FROM agendamentos a
     LEFT JOIN pedidos p ON p.id = a.pedido_id
     WHERE ${cond.join(" AND ")}`,
    params
  );
  return rows[0].valor;
}

async function buscarKpis(empresaId, filtros = {}, hoje = new Date()) {
  const { periodo = "mes", consultoraId, cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const periodoAnterior = getPeriodoAnterior(periodo, hoje);

  const pedidos = filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade);
  const naoCancelados = filtrarNaoCancelados(pedidos);

  const fatAtual = filtrarPorPeriodo(naoCancelados, periodoAtual).reduce((s, p) => s + Number(p.total || 0), 0);
  const fatAnterior = filtrarPorPeriodo(naoCancelados, periodoAnterior).reduce((s, p) => s + Number(p.total || 0), 0);
  const deltaPct = fatAnterior > 0
    ? Number((((fatAtual - fatAnterior) / fatAnterior) * 100).toFixed(1))
    : (fatAtual > 0 ? 100 : 0);

  const ativos = filtrarAtivos(pedidos);
  const emRisco = ativos.filter((p) => p.estagio.nivel_alerta);

  const [instalAtual, instalAnterior] = await Promise.all([
    contarInstalacoesSemana(empresaId, { consultoraId, cidade }, 0),
    contarInstalacoesSemana(empresaId, { consultoraId, cidade }, -1),
  ]);

  return {
    faturamento: { valor: fatAtual, deltaPct },
    pedidosAtivos: { valor: ativos.length },
    prazosEmRisco: { valor: emRisco.length },
    instalacoesSemana: { valor: instalAtual, deltaAbs: instalAtual - instalAnterior },
  };
}

async function buscarFunil(empresaId, filtros = {}, hoje = new Date()) {
  const { periodo = "mes", consultoraId, cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const pedidos = filtrarPorPeriodo(
    filtrarAtivos(filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade)),
    periodoAtual
  );

  const contagem = new Map(ETAPAS_FUNIL.map((e) => [e.numero, 0]));
  for (const p of pedidos) {
    contagem.set(p.estagio.etapa_atual, (contagem.get(p.estagio.etapa_atual) || 0) + 1);
  }

  let etapaGargalo = null;
  for (const [numero, count] of contagem) {
    if (count > 0 && (etapaGargalo === null || count > contagem.get(etapaGargalo))) etapaGargalo = numero;
  }

  const etapas = ETAPAS_FUNIL.map((e) => ({
    numero: e.numero,
    nome: e.nome,
    count: contagem.get(e.numero) || 0,
    gargalo: e.numero === etapaGargalo,
  }));

  return { totalAtivos: pedidos.length, etapas };
}

async function buscarFunilDetalhe(empresaId, numero, filtros = {}, hoje = new Date()) {
  const etapa = ETAPAS_FUNIL.find((e) => e.numero === Number(numero));
  if (!etapa) {
    const err = new Error("Etapa inválida");
    err.status = 400;
    throw err;
  }
  const { periodo = "mes", consultoraId, cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const pedidos = filtrarPorPeriodo(
    filtrarAtivos(filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade)),
    periodoAtual
  ).filter((p) => p.estagio.etapa_atual === etapa.numero);

  return {
    numero: etapa.numero,
    nome: etapa.nome,
    descricao: etapa.descricao,
    responsavel: etapa.responsavel,
    count: pedidos.length,
    exemplos: pedidos.slice(0, 5).map((p) => ({ numero: `#${p.numero_sequencial}`, cliente: p.cliente_nome })),
  };
}

async function buscarAlertas(empresaId, filtros = {}) {
  const { consultoraId, cidade } = filtros;
  const pedidos = filtrarAtivos(filtrarPorCidade(await buscarPedidosEnriquecidos(empresaId, { consultoraId }), cidade));
  const comRisco = pedidos
    .filter((p) => p.estagio.nivel_alerta)
    .sort((a, b) => (a.estagio.dias_para_prazo ?? 0) - (b.estagio.dias_para_prazo ?? 0))
    .slice(0, 20);

  const alertas = comRisco.map((p) => ({
    numeroPedido: `#${p.numero_sequencial}`,
    cliente: p.cliente_nome,
    cidade: p.cidade,
    etapa: ETAPAS_FUNIL.find((e) => e.numero === p.estagio.etapa_atual)?.nome || "",
    consultora: p.consultor_nome,
    diasParaPrazo: p.estagio.dias_para_prazo,
    nivel: p.estagio.nivel_alerta,
  }));

  return { total: alertas.length, alertas };
}

async function buscarConsultoras(empresaId, filtros = {}, hoje = new Date()) {
  const { periodo = "mes", cidade } = filtros;
  const periodoAtual = getPeriodoAtual(periodo, hoje);
  const periodoAnterior = getPeriodoAnterior(periodo, hoje);

  const [{ consultoras: comerciais }, pedidosTodos] = await Promise.all([
    buscarFiltros(empresaId),
    buscarPedidosEnriquecidos(empresaId, {}),
  ]);

  const naoCancelados = filtrarNaoCancelados(filtrarPorCidade(pedidosTodos, cidade));

  const somaPorConsultor = (lista) => {
    const mapa = new Map();
    for (const p of lista) {
      if (!p.consultor_id) continue;
      mapa.set(p.consultor_id, (mapa.get(p.consultor_id) || 0) + Number(p.total || 0));
    }
    return mapa;
  };

  const somaAtual = somaPorConsultor(filtrarPorPeriodo(naoCancelados, periodoAtual));
  const somaAnterior = somaPorConsultor(filtrarPorPeriodo(naoCancelados, periodoAnterior));

  const consultoras = comerciais
    .map((c) => {
      const atual = somaAtual.get(c.id) || 0;
      const anterior = somaAnterior.get(c.id) || 0;
      const deltaPct = anterior > 0
        ? Number((((atual - anterior) / anterior) * 100).toFixed(1))
        : (atual > 0 ? 100 : 0);
      return { id: c.id, nome: c.nome, valor: atual, deltaPct };
    })
    .sort((a, b) => b.valor - a.valor);

  return { totalMes: consultoras.reduce((s, c) => s + c.valor, 0), consultoras };
}

module.exports = {
  buscarFiltros,
  buscarPedidosEnriquecidos,
  buscarKpis,
  buscarFunil,
  buscarFunilDetalhe,
  buscarAlertas,
  buscarConsultoras,
};
