"use strict";

async function registrarAuditoria(client, { pedidoId, empresaId, usuarioId, etapa, acao, descricao, dadosAntes, dadosDepois }) {
  await client.query(
    `INSERT INTO pedido_auditoria
       (pedido_id, empresa_id, usuario_id, etapa, acao, descricao, dados_antes, dados_depois)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      pedidoId,
      empresaId,
      usuarioId || null,
      etapa,
      acao,
      descricao || null,
      dadosAntes  ? JSON.stringify(dadosAntes)  : null,
      dadosDepois ? JSON.stringify(dadosDepois) : null,
    ]
  );
}

async function listarAuditoria(db, pedidoId, empresaId, etapa) {
  const params = [pedidoId, empresaId];
  let etapaClause = "";
  if (etapa) {
    params.push(etapa);
    etapaClause = `AND a.etapa = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT a.id, a.etapa, a.acao, a.descricao, a.dados_antes, a.dados_depois,
            a.created_at, u.nome_completo AS usuario_nome
     FROM pedido_auditoria a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.pedido_id = $1 AND a.empresa_id = $2 ${etapaClause}
     ORDER BY a.created_at DESC`,
    params
  );
  return rows;
}

module.exports = { registrarAuditoria, listarAuditoria };
