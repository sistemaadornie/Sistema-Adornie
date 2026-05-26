const db = require("../database/db");

const ETAPAS = [
  "orcamento",
  "venda",
  "conferencia_consultora",
  "conferencia_tecnica",
  "verificacao_admin",
  "compras",
  "confeccao",
  "pre_agendado",
  "agendado",
];

// ─── 1. listarKanban ──────────────────────────────────────────────────────────

async function listarKanban(empresaId, filtros = {}) {
  const { etapa, cliente_id, prioridade, tipo, prazo } = filtros;

  const conds = ["pp.empresa_id = $1", "pp.deleted_at IS NULL"];
  const params = [empresaId];
  let i = 2;

  if (etapa) {
    conds.push(`pp.etapa = $${i}`);
    params.push(etapa);
    i++;
  }
  if (cliente_id) {
    conds.push(`pp.cliente_id = $${i}`);
    params.push(cliente_id);
    i++;
  }
  if (prioridade) {
    conds.push(`pp.prioridade = $${i}`);
    params.push(prioridade);
    i++;
  }
  if (tipo === "confeccao") {
    conds.push("pp.requer_confeccao = TRUE");
  } else if (tipo === "sob_demanda") {
    conds.push("pp.requer_confeccao = FALSE");
  }
  if (prazo === "atrasado") {
    conds.push("pp.prazo_entrega < NOW()");
  } else if (prazo === "hoje") {
    conds.push("pp.prazo_entrega::date = CURRENT_DATE");
  } else if (prazo === "semana") {
    conds.push("pp.prazo_entrega::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'");
  }

  const res = await db.query(
    `SELECT
       pp.*,
       c.nome  AS nome_cliente,
       COUNT(pi.id)::int                                              AS total_itens,
       COUNT(pi.id) FILTER (
         WHERE pi.status_item IN ('chegou_loja','confeccionado','pronto')
       )::int                                                         AS itens_prontos
     FROM pipeline_projetos pp
     LEFT JOIN clientes      c  ON c.id  = pp.cliente_id
     LEFT JOIN pipeline_itens pi ON pi.projeto_id = pp.id
     WHERE ${conds.join(" AND ")}
     GROUP BY pp.id, c.nome
     ORDER BY pp.updated_at DESC`,
    params
  );
  return res.rows;
}

// ─── 2. criarProjeto ──────────────────────────────────────────────────────────

