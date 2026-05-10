const db = require("../database/db");

/**
 * Registra um evento de segurança no banco de dados.
 * Fire-and-forget — nunca lança exceção para não quebrar o fluxo principal.
 *
 * @param {"reset_solicitado"|"reset_bloqueado_email"|"reset_bloqueado_ip"|
 *          "reset_token_invalido"|"reset_token_expirado"|"reset_concluido"} tipo
 * @param {{ ip?: string, usuario_id?: number, detalhes?: object }} opts
 */
function registrarLog(tipo, { ip, usuario_id, detalhes } = {}) {
  db.query(
    `INSERT INTO security_logs (tipo, ip, usuario_id, detalhes)
     VALUES ($1, $2, $3, $4)`,
    [tipo, ip ?? null, usuario_id ?? null, detalhes ? JSON.stringify(detalhes) : null]
  ).catch((err) => console.error("[security_log]", err.message));
}

module.exports = { registrarLog };
