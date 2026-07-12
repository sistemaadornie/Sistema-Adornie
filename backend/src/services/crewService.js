const db = require("../database/db");
const { criarNotificacao } = require("./notificacaoService");

async function gravarLogCrew(crewId, empresaId, usuarioId, usuarioNome, acao, detalhes) {
  await db.query(
    `INSERT INTO crew_logs (crew_id, empresa_id, usuario_id, usuario_nome, acao, detalhes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [crewId, empresaId, usuarioId || null, usuarioNome || "—", acao, detalhes ? JSON.stringify(detalhes) : null]
  ).catch((e) => console.warn("Erro ao gravar log de crew:", e.message));
}

async function getCrewLogs(crewId, empresaId) {
  const { rows } = await db.query(
    `SELECT id, acao, detalhes, criado_em, usuario_nome
     FROM crew_logs WHERE crew_id=$1 AND empresa_id=$2 ORDER BY criado_em DESC LIMIT 200`,
    [crewId, empresaId]
  );
  return rows;
}

// ── Notificação de equipe formada ─────────────────────────
async function notificarMembrosCrew(crew, empresaId) {
  if (!crew || !crew.membros?.length) return;

  const dataFmt = new Date(crew.data).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const veiculo = crew.veiculo ? `${crew.veiculo.nome}${crew.veiculo.placa ? ` (${crew.veiculo.placa})` : ""}` : null;
  const colegas = crew.membros.map((m) => m.nome.split(" ")[0]).join(", ");

  for (const membro of crew.membros) {
    const outrosColegas = crew.membros.filter((m) => m.usuario_id !== membro.usuario_id).map((m) => m.nome.split(" ")[0]);
    const colegasStr = outrosColegas.length ? outrosColegas.join(", ") : "ninguém mais";

    let mensagem = `Você está na equipe **${crew.nome}** no dia ${dataFmt}.`;
    if (veiculo) mensagem += ` Veículo: ${veiculo}.`;
    mensagem += ` Colegas: ${colegasStr}.`;

    await criarNotificacao({
      empresaId,
      usuarioId: membro.usuario_id,
      tipo: "info",
      titulo: `Equipe formada — ${dataFmt}`,
      mensagem,
      link: "/agendamentos/mapa",
      icone: "🚗",
    }).catch(() => {});
  }
}

// ── Crews ─────────────────────────────────────────────────

async function listarCrew(empresaId, data) {
  const crewsRes = await db.query(
    `SELECT c.id, c.nome, c.data,
            c.veiculo_id,
            v.nome AS veiculo_nome,
            v.placa AS veiculo_placa
     FROM crews c
     LEFT JOIN veiculos v ON v.id = c.veiculo_id AND v.deleted_at IS NULL
     WHERE c.empresa_id = $1 AND c.data = $2
     ORDER BY c.id`,
    [empresaId, data]
  );

  if (!crewsRes.rows.length) return [];

  const ids = crewsRes.rows.map((c) => c.id);

  const [membrosRes, agsRes] = await Promise.all([
    db.query(
      `SELECT cm.crew_id,
              u.id AS usuario_id,
              COALESCE(u.nome_completo, 'Usuário removido') AS nome,
              u.foto_url
       FROM crew_membros cm
       LEFT JOIN usuarios u ON u.id = cm.usuario_id
       WHERE cm.crew_id = ANY($1)
       ORDER BY u.nome_completo`,
      [ids]
    ),
    db.query(
      `SELECT ca.crew_id,
              a.id, a.titulo, a.cliente, a.endereco,
              a.status, a.duracao_minutos, a.lat, a.lng,
              TO_CHAR(a.hora, 'HH24:MI') AS hora
       FROM crew_agendamentos ca
       JOIN agendamentos a ON a.id = ca.agendamento_id
       WHERE ca.crew_id = ANY($1)
         AND a.empresa_id = $2
         AND a.status != 'cancelado'
       ORDER BY a.hora`,
      [ids, empresaId]
    ),
  ]);

  return crewsRes.rows.map((crew) => ({
    ...crew,
    veiculo: crew.veiculo_id
      ? { id: crew.veiculo_id, nome: crew.veiculo_nome, placa: crew.veiculo_placa }
      : null,
    membros:       membrosRes.rows.filter((m) => m.crew_id === crew.id),
    agendamentos:  agsRes.rows.filter((a) => a.crew_id === crew.id),
  }));
}

async function criarCrew(empresaId, { data, nome, veiculo_id, membros = [], agendamento_ids = [] }, userId, nomeCompleto) {
  const { rows } = await db.query(
    `INSERT INTO crews (empresa_id, data, nome, veiculo_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [empresaId, data, nome || null, veiculo_id || null]
  );
  const crewId = rows[0].id;

  await Promise.all([
    ...membros.map((uid) =>
      db.query(
        `INSERT INTO crew_membros (crew_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [crewId, uid]
      )
    ),
    ...agendamento_ids.map((aid) =>
      db.query(
        `INSERT INTO crew_agendamentos (crew_id, agendamento_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [crewId, aid]
      )
    ),
  ]);

  await gravarLogCrew(crewId, empresaId, userId, nomeCompleto, "criado", { nome: nome || null, membros: membros.length, agendamentos: agendamento_ids.length });

  const lista = await listarCrew(empresaId, data);
  const crew = lista.find((c) => c.id === crewId);
  await notificarMembrosCrew(crew, empresaId);
  return crew;
}

async function atualizarCrew(id, empresaId, { nome, veiculo_id, membros, agendamento_ids }, userId, nomeCompleto) {
  const existing = await db.query(
    `SELECT data, nome AS nome_ant, veiculo_id AS veiculo_ant FROM crews WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (!existing.rows.length) {
    const err = new Error("Crew não encontrado.");
    err.status = 404;
    throw err;
  }
  const { data, nome_ant, veiculo_ant } = existing.rows[0];

  const membrosAntRes = await db.query(`SELECT usuario_id FROM crew_membros WHERE crew_id=$1`, [id]);
  const membrosAntIds = membrosAntRes.rows.map((r) => String(r.usuario_id));

  await db.query(
    `UPDATE crews SET nome=$1, veiculo_id=$2 WHERE id=$3`,
    [nome || null, veiculo_id || null, id]
  );

  if (membros !== undefined) {
    await db.query(`DELETE FROM crew_membros WHERE crew_id=$1`, [id]);
    await Promise.all(
      membros.map((uid) =>
        db.query(
          `INSERT INTO crew_membros (crew_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, uid]
        )
      )
    );
  }

  if (agendamento_ids !== undefined) {
    await db.query(`DELETE FROM crew_agendamentos WHERE crew_id=$1`, [id]);
    await Promise.all(
      agendamento_ids.map((aid) =>
        db.query(
          `INSERT INTO crew_agendamentos (crew_id, agendamento_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, aid]
        )
      )
    );
  }

  const campos = [];
  if ((nome || null) !== (nome_ant || null)) campos.push({ campo: "Nome", de: nome_ant, para: nome });
  if ((veiculo_id || null) !== (veiculo_ant || null)) campos.push({ campo: "Veículo", de: veiculo_ant, para: veiculo_id });
  if (membros !== undefined) {
    const novosIds = membros.map(String);
    const removidos = membrosAntIds.filter((m) => !novosIds.includes(m));
    const adicionados = novosIds.filter((m) => !membrosAntIds.includes(m));
    if (removidos.length) campos.push({ campo: "Membros removidos", de: removidos.join(", "), para: null });
    if (adicionados.length) campos.push({ campo: "Membros adicionados", de: null, para: adicionados.join(", ") });
  }
  if (campos.length > 0) {
    await gravarLogCrew(id, empresaId, userId, nomeCompleto, "editado", { campos });
  }

  const lista = await listarCrew(empresaId, data);
  const crew = lista.find((c) => c.id === id);
  await notificarMembrosCrew(crew, empresaId);
  return crew;
}

async function deletarCrew(id, empresaId, userId, nomeCompleto) {
  const { rowCount } = await db.query(
    `DELETE FROM crews WHERE id=$1 AND empresa_id=$2`,
    [id, empresaId]
  );
  if (!rowCount) {
    const err = new Error("Crew não encontrado.");
    err.status = 404;
    throw err;
  }
  await gravarLogCrew(id, empresaId, userId, nomeCompleto, "excluido", null);
}

// ── Work Schedules ────────────────────────────────────────

async function listarWorkSchedules(empresaId) {
  const { rows } = await db.query(
    `SELECT id, nome, descricao, dias, ativo
     FROM work_schedules
     WHERE empresa_id=$1 AND ativo=true
     ORDER BY nome`,
    [empresaId]
  );
  return rows;
}

async function criarWorkSchedule(empresaId, { nome, descricao, dias = [] }) {
  const { rows } = await db.query(
    `INSERT INTO work_schedules (empresa_id, nome, descricao, dias)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [empresaId, nome, descricao || null, JSON.stringify(dias)]
  );
  return rows[0];
}

async function atualizarWorkSchedule(id, empresaId, { nome, descricao, dias, ativo }) {
  const { rows } = await db.query(
    `UPDATE work_schedules
     SET nome=$1, descricao=$2, dias=$3, ativo=$4, updated_at=NOW()
     WHERE id=$5 AND empresa_id=$6
     RETURNING *`,
    [nome, descricao || null, JSON.stringify(dias || []), ativo !== false, id, empresaId]
  );
  if (!rows.length) {
    const err = new Error("Turno não encontrado.");
    err.status = 404;
    throw err;
  }
  return rows[0];
}

// ── Pontos de Partida ─────────────────────────────────────

async function getPontoPartidaDia(empresaId, veiculoId, data) {
  const { rows } = await db.query(
    `SELECT id, label, endereco, lat, lng, usar_padrao
     FROM pontos_partida_dia_veiculo
     WHERE empresa_id=$1 AND veiculo_id=$2 AND data=$3
     LIMIT 1`,
    [empresaId, veiculoId, data]
  );
  return rows[0] || null;
}

async function upsertPontoPartidaDia(empresaId, veiculoId, data, { label, endereco, lat, lng, usar_padrao }) {
  const { rows } = await db.query(
    `INSERT INTO pontos_partida_dia_veiculo
       (empresa_id, veiculo_id, data, label, endereco, lat, lng, usar_padrao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (empresa_id, veiculo_id, data)
     DO UPDATE SET label=$4, endereco=$5, lat=$6, lng=$7, usar_padrao=$8
     RETURNING *`,
    [empresaId, veiculoId, data, label || null, endereco, lat || null, lng || null, usar_padrao || false]
  );
  return rows[0];
}

async function listarEnderecosPadrao(empresaId, veiculoId) {
  const { rows } = await db.query(
    `SELECT id, label, endereco, lat, lng
     FROM enderecos_partida_veiculo
     WHERE empresa_id=$1 AND veiculo_id=$2
     ORDER BY label`,
    [empresaId, veiculoId]
  );
  return rows;
}

async function criarEnderecoPadrao(empresaId, veiculoId, { label, endereco, lat, lng }) {
  const { rows } = await db.query(
    `INSERT INTO enderecos_partida_veiculo (empresa_id, veiculo_id, label, endereco, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [empresaId, veiculoId, label, endereco, lat || null, lng || null]
  );
  return rows[0];
}

async function deletarEnderecoPadrao(id, empresaId) {
  const { rowCount } = await db.query(
    `DELETE FROM enderecos_partida_veiculo WHERE id=$1 AND empresa_id=$2`,
    [id, empresaId]
  );
  if (!rowCount) {
    const err = new Error("Endereço não encontrado.");
    err.status = 404;
    throw err;
  }
}

async function deletarWorkSchedule(id, empresaId) {
  const { rowCount } = await db.query(
    `UPDATE work_schedules SET ativo=false WHERE id=$1 AND empresa_id=$2`,
    [id, empresaId]
  );
  if (!rowCount) {
    const err = new Error("Turno não encontrado.");
    err.status = 404;
    throw err;
  }
}

module.exports = {
  listarCrew, criarCrew, atualizarCrew, deletarCrew, getCrewLogs,
  listarWorkSchedules, criarWorkSchedule, atualizarWorkSchedule, deletarWorkSchedule,
  getPontoPartidaDia, upsertPontoPartidaDia,
  listarEnderecosPadrao, criarEnderecoPadrao, deletarEnderecoPadrao,
};
