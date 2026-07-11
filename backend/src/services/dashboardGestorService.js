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

module.exports = {
  buscarFiltros,
};
