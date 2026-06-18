const db = require("../database/db");
const auditSvc = require("./auditoriaService");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { isInstaladorPuro, isComercialPuro, podeGerenciarAgendamentos } = require("./permissionService");
const { geocodificarAgendamento, geocodificarLote, avaliarEndereco } = require("../utils/geocoding");
const { resolverCliente } = require("./clienteService");

/* ── upload Cloudinary ── */
function uploadToCloudinary(fileBuffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => { if (error) return reject(error); resolve(result); }
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
}

/* ── audit log ── */
async function gravarLog(agendamentoId, empresaId, usuarioId, usuarioNome, acao, detalhes) {
  await db.query(
    `INSERT INTO agendamento_logs (agendamento_id, empresa_id, usuario_id, usuario_nome, acao, detalhes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [agendamentoId, empresaId, usuarioId, usuarioNome, acao, detalhes ? JSON.stringify(detalhes) : null]
  ).catch((e) => console.warn("Erro ao gravar log:", e.message));
}

/* Retorna o Set de IDs de usuários com perfil admin/operador da empresa.
   Eles já recebem notificações globais (usuario_id = NULL), então não
   devem receber individuais para evitar duplicatas. */
async function idsAdmins(empresaId) {
  const res = await db.query(
    `SELECT DISTINCT up.usuario_id
     FROM usuario_permissoes up
     JOIN permissoes p ON p.id = up.permissao_id
     JOIN usuarios u   ON u.id = up.usuario_id
     WHERE u.empresa_id = $1
       AND p.codigo IN ('ADMIN_MASTER','OPERADOR_AGENDA')`,
    [empresaId]
  );
  return new Set(res.rows.map((r) => r.usuario_id));
}

/* Envia notificações individuais para equipe + criador do agendamento.
   Exclui: quem disparou a ação (excluirUserId) e admins/operadores
   (que já recebem as notificações globais usuario_id = NULL). */
async function notificarEquipe(agId, empresaId, tituloNotif, mensagemNotif, icone, excluirUserId = null) {
  try {
    const [equipRes, criadoRes, adminIds] = await Promise.all([
      db.query(`SELECT usuario_id FROM agendamento_equipe WHERE agendamento_id=$1`, [agId]),
      db.query(`SELECT criado_por FROM agendamentos WHERE id=$1 LIMIT 1`, [agId]),
      idsAdmins(empresaId),
    ]);

    const criadorId = criadoRes.rows[0]?.criado_por;
    const destinatarios = new Set(equipRes.rows.map((r) => r.usuario_id));
    if (criadorId) destinatarios.add(criadorId);
    if (excluirUserId) destinatarios.delete(excluirUserId);
    for (const aid of adminIds) destinatarios.delete(aid);

    if (!destinatarios.size) return;

    const link = `/agendamentos?id=${agId}&detalhe=1`;
    const uids = [...destinatarios];
    await db.query(
      `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
       SELECT $1, unnest($2::integer[]), 'status_agendamento', $3, $4, $5, $6, $7`,
      [empresaId, uids, tituloNotif, mensagemNotif, link, icone, agId]
    );
  } catch (e) {
    console.warn("Erro ao notificar equipe:", e.message);
  }
}

/* ── montar agendamento completo ── */
async function montarAgendamento(id, empresaId) {
  const [ag, equipe, itens, anexos] = await Promise.all([
    db.query(
      `
      SELECT
        a.*,
        u.nome_completo   AS criado_por_nome,
        ui.nome_completo  AS iniciado_por_nome,
        ui.foto_url       AS iniciado_por_foto,
        uc.nome_completo  AS concluido_por_nome,
        uc.foto_url       AS concluido_por_foto,
        TO_CHAR(a.data, 'YYYY-MM-DD') AS data,
        TO_CHAR(a.hora, 'HH24:MI')   AS hora,
        po.id            AS pessoa_obrigatoria_id,
        po.nome_completo AS pessoa_obrigatoria_nome,
        po.foto_url      AS pessoa_obrigatoria_foto,
        CASE WHEN ped.id IS NOT NULL
          THEN COALESCE(
            CASE WHEN ped.numero_origem ~ '^#[0-9]+$'
                 THEN '#' || regexp_replace(ped.numero_origem, '^#0*', '')
                 ELSE ped.numero_origem
            END,
            'SIS-' || LPAD(COALESCE(ped.numero_sequencial, ped.id)::TEXT, 8, '0')
          )
          ELSE NULL
        END AS pedido_numero
      FROM agendamentos a
      LEFT JOIN usuarios u   ON u.id   = a.criado_por
      LEFT JOIN usuarios ui  ON ui.id  = a.iniciado_por
      LEFT JOIN usuarios uc  ON uc.id  = a.concluido_por
      LEFT JOIN usuarios po  ON po.id  = a.pessoa_obrigatoria_id
      LEFT JOIN pedidos   ped ON ped.id = a.pedido_id AND ped.deleted_at IS NULL
      WHERE a.id = $1 AND a.empresa_id = $2
      LIMIT 1
      `,
      [id, empresaId]
    ),
    db.query(
      `
      SELECT ae.usuario_id AS id,
             COALESCE(u.nome_completo, ae.nome_snapshot, 'Usuário removido') AS nome,
             u.foto_url, s.nome AS setor,
             (u.id IS NULL OR u.status = 'bloqueado') AS inativo
      FROM agendamento_equipe ae
      LEFT JOIN usuarios u ON u.id = ae.usuario_id
      LEFT JOIN setores s ON s.id = u.setor_id
      WHERE ae.agendamento_id = $1
      `,
      [id]
    ),
    db.query(`SELECT id, nome FROM agendamento_itens WHERE agendamento_id=$1 ORDER BY id`, [id]),
    db.query(
      `
      SELECT aa.id, aa.nome, aa.url, aa.tipo, aa.enviado_em,
             aa.enviado_por, u.nome_completo AS enviado_por_nome
      FROM agendamento_anexos aa
      LEFT JOIN usuarios u ON u.id = aa.enviado_por
      WHERE aa.agendamento_id = $1
      ORDER BY aa.enviado_em ASC
      `,
      [id]
    ),
  ]);

  if (ag.rows.length === 0) return null;
  return {
    ...ag.rows[0],
    equipe: equipe.rows,
    itens: itens.rows.map((i) => i.nome),
    itens_raw: itens.rows,
    anexos: anexos.rows,
  };
}

/* ── inserir equipe em paralelo (aceita client de transação) ── */
async function inserirEquipe(agId, equipe, client = db) {
  if (!equipe.length) return;
  await Promise.all(
    equipe.map((uid) =>
      client.query(
        `INSERT INTO agendamento_equipe (agendamento_id, usuario_id, nome_snapshot)
         VALUES ($1, $2, (SELECT nome_completo FROM usuarios WHERE id=$2 LIMIT 1))
         ON CONFLICT DO NOTHING`,
        [agId, uid]
      )
    )
  );
}

/* ── criar Ordem de Serviço (OS) se não existir para itens de conferência ── */
async function criarOSSeNaoExistir(itens, client = db) {
  if (!itens || !itens.length) return;
  for (const it of itens) {
    let pedido_item_id = null;
    if (it && typeof it === "object") {
      pedido_item_id = it.pedido_item_id || it.id || null;
    }
    if (!pedido_item_id) continue;

    const check = await client.query(
      `SELECT id FROM ordem_servico WHERE pedido_item_id = $1 LIMIT 1`,
      [pedido_item_id]
    );
    if (check.rows.length === 0) {
      await client.query(
        `INSERT INTO ordem_servico (pedido_item_id, status, aberta_em, created_at, updated_at)
         VALUES ($1, 'aberta', NOW(), NOW(), NOW())`,
        [pedido_item_id]
      );
    }
  }
}

/* ── inserir itens em batch (aceita client de transação) ── */
async function inserirItens(agId, itens, client = db) {
  if (!itens || !itens.length) return;
  for (const it of itens) {
    let nome = "";
    let pedido_item_id = null;
    if (typeof it === "string") {
      nome = it.trim();
    } else if (it && typeof it === "object") {
      nome = (it.nome || it.descricao || "").trim();
      pedido_item_id = it.pedido_item_id || it.id || null;
    }
    if (!nome) continue;

    await client.query(
      `INSERT INTO agendamento_itens (agendamento_id, nome, pedido_item_id) VALUES ($1, $2, $3)`,
      [agId, nome, pedido_item_id]
    );
  }
}


/* ═══════════════════════════════════════════
   Funções exportadas
═══════════════════════════════════════════ */

async function getEquipe(empresaId) {
  const result = await db.query(
    `
    SELECT DISTINCT u.id, u.nome_completo AS nome, u.foto_url, s.nome AS setor
    FROM usuarios u
    LEFT JOIN setores s ON s.id = u.setor_id
    JOIN usuario_permissoes up ON up.usuario_id = u.id
    JOIN permissoes p ON p.id = up.permissao_id
    WHERE u.empresa_id=$1
      AND u.status = 'aprovado'
      AND (p.codigo = 'INSTALADOR' OR p.nome = 'INSTALADOR')
    ORDER BY u.nome_completo
    `,
    [empresaId]
  );
  return result.rows;
}

async function listar(empresaId, userId, permissoes, filtros) {
  const { status, tipo, data_inicio, data_fim, usuario_id } = filtros;
  const params = [empresaId];
  const wheres = ["a.empresa_id = $1"];

  if (status)      { params.push(status);      wheres.push(`a.status = $${params.length}`); }
  else             { wheres.push(`a.status NOT IN ('pendente_aprovacao','rejeitado')`); }
  if (tipo)        { params.push(tipo);         wheres.push(`a.tipo = $${params.length}`); }
  if (data_inicio) { params.push(data_inicio);  wheres.push(`a.data >= $${params.length}`); }
  if (data_fim)    { params.push(data_fim);     wheres.push(`a.data <= $${params.length}`); }
  if (usuario_id)  {
    params.push(usuario_id);
    wheres.push(`EXISTS (SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id=a.id AND ae.usuario_id=$${params.length})`);
  }
  if (isComercialPuro(permissoes)) {
    params.push(userId);
    wheres.push(`(a.criado_por=$${params.length} OR EXISTS (SELECT 1 FROM agendamento_equipe ae WHERE ae.agendamento_id=a.id AND ae.usuario_id=$${params.length}))`);
  }

  const result = await db.query(
    `
    SELECT
      a.id, a.titulo, a.cliente, a.tipo,
      TO_CHAR(a.data, 'YYYY-MM-DD') AS data, TO_CHAR(a.hora, 'HH24:MI') AS hora,
      a.endereco, a.cep, a.rua, a.numero, a.complemento, a.bairro, a.cidade, a.estado,
      a.lat, a.lng, a.geocod_falhou,
      a.descricao, a.observacoes, a.status, a.duracao_minutos,
      a.criado_por, a.criado_em, a.atualizado_em, a.iniciado_em, a.concluido_em,
      a.pessoa_obrigatoria_id, a.pedido_id, a.cliente_id,
      uc.nome_completo AS criado_por_nome,
      ui.nome_completo AS iniciado_por_nome,
      uf.nome_completo AS concluido_por_nome,
      (SELECT l.usuario_nome FROM agendamento_logs l
         WHERE l.agendamento_id=a.id AND l.acao='editado'
         ORDER BY l.criado_em DESC LIMIT 1) AS editado_por_nome,
      (SELECT l.criado_em FROM agendamento_logs l
         WHERE l.agendamento_id=a.id AND l.acao='editado'
         ORDER BY l.criado_em DESC LIMIT 1) AS editado_em,
      CASE WHEN ped.id IS NOT NULL
        THEN COALESCE(
            CASE WHEN ped.numero_origem ~ '^#[0-9]+$'
                 THEN '#' || regexp_replace(ped.numero_origem, '^#0*', '')
                 ELSE ped.numero_origem
            END,
            'SIS-' || LPAD(COALESCE(ped.numero_sequencial, ped.id)::TEXT, 8, '0')
          )
        ELSE NULL
      END AS pedido_numero
    FROM agendamentos a
    LEFT JOIN usuarios uc  ON uc.id  = a.criado_por
    LEFT JOIN usuarios ui  ON ui.id  = a.iniciado_por
    LEFT JOIN usuarios uf  ON uf.id  = a.concluido_por
    LEFT JOIN pedidos   ped ON ped.id = a.pedido_id AND ped.deleted_at IS NULL
    WHERE ${wheres.join(" AND ")}
    ORDER BY a.data ASC, a.hora ASC
    `,
    params
  );

  const ids = result.rows.map((r) => r.id);
  let equipePorId = {};
  let itensPorId  = {};

  if (ids.length > 0) {
    const [eqResult, itResult] = await Promise.all([
      db.query(
        `
        SELECT ae.agendamento_id, ae.usuario_id AS id,
               COALESCE(u.nome_completo, ae.nome_snapshot, 'Usuário removido') AS nome,
               u.foto_url, s.nome AS setor,
               (u.id IS NULL OR u.status = 'bloqueado') AS inativo
        FROM agendamento_equipe ae
        LEFT JOIN usuarios u ON u.id = ae.usuario_id
        LEFT JOIN setores s ON s.id = u.setor_id
        WHERE ae.agendamento_id = ANY($1)
        `,
        [ids]
      ),
      db.query(
        `SELECT agendamento_id, nome FROM agendamento_itens WHERE agendamento_id=ANY($1) ORDER BY id`,
        [ids]
      ),
    ]);

    eqResult.rows.forEach((r) => {
      if (!equipePorId[r.agendamento_id]) equipePorId[r.agendamento_id] = [];
      equipePorId[r.agendamento_id].push(r);
    });
    itResult.rows.forEach((r) => {
      if (!itensPorId[r.agendamento_id]) itensPorId[r.agendamento_id] = [];
      itensPorId[r.agendamento_id].push(r.nome);
    });
  }

  return result.rows.map((a) => ({
    ...a,
    equipe: (equipePorId[a.id] || []).map((e) => e.id),
    equipe_info: equipePorId[a.id] || [],
    itens: itensPorId[a.id] || [],
    anexos: [],
    pessoa_obrigatoria_id: a.pessoa_obrigatoria_id || null,
  }));
}

async function buscar(id, empresaId) {
  return montarAgendamento(id, empresaId);
}

async function criar(empresaId, userId, dados) {
  const {
    titulo, cliente, tipo, data, hora, endereco, cep, rua, numero, complemento,
    bairro, cidade, estado, descricao, observacoes, duracao_minutos,
    equipe = [], itens = [], pessoa_obrigatoria_id = null,
    status: statusInput,
    cliente_telefone, cliente_email, cliente_novo,
    novo_pedido,
    agendamento_pai_id = null,
  } = dados;
  const statusCriacao = statusInput === "pre_agendado" ? "pre_agendado" : "agendado";

  const aprovacao = dados.aprovacao || null;            // { motivo, data_minima, dias_faltantes }
  const statusFinal = aprovacao ? "pendente_aprovacao" : statusCriacao;
  const statusPretendido = aprovacao ? statusCriacao : null;

  /* Resolve ou cria o cliente */
  const { id: clienteId, criado: clienteCriado } = await resolverCliente(
    empresaId, cliente,
    { telefone: cliente_telefone, email: cliente_email }
  );

  /* Se o cliente foi criado agora e há endereço, salva como endereço padrão */
  if (clienteCriado && (rua || cidade)) {
    db.query(
      `INSERT INTO cliente_enderecos
         (cliente_id, label, rua, numero, complemento, bairro, cidade, estado, cep, is_padrao)
       VALUES ($1,'Principal',$2,$3,$4,$5,$6,$7,$8,TRUE)`,
      [clienteId, rua||null, numero||null, complemento||null, bairro||null, cidade||null, estado||null, cep||null]
    ).catch(() => {});
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    /* Cria pedido inline se solicitado */
    let pedidoIdFinal = dados.pedido_id ? Number(dados.pedido_id) : null;
    if (novo_pedido?.descricao?.trim()) {
      const pedRes = await client.query(
        `INSERT INTO pedidos (empresa_id, cliente_id, status, descricao, observacoes, criado_por)
         VALUES ($1,$2,'pendente',$3,$4,$5) RETURNING id`,
        [empresaId, clienteId,
         novo_pedido.descricao.trim(), novo_pedido.observacoes?.trim() || null, userId]
      );
      pedidoIdFinal = pedRes.rows[0].id;

      /* Salva endereço no pedido em background (requer migration pedidos_endereco.sql) */
      if (rua || cidade || cep) {
        const partesPed = [rua, numero, complemento, bairro, cidade, estado ? `- ${estado}` : ""].filter(Boolean);
        const endPedido = partesPed.length ? partesPed.join(", ") + (cep ? ` — CEP ${cep}` : "") : null;
        db.query(
          `UPDATE pedidos SET cep=$1,rua=$2,numero=$3,complemento=$4,bairro=$5,cidade=$6,estado=$7,endereco=$8 WHERE id=$9`,
          [cep||null, rua||null, numero||null, complemento||null, bairro||null, cidade||null, estado||null, endPedido, pedidoIdFinal]
        ).catch(() => {});
      }
    }

    const result = await client.query(
      `
      INSERT INTO agendamentos
        (empresa_id, titulo, cliente, tipo, data, hora, endereco, cep, rua, numero, complemento,
         bairro, cidade, estado, descricao, observacoes, status, criado_por, duracao_minutos,
         pessoa_obrigatoria_id, agendamento_pai_id, cliente_id, pedido_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$20,$17,$18,$19,$21,$22,$23)
      RETURNING id
      `,
      [empresaId, titulo, cliente, tipo||"Instalação", data, hora||null,
       endereco||null, cep||null, rua||null, numero||null, complemento||null,
       bairro||null, cidade||null, estado||null, descricao||null, observacoes||null,
       userId, duracao_minutos||null, pessoa_obrigatoria_id||null, statusFinal,
       agendamento_pai_id||null, clienteId, pedidoIdFinal]
    );
    const agId = result.rows[0].id;

    if (aprovacao) {
      await client.query(
        `UPDATE agendamentos
         SET status_pretendido=$1, motivo_urgencia=$2, aprovacao_solicitada_em=NOW(),
             aprovacao_data_minima=$3, aprovacao_dias_faltantes=$4
         WHERE id=$5`,
        [statusPretendido, aprovacao.motivo || null, aprovacao.data_minima || null, aprovacao.dias_faltantes || null, agId]
      );
    }

    await Promise.all([inserirEquipe(agId, equipe, client), inserirItens(agId, itens, client)]);

    if (tipo === "Conferência") {
      await criarOSSeNaoExistir(itens, client);
    }

    await client.query("COMMIT");

    // Auto-transição: pedido pendente → em_andamento ao criar pré-agendamento genitor
    const temItensPedido = (itens || []).some((i) => i.pedido_item_id != null);
    if (pedidoIdFinal && temItensPedido) {
      await db.query(
        `UPDATE pedidos SET status = 'em_andamento' WHERE id = $1 AND status = 'pendente'`,
        [pedidoIdFinal]
      );
      await db.query(
        `INSERT INTO pedido_auditoria
           (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
         VALUES ($1,$2,$3,'entrega','pre_agendamento_criado',$4)`,
        [pedidoIdFinal, empresaId, userId || null,
          `Pré-agendamento criado${data ? ` para ${data}` : ""}`]
      );
    }

    if (aprovacao) {
      notificarAdminsAprovacao(empresaId, agId, titulo, cliente);
    }

    // geocodifica em background sem bloquear a resposta
    geocodificarAgendamento({ endereco, rua, numero, bairro, cidade, estado })
      .then((coords) => {
        if (coords) {
          db.query(`UPDATE agendamentos SET lat=$1, lng=$2, geocod_falhou=FALSE WHERE id=$3`, [coords.lat, coords.lng, agId]);
        } else {
          db.query(`UPDATE agendamentos SET geocod_falhou=TRUE WHERE id=$1`, [agId]);
        }
      })
      .catch(() => {
        db.query(`UPDATE agendamentos SET geocod_falhou=TRUE WHERE id=$1`, [agId]).catch(() => {});
      });

    return montarAgendamento(agId, empresaId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function atualizar(id, empresaId, userId, nomeCompleto, dados) {
  const {
    titulo, cliente, tipo, data, hora, endereco, cep, rua, numero, complemento,
    bairro, cidade, estado, descricao, observacoes, duracao_minutos,
    equipe = [], itens = [], pessoa_obrigatoria_id = null,
    status: statusInput,
  } = dados;

  const [existe, equipeAnt] = await Promise.all([
    db.query(
      `SELECT id, status,
              titulo, cliente, tipo, descricao, observacoes, duracao_minutos,
              TO_CHAR(data,'YYYY-MM-DD') AS data, TO_CHAR(hora,'HH24:MI') AS hora,
              endereco, cep, rua, numero, complemento, bairro, cidade, estado
       FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
      [id, empresaId]
    ),
    db.query(
      `SELECT ae.usuario_id AS id, COALESCE(u.nome_completo, ae.nome_snapshot, 'Usuário removido') AS nome
       FROM agendamento_equipe ae LEFT JOIN usuarios u ON u.id = ae.usuario_id
       WHERE ae.agendamento_id=$1`,
      [id]
    ),
  ]);

  if (existe.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }
  const statusAtual = existe.rows[0].status;
  if (["andamento","concluido","nao_concluido","cancelado"].includes(statusAtual)) {
    const e = new Error("Agendamentos em andamento, concluídos ou cancelados não podem ser editados.");
    e.status = 403; throw e;
  }
  const STATUSES_EDICAO = ["agendado", "pre_agendado"];
  const novoStatus = STATUSES_EDICAO.includes(statusInput) ? statusInput : statusAtual;
  const aprovacao = dados.aprovacao || null;
  const statusFinal = aprovacao ? "pendente_aprovacao" : novoStatus;

  // Detecta se o endereço mudou — qualquer mudança força nova geocodificação
  const ant = existe.rows[0];
  const enderecoMudou =
    (rua    || null) !== (ant.rua    || null) ||
    (numero || null) !== (ant.numero || null) ||
    (bairro || null) !== (ant.bairro || null) ||
    (cidade || null) !== (ant.cidade || null) ||
    (estado || null) !== (ant.estado || null) ||
    (cep    || null) !== (ant.cep    || null);

  /* Resolve ou cria o cliente antes da transação principal */
  const { id: clienteId } = await resolverCliente(empresaId, cliente);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      UPDATE agendamentos
      SET titulo=$1, cliente=$2, tipo=$3, data=$4, hora=$5,
          endereco=$6, cep=$7, rua=$8, numero=$9, complemento=$10,
          bairro=$11, cidade=$12, estado=$13,
          descricao=$14, observacoes=$15, duracao_minutos=$16,
          pessoa_obrigatoria_id=$17, status=$18, atualizado_em=NOW()
          ${enderecoMudou ? ", lat=NULL, lng=NULL, geocod_falhou=FALSE" : ""}
      WHERE id=$19 AND empresa_id=$20
      `,
      [titulo, cliente, tipo, data, hora||null,
       endereco||null, cep||null, rua||null, numero||null, complemento||null,
       bairro||null, cidade||null, estado||null, descricao||null, observacoes||null,
       duracao_minutos||null, pessoa_obrigatoria_id||null, statusFinal, id, empresaId]
    );
    /* Vincula cliente_id e pedido_id em background — silencia erro se migration ainda não foi aplicada */
    db.query(`UPDATE agendamentos SET cliente_id=$1 WHERE id=$2`, [clienteId, id]).catch(() => {});
    db.query(`UPDATE agendamentos SET pedido_id=$1 WHERE id=$2`, [dados.pedido_id || null, id]).catch(() => {});

    if (aprovacao) {
      await client.query(
        `UPDATE agendamentos
         SET status_pretendido=$1, motivo_urgencia=$2, aprovacao_solicitada_em=NOW(),
             aprovacao_data_minima=$3, aprovacao_dias_faltantes=$4, motivo_rejeicao=NULL, aprovado_por=NULL, aprovacao_em=NULL
         WHERE id=$5 AND empresa_id=$6`,
        [STATUSES_EDICAO.includes(statusInput) ? statusInput : "agendado",
         aprovacao.motivo || null, aprovacao.data_minima || null, aprovacao.dias_faltantes || null, id, empresaId]
      );
    } else if (["rejeitado", "pendente_aprovacao"].includes(statusAtual)) {
      // reagendamento limpo após rejeição: data agora válida → encerra a pendência
      await client.query(
        `UPDATE agendamentos
         SET status_pretendido=NULL, motivo_urgencia=NULL, motivo_rejeicao=NULL,
             aprovacao_data_minima=NULL, aprovacao_dias_faltantes=NULL
         WHERE id=$1 AND empresa_id=$2`,
        [id, empresaId]
      );
    }

    await Promise.all([
      client.query(`DELETE FROM agendamento_equipe WHERE agendamento_id=$1`, [id]),
      client.query(`DELETE FROM agendamento_itens WHERE agendamento_id=$1`, [id]),
    ]);
    await Promise.all([inserirEquipe(id, equipe, client), inserirItens(id, itens, client)]);

    if (tipo === "Conferência") {
      await criarOSSeNaoExistir(itens, client);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Se endereço mudou (ou nunca foi geocodificado), tenta em background
  if (enderecoMudou) {
    geocodificarAgendamento({ endereco, rua, numero, bairro, cidade, estado })
      .then((coords) => {
        if (coords) {
          db.query(`UPDATE agendamentos SET lat=$1, lng=$2, geocod_falhou=FALSE WHERE id=$3`, [coords.lat, coords.lng, id]);
        } else {
          db.query(`UPDATE agendamentos SET geocod_falhou=TRUE WHERE id=$1`, [id]);
        }
      })
      .catch(() => {
        db.query(`UPDATE agendamentos SET geocod_falhou=TRUE WHERE id=$1`, [id]).catch(() => {});
      });
  }

  const ag = await montarAgendamento(id, empresaId);

  /* ── log de edição: registra apenas os campos que mudaram ── */
  const LABEL = {
    titulo: "Título", cliente: "Cliente", tipo: "Tipo",
    data: "Data", hora: "Hora", duracao_minutos: "Duração",
    descricao: "Descrição", observacoes: "Observações",
    endereco: "Endereço",
  };
  const campos = [];
  for (const [k, label] of Object.entries(LABEL)) {
    const antes = ant[k] ?? null;
    const depois = (k === "endereco" ? endereco : dados[k]) ?? null;
    if (String(antes ?? "") !== String(depois ?? "")) {
      campos.push({ campo: label, de: antes, para: depois });
    }
  }
  if (ant.status !== novoStatus) {
    campos.push({ campo: "Status", de: ant.status, para: novoStatus });
  }
  const equipeNovaIds = new Set(equipe.map(String));
  const equipeAntIds  = new Set(equipeAnt.rows.map((r) => String(r.id)));
  const removidos     = equipeAnt.rows.filter((r) => !equipeNovaIds.has(String(r.id)));
  const novosNomes    = (ag?.equipe_info || []).filter((r) => !equipeAntIds.has(String(r.id))).map((r) => r.nome);
  if (removidos.length) campos.push({ campo: "Equipe removida", de: removidos.map((r) => r.nome).join(", "), para: null });
  if (novosNomes.length) campos.push({ campo: "Equipe adicionada", de: null, para: novosNomes.join(", ") });

  if (campos.length > 0) {
    gravarLog(id, empresaId, userId, nomeCompleto, "editado", { campos, origem: "formulario" });
  }

  try {
    const tituloN   = `Agendamento editado: ${ag?.titulo || `#${id}`}`;
    const mensagemN = `Os dados do agendamento "${ag?.titulo || `#${id}`}" foram atualizados.`;
    await Promise.all([
      db.query(
        `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
         VALUES ($1, NULL, 'sistema', $2, $3, $4, 'info', $5)`,
        [empresaId, tituloN, mensagemN, `/agendamentos?id=${id}&detalhe=1`, id]
      ),
      notificarEquipe(id, empresaId, tituloN, mensagemN, "info", userId),
    ]);
  } catch (e) {
    console.warn("Erro ao criar notificação de edição:", e.message);
  }

  if (aprovacao) {
    notificarAdminsAprovacao(empresaId, id, ag?.titulo, ag?.cliente);
  }

  return ag;
}

async function alterarStatus(id, empresaId, userId, nomeCompleto, permissoes, status, motivo, files, nomes) {
  const STATUS_VALIDOS = ["agendado","andamento","concluido","nao_concluido","cancelado","atrasado","pre_agendado"];
  if (!STATUS_VALIDOS.includes(status)) { const e = new Error("Status inválido."); e.status = 400; throw e; }

  const STATUS_INSTALADOR = ["andamento","concluido","nao_concluido"];
  if (isInstaladorPuro(permissoes) && !STATUS_INSTALADOR.includes(status)) {
    const e = new Error("Instaladores não podem alterar para este status."); e.status = 403; throw e;
  }

  if (status === "cancelado" && isComercialPuro(permissoes)) {
    const criadorCheck = await db.query(
      `SELECT criado_por FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
      [id, empresaId]
    );
    if (criadorCheck.rows[0]?.criado_por !== userId) {
      const e = new Error("Vendedores só podem cancelar agendamentos que criaram."); e.status = 403; throw e;
    }
  }

  const existe = await db.query(
    `SELECT id, titulo, cliente, tipo, criado_por, status AS status_anterior FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }

  const ACOES_BLOQUEADAS_DE_PRE_AGENDADO = ["andamento", "concluido", "nao_concluido"];
  if (existe.rows[0].status_anterior === "pre_agendado" && ACOES_BLOQUEADAS_DE_PRE_AGENDADO.includes(status)) {
    const e = new Error("Agendamentos pré-agendados são somente para visualização — confirme o agendamento antes de iniciar ou concluir.");
    e.status = 400;
    throw e;
  }

  if (status === "concluido" && existe.rows[0]?.tipo === "Conferência") {
    const pendentesCheck = await db.query(
      `SELECT COUNT(*) FILTER (WHERE os.dados_tecnicos IS NULL) AS pendentes, COUNT(*) AS total
       FROM agendamento_itens ai
       JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
       LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
       WHERE ai.agendamento_id = $1 AND ai.pedido_item_id IS NOT NULL`,
      [id]
    );
    const { pendentes, total } = pendentesCheck.rows[0];
    if (Number(pendentes) > 0) {
      const e = new Error(`Ainda há ${pendentes} de ${total} item(ns) pendente(s) de conferência. Confira todos os itens antes de concluir o agendamento.`);
      e.status = 400;
      throw e;
    }
  }

  /* uploads Cloudinary ANTES da transação (não pode ser dentro — operação externa) */
  const anexosParaInserir = [];
  if (files?.length > 0) {
    const isDepois = status === "concluido" || status === "nao_concluido";
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mime = file.mimetype || "";
      let tipoAnexo;
      if (mime.startsWith("video/"))      tipoAnexo = isDepois ? "video_depois" : "video_antes";
      else if (mime.startsWith("image/")) tipoAnexo = isDepois ? "foto_depois"  : "foto_antes";
      else                                tipoAnexo = "documento";
      const nomeCustom = ((nomes || [])[i] || "").trim() || file.originalname;
      const uploaded = await uploadToCloudinary(
        file.buffer,
        `operon/empresas/${empresaId}/agendamentos/${id}`
      );
      anexosParaInserir.push({ nome: nomeCustom, url: uploaded.secure_url, tipo: tipoAnexo });
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    if (status === "andamento") {
      await client.query(
        `UPDATE agendamentos SET status=$1, atualizado_em=NOW(),
           iniciado_em=COALESCE(iniciado_em,NOW()), iniciado_por=COALESCE(iniciado_por,$4)
         WHERE id=$2 AND empresa_id=$3`,
        [status, id, empresaId, userId]
      );

      // Debita km do odômetro do veículo da crew do dia (fire-and-forget, fora da transação)
      db.query(
        `SELECT a.km_rota, c.veiculo_id
         FROM agendamentos a
         JOIN crew_agendamentos ca ON ca.agendamento_id = a.id
         JOIN crews c ON c.id = ca.crew_id AND c.veiculo_id IS NOT NULL
         WHERE a.id = $1 AND a.empresa_id = $2 AND a.km_rota > 0
         LIMIT 1`,
        [id, empresaId]
      ).then(async ({ rows }) => {
        const row = rows[0];
        if (!row) return;
        await db.query(
          `UPDATE veiculos SET
             km_atual = GREATEST(
               COALESCE(km_atual,
                 (SELECT COALESCE(MAX(ab.km_atual), 0) FROM abastecimentos ab
                  WHERE ab.veiculo_id = $2 AND ab.empresa_id = $3 AND ab.km_atual IS NOT NULL)
               ), 0
             ) + $1,
             updated_at = NOW()
           WHERE id = $2 AND empresa_id = $3 AND deleted_at IS NULL`,
          [Number(row.km_rota), row.veiculo_id, empresaId]
        );
      }).catch((e) => console.warn("Aviso: não foi possível registrar km no veículo:", e.message));
    } else if (status === "concluido") {
      await client.query(
        `UPDATE agendamentos SET status=$1, atualizado_em=NOW(),
           iniciado_em=COALESCE(iniciado_em,NOW()), iniciado_por=COALESCE(iniciado_por,$4),
           concluido_em=NOW(), concluido_por=$4
         WHERE id=$2 AND empresa_id=$3`,
        [status, id, empresaId, userId]
      );

      if (existe.rows[0]?.tipo === "Conferência") {
        const itensAg = await client.query(
          `SELECT pedido_item_id FROM agendamento_itens WHERE agendamento_id = $1 AND pedido_item_id IS NOT NULL`,
          [id]
        );
        const isComercial = (permissoes || []).includes("COMERCIAL");

        for (const row of itensAg.rows) {
          const itemId = row.pedido_item_id;

          const osCheck = await client.query(
            `SELECT id FROM ordem_servico WHERE pedido_item_id = $1 LIMIT 1`,
            [itemId]
          );
          let osId;
          if (osCheck.rows.length === 0) {
            const newOs = await client.query(
              `INSERT INTO ordem_servico (pedido_item_id, status, aberta_em)
               VALUES ($1, 'aberta', NOW()) RETURNING id`,
              [itemId]
            );
            osId = newOs.rows[0].id;
          } else {
            osId = osCheck.rows[0].id;
          }

          if (isComercial) {
            await client.query(
              `UPDATE ordem_servico 
               SET conferencia_consultora_usuario_id = $1,
                   conferencia_consultora_at = NOW(),
                   conferencia_consultora_obs = COALESCE(conferencia_consultora_obs, 'Concluído via agendamento de conferência.'),
                   updated_at = NOW()
               WHERE id = $2`,
              [userId, osId]
            );
          } else {
            await client.query(
              `UPDATE ordem_servico 
               SET conferencia_tecnico_usuario_id = $1,
                   conferencia_tecnico_at = NOW(),
                   conferencia_tecnico_obs = COALESCE(conferencia_tecnico_obs, 'Concluído via agendamento de conferência.'),
                   updated_at = NOW()
               WHERE id = $2`,
              [userId, osId]
            );
          }
        }
      }
    } else if (status === "nao_concluido") {
      await client.query(
        `UPDATE agendamentos SET status=$1, observacoes_status=$2, atualizado_em=NOW(),
           concluido_em=NOW(), concluido_por=$5
         WHERE id=$3 AND empresa_id=$4`,
        [status, motivo||null, id, empresaId, userId]
      );
    } else {
      await client.query(
        `UPDATE agendamentos SET status=$1, atualizado_em=NOW() WHERE id=$2 AND empresa_id=$3`,
        [status, id, empresaId]
      );
    }

    for (const a of anexosParaInserir) {
      await client.query(
        `INSERT INTO agendamento_anexos (agendamento_id, nome, url, tipo, enviado_por) VALUES ($1,$2,$3,$4,$5)`,
        [id, a.nome, a.url, a.tipo, userId]
      );
    }

    if (status === "cancelado") {
      await gravarLog(id, empresaId, userId, nomeCompleto, "cancelado", {
        titulo: existe.rows[0]?.titulo, motivo: motivo||null,
      });
    } else {
      const statusAnterior = existe.rows[0]?.status_anterior;
      if (statusAnterior && statusAnterior !== status) {
        await gravarLog(id, empresaId, userId, nomeCompleto, "status_alterado", {
          status_anterior: statusAnterior,
          status_novo: status,
        });
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Auto-conclusão: se todos os genitores do pedido foram concluídos, conclui o pedido
  if (status === "concluido") {
    const agInfo = await db.query(
      `SELECT pedido_id FROM agendamentos WHERE id = $1`, [id]
    );
    const pedidoId = agInfo.rows[0]?.pedido_id;
    if (pedidoId) {
      const isGenitor = await db.query(
        `SELECT 1 FROM agendamento_itens
         WHERE agendamento_id = $1 AND pedido_item_id IS NOT NULL LIMIT 1`,
        [id]
      );
      if (isGenitor.rows.length > 0) {
        const pendentes = await db.query(
          `SELECT a.id FROM agendamentos a
           WHERE a.pedido_id = $1 AND a.empresa_id = $2
             AND EXISTS (
               SELECT 1 FROM agendamento_itens ai
               WHERE ai.agendamento_id = a.id AND ai.pedido_item_id IS NOT NULL
             )
             AND a.status != 'concluido'
             AND a.id != $3`,
          [pedidoId, empresaId, id]
        );
        if (pendentes.rows.length === 0) {
          await db.query(
            `UPDATE pedidos SET status = 'concluido'
             WHERE id = $1 AND status NOT IN ('cancelado', 'concluido')`,
            [pedidoId]
          );
          await db.query(
            `INSERT INTO pedido_auditoria
               (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
             VALUES ($1,$2,$3,'entrega','pedido_concluido','Pedido concluído automaticamente — todos os agendamentos finalizados')`,
            [pedidoId, empresaId, userId || null]
          );
        }
        await db.query(
          `INSERT INTO pedido_auditoria
             (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
           VALUES ($1,$2,$3,'entrega','agendamento_concluido',$4)`,
          [pedidoId, empresaId, userId || null, `Agendamento ${id} concluído`]
        );
      }
    }
  }

  const ag = await montarAgendamento(id, empresaId);

  try {
    const STATUS_LABEL = { agendado:"Agendado", andamento:"Em andamento", concluido:"Concluído", nao_concluido:"Não concluído", cancelado:"Cancelado", atrasado:"Atrasado" };
    const STATUS_ICONE = { concluido:"sucesso", nao_concluido:"alerta", cancelado:"erro", atrasado:"atrasado", andamento:"info", agendado:"info" };
    const label     = STATUS_LABEL[status] || status;
    const icone     = STATUS_ICONE[status] || "info";
    const titulo    = ag?.titulo  || `Agendamento #${id}`;
    const cliente   = ag?.cliente || "";
    const tituloN   = `Status alterado: ${titulo}`;
    const mensagemN = `${cliente ? cliente + " — " : ""}Status atualizado para "${label}"`;

    const link = `/agendamentos?id=${id}&detalhe=1`;

    let notifs;
    if (status === "nao_concluido") {
      /* Caso especial: uma única notificação combinada para não duplicar */
      const tituloUnico = `Reagendar: ${titulo}`;
      const msgUnica    = `${cliente ? cliente + " — " : ""}Serviço não concluído. Reagendamento necessário.`;
      notifs = [
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1, NULL, 'reagendamento_pendente', $2, $3, $4, 'alerta', $5)`,
          [empresaId, tituloUnico, msgUnica, link, id]
        ),
        notificarEquipe(id, empresaId, tituloUnico, msgUnica, "alerta", userId),
      ];
    } else {
      notifs = [
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1, NULL, 'status_agendamento', $2, $3, $4, $5, $6)`,
          [empresaId, tituloN, mensagemN, link, icone, id]
        ),
        notificarEquipe(id, empresaId, tituloN, mensagemN, icone, userId),
      ];
    }

    await Promise.all(notifs);
  } catch (notifErr) {
    console.warn("Erro ao criar notificação de status:", notifErr.message);
  }

  return ag;
}

