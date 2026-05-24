const db = require('../database/db');

async function criar({ pedidoItemId, responsavelId }) {
  const { rows } = await db.query(
    `INSERT INTO ordem_servico (pedido_item_id, responsavel_id)
     VALUES ($1, $2)
     RETURNING *`,
    [pedidoItemId, responsavelId]
  );
  return rows[0];
}

async function listarPorPedido(pedidoId) {
  const { rows } = await db.query(
    `SELECT os.id, os.status, os.aberta_em, os.encerrada_em,
            pi.descricao AS item_descricao,
            u.nome_completo AS responsavel_nome,
            COUNT(pm.id) FILTER (WHERE pm.tipo = 'foto')  AS total_fotos,
            COUNT(pm.id) FILTER (WHERE pm.tipo = 'video') AS total_videos
     FROM ordem_servico os
     JOIN pedido_itens pi ON pi.id = os.pedido_item_id
     LEFT JOIN usuarios u  ON u.id  = os.responsavel_id
     LEFT JOIN pedido_midias pm ON pm.ordem_servico_id = os.id
     WHERE pi.pedido_id = $1
     GROUP BY os.id, pi.descricao, u.nome_completo
     ORDER BY os.id`,
    [pedidoId]
  );
  return rows;
}

async function atualizarStatus(id, status) {
  const encerradaClause = status === 'encerrada' ? ', encerrada_em = NOW()' : '';
  const { rows } = await db.query(
    `UPDATE ordem_servico
     SET status = $1, updated_at = NOW() ${encerradaClause}
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  if (!rows[0]) throw Object.assign(new Error('OS não encontrada'), { status: 404 });
  return rows[0];
}

module.exports = { criar, listarPorPedido, atualizarStatus };
