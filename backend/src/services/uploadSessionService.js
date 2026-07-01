const db = require('../database/db');

async function verificarDuplicata(pedidoId, hashMd5) {
  if (!hashMd5) return null;
  const { rows } = await db.query(
    `SELECT id, drive_file_id, drive_url FROM pedido_midias
     WHERE pedido_id = $1 AND hash_md5 = $2 LIMIT 1`,
    [pedidoId, hashMd5]
  );
  return rows[0] ?? null;
}

async function criarSessao({
  pedidoId, pedidoItemId, osId, nomeArquivo, tamanhoBytes,
  mimeType, tipo, hashMd5, iniciadoPor,
  driveUploadUri, driveFolderId,
}) {
  const { rows } = await db.query(
    `INSERT INTO upload_sessions
       (pedido_id, pedido_item_id, ordem_servico_id, drive_upload_uri, drive_folder_id,
        nome_arquivo, tamanho_bytes, mime_type, tipo, hash_md5, iniciado_por,
        expira_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + INTERVAL '7 days')
     RETURNING *`,
    [pedidoId, pedidoItemId, osId ?? null, driveUploadUri, driveFolderId,
     nomeArquivo, tamanhoBytes, mimeType, tipo, hashMd5 ?? null, iniciadoPor]
  );
  return rows[0];
}

async function buscarStatus(sessionId, userId) {
  const { rows } = await db.query(
    `SELECT id, status, bytes_confirmados, expira_em, drive_upload_uri
     FROM upload_sessions
     WHERE id = $1 AND iniciado_por = $2`,
    [sessionId, userId]
  );
  return rows[0] ?? null;
}

async function confirmar(sessionId, userId, { driveFileId, driveUrl, duracaoSegundos }) {
  // db is the pg Pool; use a dedicated client so all queries run in one transaction
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: sessionRows } = await client.query(
      `SELECT * FROM upload_sessions WHERE id = $1 AND iniciado_por = $2`, [sessionId, userId]
    );
    const s = sessionRows[0];
    if (!s) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Sessão não encontrada'), { status: 404 });
    }

    const { rows: midiaRows } = await client.query(
      `INSERT INTO pedido_midias
         (pedido_id, pedido_item_id, ordem_servico_id, drive_file_id, drive_url,
          drive_folder_id, nome_original, tipo, tamanho_bytes, duracao_segundos,
          hash_md5, enviado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [s.pedido_id, s.pedido_item_id, s.ordem_servico_id, driveFileId, driveUrl,
       s.drive_folder_id, s.nome_arquivo, s.tipo, s.tamanho_bytes,
       duracaoSegundos ?? null, s.hash_md5, s.iniciado_por]
    );

    await client.query(
      `UPDATE upload_sessions SET status = 'concluido', concluido_em = NOW() WHERE id = $1`,
      [sessionId]
    );

    await client.query('COMMIT');
    return { midia_id: midiaRows[0].id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listarPorPedido(pedidoId, empresaId, { itemId, osId, tipo } = {}) {
  const params = [pedidoId, empresaId];
  const clauses = [];
  if (itemId) { params.push(itemId);  clauses.push(`pm.pedido_item_id = $${params.length}`); }
  if (osId)   { params.push(osId);    clauses.push(`pm.ordem_servico_id = $${params.length}`); }
  if (tipo)   { params.push(tipo);    clauses.push(`pm.tipo = $${params.length}`); }
  const where = clauses.length ? 'AND ' + clauses.join(' AND ') : '';

  const { rows } = await db.query(
    `SELECT pm.id, pm.drive_file_id, pm.drive_url, pm.tipo, pm.nome_original,
            pm.tamanho_bytes, pm.duracao_segundos, pm.enviado_em,
            u.nome_completo AS enviado_por_nome
     FROM pedido_midias pm
     JOIN usuarios u ON u.id = pm.enviado_por
     JOIN pedidos p ON p.id = pm.pedido_id
     WHERE pm.pedido_id = $1 AND p.empresa_id = $2 ${where}
     ORDER BY pm.enviado_em`,
    params
  );
  return rows;
}

async function listarPorOs(osId, empresaId) {
  const { rows } = await db.query(
    `SELECT pm.id, pm.drive_file_id, pm.drive_url, pm.tipo, pm.nome_original,
            pm.tamanho_bytes, pm.duracao_segundos, pm.enviado_em,
            u.nome_completo AS enviado_por_nome
     FROM pedido_midias pm
     JOIN usuarios u ON u.id = pm.enviado_por
     JOIN pedidos p ON p.id = pm.pedido_id
     WHERE pm.ordem_servico_id = $1 AND p.empresa_id = $2
     ORDER BY pm.enviado_em`,
    [osId, empresaId]
  );
  return rows;
}

module.exports = {
  verificarDuplicata, criarSessao, buscarStatus,
  confirmar, listarPorPedido, listarPorOs,
};