async function criarProjeto(empresaId, userId, userName, dados) {
  const {
    titulo,
    cliente_id,
    pedido_id,
    orcamento_id,
    valor_estimado,
    prioridade = "normal",
    observacoes,
    itens = [],
  } = dados;

  if (!titulo?.trim()) throw new Error("Título é obrigatório.");

  // Número sequencial PROJ-XXXX
  const seqRes = await db.query(
    `SELECT COUNT(*) AS total FROM pipeline_projetos WHERE empresa_id = $1`,
    [empresaId]
  );
  const seq = parseInt(seqRes.rows[0].total, 10) + 1;
  const numero = `PROJ-${String(seq).padStart(4, "0")}`;

  // Detecta requer_confeccao
  let requer_confeccao = false;
  const produtoIds = itens
    .map((it) => it.produto_id)
    .filter((id) => id != null);

  if (produtoIds.length > 0) {
    const prodRes = await db.query(
      `SELECT id FROM produtos
       WHERE id = ANY($1::int[])
         AND empresa_id = $2
         AND eh_confeccao = TRUE
         AND deleted_at IS NULL`,
      [produtoIds, empresaId]
    );
    requer_confeccao = prodRes.rows.length > 0;
  }

  await db.query("BEGIN");
  try {
    const projRes = await db.query(
      `INSERT INTO pipeline_projetos
         (empresa_id, numero, titulo, cliente_id, orcamento_id, pedido_id,
          etapa, requer_confeccao, valor_estimado, prioridade, observacoes,
          criado_por, criado_por_nome, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'orcamento',$7,$8,$9,$10,$11,$12,NOW(),NOW())
       RETURNING *`,
      [
        empresaId,
        numero,
        titulo.trim(),
        cliente_id || null,
        orcamento_id || null,
        pedido_id || null,
        requer_confeccao,
        valor_estimado || null,
        prioridade,
        observacoes || null,
        userId,
        userName,
      ]
    );
    const projeto = projRes.rows[0];

    // Insere itens
    const itensCriados = [];
    for (const item of itens) {
      const itemRes = await db.query(
        `INSERT INTO pipeline_itens
           (projeto_id, produto_id, descricao, ambiente, quantidade, valor_unit,
            tipo_disponibilidade, requer_confeccao, fornecedor_id, prazo_previsto,
            status_item, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',NOW())
         RETURNING *`,
        [
          projeto.id,
          item.produto_id || null,
          item.descricao || null,
          item.ambiente || null,
          item.quantidade || 1,
          item.valor_unit || 0,
          item.tipo_disponibilidade || "estoque",
          item.produto_id ? requer_confeccao : false,
          item.fornecedor_id || null,
          item.prazo_previsto || null,
        ]
      );
      itensCriados.push(itemRes.rows[0]);
    }

    // Histórico
    await db.query(
      `INSERT INTO pipeline_historico
         (projeto_id, tipo, etapa_anterior, etapa_nova, observacao, usuario_id, usuario_nome, criado_em)
       VALUES ($1,'avanco',NULL,'orcamento','Projeto criado',$2,$3,NOW())`,
      [projeto.id, userId, userName]
    );

    await db.query("COMMIT");
    return { ...projeto, itens: itensCriados };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

// ─── 3. obterDetalhe ──────────────────────────────────────────────────────────

async function obterDetalhe(id, empresaId) {
  const projRes = await db.query(
    `SELECT pp.*, c.nome AS nome_cliente
     FROM pipeline_projetos pp
     LEFT JOIN clientes c ON c.id = pp.cliente_id
     WHERE pp.id = $1 AND pp.empresa_id = $2 AND pp.deleted_at IS NULL`,
    [id, empresaId]
  );
  if (projRes.rows.length === 0) return null;
  const projeto = projRes.rows[0];

  const itensRes = await db.query(
    `SELECT pi.*
     FROM pipeline_itens pi
     WHERE pi.projeto_id = $1
     ORDER BY pi.created_at ASC`,
    [id]
  );

  const histRes = await db.query(
    `SELECT * FROM pipeline_historico
     WHERE projeto_id = $1
     ORDER BY criado_em DESC`,
    [id]
  );

  return {
    ...projeto,
    itens: itensRes.rows,
    historico: histRes.rows,
  };
}

// ─── 4. avancarEtapa ──────────────────────────────────────────────────────────

async function avancarEtapa(id, empresaId, userId, userName, novaEtapa, observacao) {
  const projRes = await db.query(
    `SELECT * FROM pipeline_projetos
     WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [id, empresaId]
  );
  if (projRes.rows.length === 0) throw new Error("Projeto não encontrado.");
  const projeto = projRes.rows[0];

  const idxAtual = ETAPAS.indexOf(projeto.etapa);
  const idxNova = ETAPAS.indexOf(novaEtapa);

  if (idxNova === -1) throw new Error("Etapa inválida.");

  // Determina próxima etapa esperada (pulando confeccao se não requer)
  let proximaEsperada = idxAtual + 1;
  if (!projeto.requer_confeccao && ETAPAS[proximaEsperada] === "confeccao") {
    proximaEsperada += 1;
  }

  if (idxNova !== proximaEsperada) {
    throw new Error(
      `Avanço inválido: etapa esperada é '${ETAPAS[proximaEsperada]}', recebida '${novaEtapa}'.`
    );
  }

  // Calcula prazo_entrega se necessário
  let prazo_entrega_set = "";
  let extraParams = [];
  if (novaEtapa === "pre_agendado") {
    const config = await obterConfig(empresaId);
    prazo_entrega_set = ", prazo_entrega = NOW() + ($4 * INTERVAL '1 day')";
    extraParams = [config.prazo_agendamento_dias];
  }

  const updateRes = await db.query(
    `UPDATE pipeline_projetos
     SET etapa = $2, updated_at = NOW()${prazo_entrega_set}
     WHERE id = $1 AND empresa_id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [id, novaEtapa, empresaId, ...extraParams]
  );

  await db.query(
    `INSERT INTO pipeline_historico
       (projeto_id, tipo, etapa_anterior, etapa_nova, observacao, usuario_id, usuario_nome, criado_em)
     VALUES ($1,'avanco',$2,$3,$4,$5,$6,NOW())`,
    [id, projeto.etapa, novaEtapa, observacao || null, userId, userName]
  );

  return updateRes.rows[0];
}

// ─── 5. reencaminhar ─────────────────────────────────────────────────────────

async function reencaminhar(id, empresaId, userId, userName, etapaAlvo, motivo) {
  if (!motivo?.trim()) throw new Error("Motivo é obrigatório para reencaminhamento.");

  const projRes = await db.query(
    `SELECT * FROM pipeline_projetos
     WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [id, empresaId]
  );
  if (projRes.rows.length === 0) throw new Error("Projeto não encontrado.");
  const projeto = projRes.rows[0];

  const idxAtual = ETAPAS.indexOf(projeto.etapa);
  const idxAlvo = ETAPAS.indexOf(etapaAlvo);

  if (idxAlvo === -1) throw new Error("Etapa alvo inválida.");
  if (idxAlvo >= idxAtual) throw new Error("Reencaminhamento só pode ir para etapa anterior.");

  const updateRes = await db.query(
    `UPDATE pipeline_projetos
     SET etapa = $2, updated_at = NOW()
     WHERE id = $1 AND empresa_id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [id, etapaAlvo, empresaId]
  );

  await db.query(
    `INSERT INTO pipeline_historico
       (projeto_id, tipo, etapa_anterior, etapa_nova, observacao, usuario_id, usuario_nome, criado_em)
     VALUES ($1,'reencaminhamento',$2,$3,$4,$5,$6,NOW())`,
    [id, projeto.etapa, etapaAlvo, motivo.trim(), userId, userName]
  );

  return updateRes.rows[0];
}

// ─── 6. marcarItemChegou ─────────────────────────────────────────────────────

async function marcarItemChegou(projetoId, itemId, empresaId, userId, quantidade, obs) {
  await db.query("BEGIN");
  try {
    // Valida projeto
    const projRes = await db.query(
      `SELECT * FROM pipeline_projetos
       WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
      [projetoId, empresaId]
    );
    if (projRes.rows.length === 0) throw new Error("Projeto não encontrado.");
    const projeto = projRes.rows[0];

    // Busca item
    const itemRes = await db.query(
      `SELECT * FROM pipeline_itens WHERE id = $1 AND projeto_id = $2`,
      [itemId, projetoId]
    );
    if (itemRes.rows.length === 0) throw new Error("Item não encontrado.");
    const item = itemRes.rows[0];

    const novoStatus = item.requer_confeccao ? "em_confeccao" : "chegou_loja";

    // Atualiza item
    await db.query(
      `UPDATE pipeline_itens
       SET status_item = $1, chegada_real = NOW(), marcado_por = $2
       WHERE id = $3`,
      [novoStatus, userId, itemId]
    );

    // Cria entrada de estoque
    await db.query(
      `INSERT INTO pipeline_estoque_entradas
         (empresa_id, projeto_id, item_id, produto_id, descricao, quantidade,
          registrado_por, registrado_em, observacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8)`,
      [
        empresaId,
        projetoId,
        itemId,
        item.produto_id || null,
        item.descricao || null,
        quantidade || item.quantidade || 1,
        userId,
        obs || null,
      ]
    );

    // Incrementa estoque do produto se existir
    if (item.produto_id) {
      await db.query(
        `UPDATE produtos
         SET estoque = estoque + $1, updated_at = NOW()
         WHERE id = $2 AND empresa_id = $3`,
        [quantidade || item.quantidade || 1, item.produto_id, empresaId]
      );
    }

    // Histórico
    await db.query(
      `INSERT INTO pipeline_historico
         (projeto_id, tipo, etapa_anterior, etapa_nova, observacao, usuario_id, usuario_nome, criado_em)
       VALUES ($1,'item_chegou',$2,$2,$3,$4,'sistema',NOW())`,
      [projetoId, projeto.etapa, `Item chegou: ${item.descricao || item.id}`, userId]
    );

    // Verifica se todos os itens sob demanda/fornecedor estão prontos
    const itensRes = await db.query(
      `SELECT status_item, tipo_disponibilidade
       FROM pipeline_itens
       WHERE projeto_id = $1`,
      [projetoId]
    );

    const itensDemanda = itensRes.rows.filter((it) =>
      ["sob_demanda_fornecedor", "sob_demanda_material"].includes(it.tipo_disponibilidade)
    );

    const todosProntos =
      itensDemanda.length > 0 &&
      itensDemanda.every((it) =>
        ["chegou_loja", "em_confeccao", "confeccionado", "pronto"].includes(it.status_item)
      );

    if (todosProntos && projeto.etapa === "compras") {
      const proximaEtapa = projeto.requer_confeccao ? "confeccao" : "pre_agendado";

      let prazo_entrega_set = "";
      let extraParams = [];
      if (proximaEtapa === "pre_agendado") {
        const config = await obterConfig(empresaId);
        prazo_entrega_set = ", prazo_entrega = NOW() + ($2 * INTERVAL '1 day')";
        extraParams = [config.prazo_agendamento_dias];
      }

      await db.query(
        `UPDATE pipeline_projetos
         SET etapa = '${proximaEtapa}', updated_at = NOW()${prazo_entrega_set}
         WHERE id = $1`,
        [projetoId, ...extraParams]
      );

      await db.query(
        `INSERT INTO pipeline_historico
           (projeto_id, tipo, etapa_anterior, etapa_nova, observacao, usuario_id, usuario_nome, criado_em)
         VALUES ($1,'avanco','compras',$2,'Avanço automático: todos os itens chegaram','sistema','sistema',NOW())`,
        [projetoId, proximaEtapa]
      );
    }

    await db.query("COMMIT");

    // Retorna projeto atualizado
    const projAtualRes = await db.query(
      `SELECT * FROM pipeline_projetos WHERE id = $1`,
      [projetoId]
    );
    return projAtualRes.rows[0];
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

// ─── 7. marcarItemConfeccionado ───────────────────────────────────────────────

async function marcarItemConfeccionado(projetoId, itemId, empresaId, userId) {
  // Valida projeto
  const projRes = await db.query(
    `SELECT * FROM pipeline_projetos
     WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [projetoId, empresaId]
  );
  if (projRes.rows.length === 0) throw new Error("Projeto não encontrado.");
  const projeto = projRes.rows[0];

  // Valida item
  const itemRes = await db.query(
    `SELECT * FROM pipeline_itens WHERE id = $1 AND projeto_id = $2`,
    [itemId, projetoId]
  );
  if (itemRes.rows.length === 0) throw new Error("Item não encontrado.");
  const item = itemRes.rows[0];

  await db.query(
    `UPDATE pipeline_itens SET status_item = 'confeccionado' WHERE id = $1`,
    [itemId]
  );

  await db.query(
    `INSERT INTO pipeline_historico
       (projeto_id, tipo, etapa_anterior, etapa_nova, observacao, usuario_id, usuario_nome, criado_em)
     VALUES ($1,'item_confeccionado',$2,$2,$3,$4,'sistema',NOW())`,
    [projetoId, projeto.etapa, `Item confeccionado: ${item.descricao || item.id}`, userId]
  );

  return item;
}

// ─── 8. confirmarAgendamento ──────────────────────────────────────────────────

async function confirmarAgendamento(id, empresaId, userId, userName) {
  const projRes = await db.query(
    `SELECT * FROM pipeline_projetos
     WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [id, empresaId]
  );
  if (projRes.rows.length === 0) throw new Error("Projeto não encontrado.");
  const projeto = projRes.rows[0];

  const updateRes = await db.query(
    `UPDATE pipeline_projetos
     SET etapa = 'agendado', updated_at = NOW()
     WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [id, empresaId]
  );

  await db.query(
    `INSERT INTO pipeline_historico
       (projeto_id, tipo, etapa_anterior, etapa_nova, observacao, usuario_id, usuario_nome, criado_em)
     VALUES ($1,'agendamento_confirmado',$2,'agendado',NULL,$3,$4,NOW())`,
    [id, projeto.etapa, userId, userName]
  );

  return updateRes.rows[0];
}

// ─── 9. obterConfig ───────────────────────────────────────────────────────────

async function obterConfig(empresaId) {
  const res = await db.query(
    `SELECT * FROM pipeline_config WHERE empresa_id = $1`,
    [empresaId]
  );
  if (res.rows.length > 0) return res.rows[0];
  return {
    prazo_agendamento_dias: 7,
    prazo_confeccao_dias: 14,
    prazo_sob_demanda_dias: 21,
    alertar_dias_antes: 2,
  };
}

// ─── 10. salvarConfig ─────────────────────────────────────────────────────────

async function salvarConfig(empresaId, dados) {
  const {
    prazo_agendamento_dias,
    prazo_confeccao_dias,
    prazo_sob_demanda_dias,
    alertar_dias_antes,
  } = dados;

  const res = await db.query(
    `INSERT INTO pipeline_config
       (empresa_id, prazo_agendamento_dias, prazo_confeccao_dias,
        prazo_sob_demanda_dias, alertar_dias_antes, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (empresa_id) DO UPDATE
       SET prazo_agendamento_dias  = COALESCE($2, pipeline_config.prazo_agendamento_dias),
           prazo_confeccao_dias    = COALESCE($3, pipeline_config.prazo_confeccao_dias),
           prazo_sob_demanda_dias  = COALESCE($4, pipeline_config.prazo_sob_demanda_dias),
           alertar_dias_antes      = COALESCE($5, pipeline_config.alertar_dias_antes),
           updated_at              = NOW()
     RETURNING *`,
    [
      empresaId,
      prazo_agendamento_dias ?? null,
      prazo_confeccao_dias ?? null,
      prazo_sob_demanda_dias ?? null,
      alertar_dias_antes ?? null,
    ]
  );
  return res.rows[0];
}

// ─── 11. obterHistorico ───────────────────────────────────────────────────────

async function obterHistorico(projetoId, empresaId) {
  const projRes = await db.query(
    `SELECT id FROM pipeline_projetos
     WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [projetoId, empresaId]
  );
  if (projRes.rows.length === 0) throw new Error("Projeto não encontrado.");

  const res = await db.query(
    `SELECT * FROM pipeline_historico
     WHERE projeto_id = $1
     ORDER BY criado_em DESC`,
    [projetoId]
  );
  return res.rows;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  listarKanban,
  criarProjeto,
  obterDetalhe,
  avancarEtapa,
  reencaminhar,
  marcarItemChegou,
  marcarItemConfeccionado,
  confirmarAgendamento,
  obterConfig,
  salvarConfig,
  obterHistorico,
};
