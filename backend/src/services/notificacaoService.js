const db = require("../database/db");
const { enviarPush } = require("./pushService");

async function criarNotificacao({
  empresaId,
  usuarioId = null,
  tipo,
  titulo,
  mensagem = null,
  link = null,
  icone = "info",
  agendamentoId = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [empresaId, usuarioId, tipo, titulo, mensagem, link, icone, agendamentoId]
  );
  const notificacao = rows[0];

  if (usuarioId != null) {
    const pushLink = agendamentoId ? `/agenda/${agendamentoId}` : "/agenda";
    enviarPush(usuarioId, { titulo, mensagem, link: pushLink, icone }).catch((e) =>
      console.warn("Erro ao enviar push:", e.message)
    );
  }

  return notificacao;
}

module.exports = { criarNotificacao };