async function adicionarAnexos(id, empresaId, userId, files) {
  const existe = await db.query(
    `SELECT id FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }
  if (!files?.length)           { const e = new Error("Nenhum arquivo recebido.");      e.status = 400; throw e; }

  const uploadados = [];
  for (const file of files) {
    const mime = file.mimetype || "";
    let tipo = "documento";
    if (mime.startsWith("image/")) tipo = "foto_antes";
    else if (mime.startsWith("video/")) tipo = "video";

    const uploaded = await uploadToCloudinary(
      file.buffer,
      `operon/empresas/${empresaId}/agendamentos/${id}`
    );
    await db.query(
      `INSERT INTO agendamento_anexos (agendamento_id, nome, url, tipo, enviado_por) VALUES ($1,$2,$3,$4,$5)`,
      [id, file.originalname, uploaded.secure_url, tipo, userId]
    );
    uploadados.push({ nome: file.originalname, url: uploaded.secure_url, tipo });
  }
  return uploadados;
}

async function excluir(id, empresaId, userId, nomeCompleto, permissoes) {
  const agResult = await db.query(
    `SELECT id, titulo, criado_por, status FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (agResult.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }

  const ag         = agResult.rows[0];
  const isGestor   = podeGerenciarAgendamentos(permissoes);
  const isComercial = (permissoes || []).includes("COMERCIAL");
  const isCriador   = ag.criado_por === userId;

  if (!isGestor && !(isComercial && isCriador)) {
    const e = new Error("Sem permissão para excluir este agendamento."); e.status = 403; throw e;
  }

  await gravarLog(id, empresaId, userId, nomeCompleto, "excluido", {
    titulo: ag.titulo, status_anterior: ag.status, motivo: "Exclusão pelo usuário",
  });

  const result = await db.query(
    `DELETE FROM agendamentos WHERE id=$1 AND empresa_id=$2 RETURNING id`,
    [id, empresaId]
  );
  if (result.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }
}

async function getLogs(id, empresaId) {
  const existe = await db.query(
    `SELECT id FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }

  const result = await db.query(
    `SELECT id, agendamento_id, usuario_nome, acao, detalhes, criado_em
     FROM agendamento_logs WHERE agendamento_id=$1 ORDER BY criado_em DESC LIMIT 200`,
    [id]
  );
  return result.rows;
}

async function criarSugestao(id, empresaId, userId, tipo, descricao) {
  if (!tipo || !descricao) { const e = new Error("Tipo e descrição são obrigatórios."); e.status = 400; throw e; }

  const existe = await db.query(
    `SELECT id FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }

  const result = await db.query(
    `INSERT INTO agendamento_sugestoes (agendamento_id, usuario_id, tipo, descricao) VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, userId, tipo, descricao]
  );
  return result.rows[0];
}

async function listarSugestoes(id, empresaId) {
  const existe = await db.query(
    `SELECT id FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }

  const result = await db.query(
    `
    SELECT s.*, u.nome_completo AS usuario_nome
    FROM agendamento_sugestoes s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.agendamento_id=$1
    ORDER BY s.criado_em DESC
    `,
    [id]
  );
  return result.rows;
}

async function responderSugestao(sid, userId, empresaId, status, resposta) {
  if (!["aprovada","rejeitada"].includes(status)) {
    const e = new Error("Status inválido para sugestão."); e.status = 400; throw e;
  }

  // JOIN com agendamentos garante que a sugestão pertence à empresa do usuário (previne IDOR)
  const result = await db.query(
    `UPDATE agendamento_sugestoes s
     SET status=$1, resposta=$2, respondido_por=$3, respondido_em=NOW()
     FROM agendamentos a
     WHERE s.id=$4 AND s.agendamento_id = a.id AND a.empresa_id=$5
     RETURNING s.*`,
    [status, resposta||null, userId, sid, empresaId]
  );
  if (result.rows.length === 0) { const e = new Error("Sugestão não encontrada."); e.status = 404; throw e; }
  return result.rows[0];
}

/* Reagendamento leve (drag & drop) — só atualiza data/hora/duração */
async function reagendar(id, empresaId, userId, nomeCompleto, permissoes, { data, hora, duracao_minutos }) {
  const existe = await db.query(
    `SELECT id, status, criado_por, titulo, cliente,
            TO_CHAR(data,'YYYY-MM-DD') AS data_ant,
            TO_CHAR(hora,'HH24:MI')    AS hora_ant,
            duracao_minutos            AS dur_ant
     FROM agendamentos WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
    [id, empresaId]
  );
  if (!existe.rows.length) { const e = new Error("Agendamento não encontrado."); e.status = 404; throw e; }

  const ag = existe.rows[0];
  if (["andamento","concluido","nao_concluido","cancelado"].includes(ag.status)) {
    const e = new Error("Este agendamento não pode ser reagendado."); e.status = 403; throw e;
  }

  const podeGer = podeGerenciarAgendamentos(permissoes);
  const ehVend  = isComercialPuro(permissoes);
  if (!podeGer && !(ehVend && ag.criado_por === userId)) {
    const e = new Error("Sem permissão para reagendar este agendamento."); e.status = 403; throw e;
  }

  await db.query(
    `UPDATE agendamentos SET data=$1, hora=$2, duracao_minutos=$3, atualizado_em=NOW()
     WHERE id=$4 AND empresa_id=$5`,
    [data, hora, duracao_minutos || null, id, empresaId]
  );

  const titulo   = ag.titulo || `#${id}`;
  const cliente  = ag.cliente ? `${ag.cliente} — ` : "";
  const tituloN  = `Agendamento editado: ${titulo}`;
  const msgN     = `${cliente}Data/hora atualizada para ${data.split("-").reverse().join("/")} às ${hora}.`;

  gravarLog(id, empresaId, userId, nomeCompleto, "editado", {
    data_anterior: ag.data_ant, hora_anterior: ag.hora_ant, duracao_anterior: ag.dur_ant,
    data_nova: data, hora_nova: hora, duracao_nova: duracao_minutos || null,
    origem: "drag_resize",
  });

  try {
    const link = `/agendamentos?id=${id}&detalhe=1`;

    const [equipRes, adminIds] = await Promise.all([
      db.query(`SELECT usuario_id FROM agendamento_equipe WHERE agendamento_id=$1`, [id]),
      idsAdmins(empresaId),
    ]);

    const destinatarios = new Set(equipRes.rows.map((r) => r.usuario_id));
    if (ag.criado_por) destinatarios.add(ag.criado_por);
    destinatarios.delete(userId);
    for (const aid of adminIds) destinatarios.delete(aid);

    await Promise.all([
      // Global — admins/operadores
      db.query(
        `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
         VALUES ($1, NULL, 'sistema', $2, $3, $4, 'info', $5)`,
        [empresaId, tituloN, msgN, link, id]
      ),
      // Individuais — criador + equipe (exceto admins e quem arrastou)
      ...[...destinatarios].map((uid) =>
        db.query(
          `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
           VALUES ($1,$2,'status_agendamento',$3,$4,$5,'info',$6)`,
          [empresaId, uid, tituloN, msgN, link, id]
        )
      ),
    ]);
  } catch (e) {
    console.warn("Erro ao notificar reagendamento:", e.message);
  }
}

async function geocodificarTodos(empresaId) {
  return geocodificarLote(db, empresaId);
}

/* ── notifica admins/operadores sobre solicitação de urgência (global) ── */
async function notificarAdminsAprovacao(empresaId, agId, titulo, cliente) {
  await db.query(
    `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
     VALUES ($1, NULL, 'aprovacao_urgencia', $2, $3, $4, 'alerta', $5)`,
    [empresaId,
     `Aprovação de urgência: ${titulo || `#${agId}`}`,
     `${cliente ? cliente + " — " : ""}Solicitação de instalação antes do prazo mínimo aguardando aprovação.`,
     `/agendamentos?aprovacoes=1`,
     agId]
  ).catch((e) => console.warn("Erro ao notificar admins (aprovação):", e.message));
}

/* ── lista solicitações de urgência pendentes (para a aba do ADMIN_MASTER) ── */
async function listarPendentesAprovacao(empresaId) {
  const result = await db.query(
    `SELECT a.id, a.titulo, a.cliente, a.tipo,
            TO_CHAR(a.data,'YYYY-MM-DD') AS data, TO_CHAR(a.hora,'HH24:MI') AS hora,
            a.motivo_urgencia, a.aprovacao_solicitada_em,
            TO_CHAR(a.aprovacao_data_minima,'YYYY-MM-DD') AS aprovacao_data_minima,
            a.aprovacao_dias_faltantes,
            a.criado_por, u.nome_completo AS criado_por_nome,
            CASE WHEN ped.id IS NOT NULL
              THEN COALESCE(
            CASE WHEN ped.numero_origem ~ '^#[0-9]+$'
                 THEN '#' || regexp_replace(ped.numero_origem, '^#0*', '')
                 ELSE ped.numero_origem
            END,
            'SIS-' || LPAD(COALESCE(ped.numero_sequencial, ped.id)::TEXT, 8, '0')
          )
              ELSE NULL END AS pedido_numero
     FROM agendamentos a
     LEFT JOIN usuarios u   ON u.id = a.criado_por
     LEFT JOIN pedidos   ped ON ped.id = a.pedido_id AND ped.deleted_at IS NULL
     WHERE a.empresa_id = $1 AND a.status = 'pendente_aprovacao'
     ORDER BY a.aprovacao_solicitada_em ASC NULLS LAST, a.id ASC`,
    [empresaId]
  );
  return result.rows;
}

/* ── aprova ou rejeita uma solicitação de urgência (ADMIN_MASTER) ── */
async function decidirAprovacao(id, empresaId, adminUser, { aprovado, motivo }) {
  const existe = await db.query(
    `SELECT id, titulo, cliente, criado_por, status_pretendido
     FROM agendamentos
     WHERE id=$1 AND empresa_id=$2 AND status='pendente_aprovacao' LIMIT 1`,
    [id, empresaId]
  );
  if (existe.rows.length === 0) {
    const e = new Error("Solicitação de urgência não encontrada ou já decidida."); e.status = 404; throw e;
  }
  const ag = existe.rows[0];

  if (aprovado) {
    const statusFinal = ag.status_pretendido || "agendado";
    await db.query(
      `UPDATE agendamentos
       SET status=$1, aprovado_por=$2, aprovacao_em=NOW(), motivo_rejeicao=NULL, atualizado_em=NOW()
       WHERE id=$3 AND empresa_id=$4`,
      [statusFinal, adminUser.id, id, empresaId]
    );
    await gravarLog(id, empresaId, adminUser.id, adminUser.nome_completo, "urgencia_aprovada", { status_novo: statusFinal });
  } else {
    if (!motivo || !String(motivo).trim()) {
      const e = new Error("Motivo da rejeição é obrigatório."); e.status = 400; throw e;
    }
    await db.query(
      `UPDATE agendamentos
       SET status='rejeitado', aprovado_por=$1, aprovacao_em=NOW(), motivo_rejeicao=$2, atualizado_em=NOW()
       WHERE id=$3 AND empresa_id=$4`,
      [adminUser.id, String(motivo).trim(), id, empresaId]
    );
    await gravarLog(id, empresaId, adminUser.id, adminUser.nome_completo, "urgencia_rejeitada", { motivo: String(motivo).trim() });
  }

  if (ag.criado_por) {
    const titulo  = ag.titulo || `Agendamento #${id}`;
    const tituloN = aprovado ? `Urgência aprovada: ${titulo}` : `Urgência rejeitada: ${titulo}`;
    const msgN    = aprovado
      ? `Sua solicitação de instalação urgente foi aprovada.`
      : `Sua solicitação de instalação urgente foi rejeitada. Motivo: ${String(motivo).trim()}`;
    await db.query(
      `INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, link, icone, agendamento_id)
       VALUES ($1,$2,'aprovacao_urgencia',$3,$4,$5,$6,$7)`,
      [empresaId, ag.criado_por, tituloN, msgN, `/agendamentos?id=${id}&detalhe=1`, aprovado ? "sucesso" : "erro", id]
    ).catch((e) => console.warn("Erro ao notificar solicitante:", e.message));
  }

  return montarAgendamento(id, empresaId);
}

async function listarConferenciaItens(agendamentoId, empresaId) {
  const { rows: agCheck } = await db.query(
    `SELECT id FROM agendamentos WHERE id = $1 AND empresa_id = $2`,
    [agendamentoId, empresaId]
  );
  if (!agCheck.length) {
    const err = new Error("Agendamento não encontrado");
    err.status = 404;
    throw err;
  }

  const { rows } = await db.query(
    `SELECT
       pi.id AS pedido_item_id,
       pi.descricao,
       pi.ambiente,
       COALESCE(ci.status, 'pendente') AS status,
       ci.observacoes,
       ci.dados,
       ci.conferido_em,
       u.nome_completo AS conferido_por_nome,
       os.id AS ordem_servico_id,
       (os.dados_tecnicos IS NOT NULL) AS ficha_preenchida
     FROM agendamento_itens ai
     JOIN pedido_itens pi ON pi.id = ai.pedido_item_id
     LEFT JOIN conferencia_itens ci
       ON ci.agendamento_id = $1 AND ci.pedido_item_id = pi.id
     LEFT JOIN usuarios u ON u.id = ci.conferido_por
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     WHERE ai.agendamento_id = $1
       AND ai.pedido_item_id IS NOT NULL
     ORDER BY pi.ordem ASC, pi.id ASC`,
    [agendamentoId]
  );
  return rows;
}

async function upsertConferenciaItem(agendamentoId, empresaId, usuarioId, { pedido_item_id, status, observacoes, dados }) {
  if (!pedido_item_id) {
    const err = new Error("pedido_item_id obrigatório");
    err.status = 400;
    throw err;
  }
  if (!["pendente", "conferido", "reprovado"].includes(status)) {
    const err = new Error("status inválido");
    err.status = 400;
    throw err;
  }

  const { rows: agCheck } = await db.query(
    `SELECT id FROM agendamentos WHERE id = $1 AND empresa_id = $2`,
    [agendamentoId, empresaId]
  );
  if (!agCheck.length) {
    const err = new Error("Agendamento não encontrado");
    err.status = 404;
    throw err;
  }

  const conferido_em = status !== "pendente" ? new Date() : null;

  const { rows } = await db.query(
    `INSERT INTO conferencia_itens
       (agendamento_id, pedido_item_id, empresa_id, status, observacoes, dados, conferido_por, conferido_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (agendamento_id, pedido_item_id) DO UPDATE SET
       status        = EXCLUDED.status,
       observacoes   = EXCLUDED.observacoes,
       dados         = EXCLUDED.dados,
       conferido_por = EXCLUDED.conferido_por,
       conferido_em  = EXCLUDED.conferido_em
     RETURNING *`,
    [agendamentoId, pedido_item_id, empresaId, status, observacoes || null,
     dados ? JSON.stringify(dados) : null, usuarioId, conferido_em]
  );
  return rows[0];
}

async function confirmarCliente(agendamentoId, empresaId, usuarioId) {
  const { rows } = await db.query(
    `UPDATE agendamentos SET status = 'agendado'
     WHERE id = $1 AND empresa_id = $2 AND status = 'pre_agendado'
     RETURNING id, status`,
    [agendamentoId, empresaId]
  );
  if (!rows.length) {
    const err = new Error("Agendamento não encontrado ou já confirmado");
    err.status = 404;
    throw err;
  }
  await gravarLog(agendamentoId, empresaId, usuarioId, null, "confirmar_cliente", { status: "agendado" });
  return rows[0];
}

module.exports = {
  getEquipe, listar, buscar, criar, atualizar, reagendar,
  alterarStatus, adicionarAnexos, excluir,
  getLogs, criarSugestao, listarSugestoes, responderSugestao,
  geocodificarTodos,
  decidirAprovacao, listarPendentesAprovacao, notificarAdminsAprovacao,
  listarConferenciaItens,
  upsertConferenciaItem,
  confirmarCliente,
};
