const db = require("../database/db");
const cliSvc = require("./clienteService");
const arqSvc = require("./arquitetoService");
const auditSvc = require("./auditoriaService");
const vinculoAutoSvc = require("./vinculoAutomaticoService");
const regiaoGeoSvc = require("./regiaoGeoService");

const STATUS_VALIDOS = ["pendente", "em_andamento", "concluido", "cancelado"];

function fmtNumero(seq) {
  return `SIS-${String(seq).padStart(8, "0")}`;
}

// Normaliza "#00002304" -> "#2304", removendo zeros à esquerda do número de origem
function fmtNumeroOrigem(numeroOrigem) {
  if (!numeroOrigem) return null;
  const n = parseInt(String(numeroOrigem).replace(/^#+/, ""), 10);
  return Number.isNaN(n) ? numeroOrigem : `#${n}`;
}

function toDecimal(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const s = String(v).trim();
  // Com vírgula: formato BR ("1.234,56") — ponto é milhar, vírgula é decimal
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || null;
  // Sem vírgula: ponto é decimal ("1234.56" vindo de input type=number)
  return parseFloat(s) || null;
}

const LABELS_CAMPO_AUDITORIA = {
  cliente_id: "Cliente",
  cpf_cnpj: "CPF/CNPJ",
  email_cliente: "E-mail",
  status: "Status",
  data_pedido: "Data do Pedido",
  consultor_id: "Consultor",
  arquiteto_id: "Arquiteto",
  descricao: "Descrição",
  observacoes: "Observações",
  observacoes_entrega: "Observações de Entrega",
  cep: "CEP",
  rua: "Rua",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  subtotal: "Subtotal",
  desconto: "Desconto",
  total: "Total",
};

const LABELS_STATUS_PEDIDO = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function fmtMoedaBR(v) {
  const n = Number(v);
  if (v == null || isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDataBR(v) {
  if (!v) return "—";
  const s = String(v);
  const d = s.includes("T") ? new Date(s) : new Date(`${s}T12:00:00`);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("pt-BR");
}

// Formata o valor de um campo para exibição no histórico (datas, moeda e status em formato BR)
function fmtValorAuditoria(campo, v) {
  if (v == null || v === "") return "—";
  if (campo === "data_pedido") return fmtDataBR(v);
  if (["subtotal", "desconto", "total"].includes(campo)) return `R$ ${fmtMoedaBR(v)}`;
  if (campo === "status") return LABELS_STATUS_PEDIDO[v] || v;
  return String(v);
}

async function _verificarEtapa1(client, pedidoId) {
  const [pdfRes, itensRes] = await Promise.all([
    client.query(`SELECT 1 FROM pedido_anexos WHERE pedido_id=$1 LIMIT 1`, [pedidoId]),
    client.query(
      `SELECT pi.id, pi.categoria_id, pi.sem_vinculo, COALESCE(cat.vinculavel, false) AS vinculavel
       FROM pedido_itens pi
       LEFT JOIN categorias cat ON cat.id = pi.categoria_id
       WHERE pi.pedido_id=$1`,
      [pedidoId]
    ),
  ]);

  if (!pdfRes.rows.length) return false;

  const itens = itensRes.rows;
  if (!itens.length) return false;

  if (!itens.every(it => it.categoria_id != null)) return false;

  const itensVinculaveis = itens.filter(it => it.vinculavel);
  if (itensVinculaveis.length === 0) return true;

  const itemIds = itensVinculaveis.map(it => it.id);
  const { rows: vinculosRows } = await client.query(
    `SELECT DISTINCT item_id FROM pedido_item_vinculos WHERE item_id = ANY($1)`,
    [itemIds]
  );
  const comVinculo = new Set(vinculosRows.map(r => r.item_id));

  return itensVinculaveis.every(it => it.sem_vinculo || comVinculo.has(it.id));
}

async function montarPedido(id, empresaId) {
  const res = await db.query(
    `SELECT p.*,
            c.nome          AS cliente_nome,
            c.telefone      AS cliente_telefone,
            u.nome_completo AS consultor_nome,
            a.nome          AS arquiteto_nome,
            EXISTS(SELECT 1 FROM pedido_anexos pa WHERE pa.pedido_id = p.id) AS tem_anexo_pdf
     FROM pedidos p
     LEFT JOIN clientes c  ON c.id = p.cliente_id   AND c.deleted_at IS NULL
     LEFT JOIN usuarios u  ON u.id = p.consultor_id
     LEFT JOIN arquitetos a ON a.id = p.arquiteto_id AND a.deleted_at IS NULL
     WHERE p.id=$1 AND p.empresa_id=$2 AND p.deleted_at IS NULL
     LIMIT 1`,
    [id, empresaId]
  );
  if (res.rows.length === 0) return null;
  const p = res.rows[0];

  const itensRes = await db.query(
    `SELECT pi.*,
            os.id             AS os_id,
            os.status         AS os_status,
            os.dados_tecnicos AS dados_tecnicos,
            cat.nome  AS categoria_nome,
            cat.cor   AS categoria_cor
     FROM pedido_itens pi
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     LEFT JOIN categorias cat   ON cat.id = pi.categoria_id
     WHERE pi.pedido_id=$1 AND pi.item_pai_id IS NULL
     ORDER BY pi.ordem, pi.id`,
    [id]
  );

  const pagRes = await db.query(
    `SELECT * FROM pedido_pagamentos WHERE pedido_id=$1 ORDER BY forma, ordem, id`,
    [id]
  );

  const itemIds = itensRes.rows.map(r => r.id);
  const vinculosPorItem = {};
  if (itemIds.length > 0) {
    const vinculosRes = await db.query(
      `SELECT item_id, item_vinculado_id, tipo_vinculo
       FROM pedido_item_vinculos
       WHERE item_id = ANY($1)`,
      [itemIds]
    );
    for (const v of vinculosRes.rows) {
      if (!vinculosPorItem[v.item_id]) vinculosPorItem[v.item_id] = [];
      vinculosPorItem[v.item_id].push({
        item_vinculado_id: v.item_vinculado_id,
        tipo_vinculo: v.tipo_vinculo,
      });
    }
  }

  return {
    ...p,
    numero_rua: p.numero,
    numero: fmtNumeroOrigem(p.numero_origem) || fmtNumero(p.numero_sequencial || p.id),
    itens: itensRes.rows.map(it => ({
      ...it,
      vinculos: vinculosPorItem[it.id] || [],
    })),
    pagamentos: pagRes.rows,
  };
}

async function listar(empresaId, { q, status, cliente_id } = {}) {
  const params = [empresaId];
  const condicoes = [];

  if (q) {
    params.push(`%${q}%`);
    condicoes.push(
      `(c.nome ILIKE $${params.length} OR p.descricao ILIKE $${params.length} OR p.numero_origem ILIKE $${params.length})`
    );
  }
  if (status && STATUS_VALIDOS.includes(status)) {
    params.push(status);
    condicoes.push(`p.status=$${params.length}`);
  }
  if (cliente_id) {
    params.push(Number(cliente_id));
    condicoes.push(`p.cliente_id=$${params.length}`);
  }

  const where = condicoes.length > 0 ? ` AND ${condicoes.join(" AND ")}` : "";

  const res = await db.query(
    `SELECT p.*,
            c.nome          AS cliente_nome,
            c.telefone      AS cliente_telefone,
            u.nome_completo AS consultor_nome,
            a.nome          AS arquiteto_nome
     FROM pedidos p
     LEFT JOIN clientes c  ON c.id = p.cliente_id   AND c.deleted_at IS NULL
     LEFT JOIN usuarios u  ON u.id = p.consultor_id
     LEFT JOIN arquitetos a ON a.id = p.arquiteto_id AND a.deleted_at IS NULL
     WHERE p.empresa_id=$1 AND p.deleted_at IS NULL${where}
     ORDER BY p.created_at DESC`,
    params
  );

  return res.rows.map((p) => ({
    ...p,
    numero_rua: p.numero,
    numero: fmtNumeroOrigem(p.numero_origem) || fmtNumero(p.numero_sequencial || p.id),
  }));
}

async function buscar(id, empresaId) {
  return montarPedido(id, empresaId);
}

async function _salvarItens(client, pedidoId, itens = []) {
  const existingRes = await client.query(
    `SELECT id FROM pedido_itens WHERE pedido_id = $1 AND item_pai_id IS NULL`,
    [pedidoId]
  );
  const existingIds = existingRes.rows.map((r) => r.id);
  const incomingIds = itens.map((it) => Number(it.id)).filter((id) => Number.isFinite(id) && id > 0);

  const idsParaDeletar = existingIds.filter((id) => !incomingIds.includes(id));
  if (idsParaDeletar.length > 0) {
    await client.query(`DELETE FROM ordem_servico WHERE pedido_item_id = ANY($1)`, [idsParaDeletar]);
    await client.query(`DELETE FROM pedido_itens WHERE id = ANY($1)`, [idsParaDeletar]);
  }

  for (let i = 0; i < itens.length; i++) {
    const it     = itens[i];
    const itemId = Number(it.id);

    if (Number.isFinite(itemId) && itemId > 0 && existingIds.includes(itemId)) {
      // UPDATE item existente
      await client.query(
        `UPDATE pedido_itens
         SET ambiente=$1, referencia=$2, cor=$3, descricao=$4, medidas=$5,
             quantidade=$6, unidade=$7, preco_unitario=$8, valor=$9, ordem=$10,
             modelo=$11, especificacoes=$12, largura=$13, altura=$14,
             categoria_id=$15, sem_vinculo=$16
         WHERE id=$17 AND pedido_id=$18`,
        [
          it.ambiente?.trim()    || null,
          it.referencia?.trim()  || null,
          it.cor?.trim()         || null,
          it.descricao?.trim()   || "",
          it.medidas?.trim()     || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim()     || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          it.modelo?.trim()      || null,
          (typeof it.especificacoes === 'object' && it.especificacoes !== null ? it.especificacoes : null),
          toDecimal(it.largura),
          toDecimal(it.altura),
          it.categoria_id        ?? null,
          it.sem_vinculo         ?? false,
          itemId,
          pedidoId,
        ]
      );
    } else {
      // INSERT novo item
      const ins = await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, ambiente, referencia, cor, descricao, medidas,
            quantidade, unidade, preco_unitario, valor, ordem,
            modelo, especificacoes, largura, altura, categoria_id, sem_vinculo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          pedidoId,
          it.ambiente?.trim()    || null,
          it.referencia?.trim()  || null,
          it.cor?.trim()         || null,
          it.descricao?.trim()   || "",
          it.medidas?.trim()     || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim()     || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          it.modelo?.trim()      || null,
          (typeof it.especificacoes === 'object' && it.especificacoes !== null ? it.especificacoes : null),
          toDecimal(it.largura),
          toDecimal(it.altura),
          it.categoria_id        ?? null,
          it.sem_vinculo         ?? false,
        ]
      );
    }
  }
}

async function _salvarPagamentos(client, pedidoId, pagamentos = []) {
  await client.query(`DELETE FROM pedido_pagamentos WHERE pedido_id=$1`, [pedidoId]);
  for (let i = 0; i < pagamentos.length; i++) {
    const pg = pagamentos[i];
    await client.query(
      `INSERT INTO pedido_pagamentos (pedido_id, forma, parcela, vencimento, valor, ordem)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        pedidoId,
        pg.forma?.trim() || "",
        pg.parcela?.trim() || null,
        pg.vencimento || null,
        toDecimal(pg.valor),
        i,
      ]
    );
  }
}

async function criar(empresaId, userId, dados) {
  const {
    cliente_id, cpf_cnpj, email_cliente, status = "pendente", data_pedido,
    consultor_id, arquiteto_id, descricao, observacoes, observacoes_entrega,
    cep, rua, numero, complemento, bairro, cidade, estado,
    subtotal, desconto, total, numero_origem,
    itens = [], pagamentos = [],
  } = dados;

  if (!STATUS_VALIDOS.includes(status)) {
    const e = new Error("Status inválido."); e.status = 400; throw e;
  }
  if (cliente_id) {
    const cli = await db.query(
      `SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [cliente_id, empresaId]
    );
    if (cli.rows.length === 0) {
      const e = new Error("Cliente não encontrado."); e.status = 404; throw e;
    }
  }

  const partes = [rua, numero, complemento, bairro, cidade, estado ? `- ${estado}` : ""].filter(Boolean);
  const endereco = partes.length ? partes.join(", ") + (cep ? ` — CEP ${cep}` : "") : null;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const seqRes = await client.query(`SELECT nextval('pedidos_numero_seq') AS seq`);
    const seq = parseInt(seqRes.rows[0].seq, 10);

    const ins = await client.query(
      `INSERT INTO pedidos
         (empresa_id, cliente_id, cpf_cnpj, email_cliente, status, data_pedido,
          consultor_id, arquiteto_id, descricao, observacoes, observacoes_entrega, criado_por,
          cep, rua, numero, complemento, bairro, cidade, estado, endereco,
          subtotal, desconto, total, numero_origem, numero_sequencial)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING id`,
      [
        empresaId, cliente_id || null, cpf_cnpj?.trim() || null, email_cliente?.trim() || null,
        status, data_pedido || null,
        consultor_id || userId, arquiteto_id || null, descricao?.trim() || null, observacoes?.trim() || null,
        observacoes_entrega?.trim() || null, userId,
        cep || null, rua || null, numero || null, complemento || null,
        bairro || null, cidade || null, estado || null, endereco,
        toDecimal(subtotal), toDecimal(desconto) ?? 0,
        toDecimal(total), numero_origem?.trim() || null, seq,
      ]
    );

    const pedidoId = ins.rows[0].id;
    await _salvarItens(client, pedidoId, itens);
    await _salvarPagamentos(client, pedidoId, pagamentos);

    await client.query("COMMIT");
    regiaoGeoSvc.registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado }).catch(() => {});
    return montarPedido(pedidoId, empresaId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function atualizar(id, empresaId, dados, userId) {
  const {
    cliente_id, cpf_cnpj, email_cliente, status, data_pedido,
    consultor_id, arquiteto_id, descricao, observacoes, observacoes_entrega,
    cep, rua, numero, complemento, bairro, cidade, estado,
    subtotal, desconto, total,
    itens = [], pagamentos = [],
  } = dados;

  if (status && !STATUS_VALIDOS.includes(status)) {
    const e = new Error("Status inválido."); e.status = 400; throw e;
  }
  if (cliente_id) {
    const cli = await db.query(
      `SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
      [cliente_id, empresaId]
    );
    if (cli.rows.length === 0) {
      const e = new Error("Cliente não encontrado."); e.status = 404; throw e;
    }
  }

  const partes = [rua, numero, complemento, bairro, cidade, estado ? `- ${estado}` : ""].filter(Boolean);
  const endereco = partes.length ? partes.join(", ") + (cep ? ` — CEP ${cep}` : "") : null;

  // Captura estado atual para diff de auditoria
  const pedidoAntes = await montarPedido(id, empresaId);
  if (!pedidoAntes) {
    const e = new Error("Pedido não encontrado."); e.status = 404; throw e;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const upd = await client.query(
      `UPDATE pedidos SET
         cliente_id=$1, cpf_cnpj=$2, email_cliente=$3, status=$4, data_pedido=$5,
         consultor_id=$6, arquiteto_id=$7, descricao=$8, observacoes=$9, observacoes_entrega=$10,
         cep=$11, rua=$12, numero=$13, complemento=$14, bairro=$15,
         cidade=$16, estado=$17, endereco=$18,
         subtotal=$19, desconto=$20, total=$21, updated_at=NOW()
       WHERE id=$22 AND empresa_id=$23 AND deleted_at IS NULL
       RETURNING id`,
      [
        cliente_id || null, cpf_cnpj?.trim() || null, email_cliente?.trim() || null,
        status || pedidoAntes.status, data_pedido || null,
        consultor_id || null, arquiteto_id || null, descricao?.trim() || null, observacoes?.trim() || null,
        observacoes_entrega?.trim() || null,
        cep || null, rua || null, numero || null, complemento || null,
        bairro || null, cidade || null, estado || null, endereco,
        toDecimal(subtotal), toDecimal(desconto) ?? 0, toDecimal(total),
        id, empresaId,
      ]
    );

    if (upd.rows.length === 0) {
      const e = new Error("Pedido não encontrado."); e.status = 404; throw e;
    }

    await _salvarItens(client, id, itens);
    await _salvarPagamentos(client, id, pagamentos);

    // Verifica se etapa 1 foi concluída agora e seta verificacao_ok
    const etapa1Ok = await _verificarEtapa1(client, id);
    const etapa1FoiConcluida = etapa1Ok && !pedidoAntes.verificacao_ok;
    if (etapa1FoiConcluida) {
      await client.query(
        `UPDATE pedidos SET verificacao_ok=true WHERE id=$1 AND empresa_id=$2`,
        [id, empresaId]
      );
    }

    // Diff campo a campo para auditoria
    const camposAuditados = [
      "cliente_id","cpf_cnpj","email_cliente","status","data_pedido",
      "consultor_id","arquiteto_id","descricao","observacoes","observacoes_entrega",
      "cep","rua","bairro","cidade","estado","subtotal","desconto","total",
    ];
    const dadosDepoisAudit = {
      cliente_id, cpf_cnpj, email_cliente, status, data_pedido,
      consultor_id, arquiteto_id, descricao, observacoes, observacoes_entrega,
      cep, rua, bairro, cidade, estado, subtotal, desconto, total,
    };
    const diff = {};
    for (const campo of camposAuditados) {
      if (String(pedidoAntes[campo] ?? "") !== String(dadosDepoisAudit[campo] ?? "")) {
        diff[campo] = { antes: pedidoAntes[campo], depois: dadosDepoisAudit[campo] };
      }
    }
    const partesDiff = Object.entries(diff)
      .map(([k, { antes, depois }]) =>
        `${LABELS_CAMPO_AUDITORIA[k] || k}: "${fmtValorAuditoria(k, antes)}" → "${fmtValorAuditoria(k, depois)}"`
      );

    // Diff de itens (quantidade e valor total)
    const itensAntes   = pedidoAntes.itens || [];
    const totalItensAntes = itensAntes.reduce((s, it) => s + (Number(it.valor) || 0), 0);
    const totalItensDepois = itens.reduce((s, it) => s + (Number(toDecimal(it.valor)) || 0), 0);
    if (itensAntes.length !== itens.length || totalItensAntes.toFixed(2) !== totalItensDepois.toFixed(2)) {
      partesDiff.push(
        `Itens: "${itensAntes.length} item(ns) — R$ ${fmtMoedaBR(totalItensAntes)}" → "${itens.length} item(ns) — R$ ${fmtMoedaBR(totalItensDepois)}"`
      );
    }

    // Diff de pagamentos (quantidade e valor total)
    const pagamentosAntes = pedidoAntes.pagamentos || [];
    const totalPagAntes = pagamentosAntes.reduce((s, pg) => s + (Number(pg.valor) || 0), 0);
    const totalPagDepois = pagamentos.reduce((s, pg) => s + (Number(toDecimal(pg.valor)) || 0), 0);
    if (pagamentosAntes.length !== pagamentos.length || totalPagAntes.toFixed(2) !== totalPagDepois.toFixed(2)) {
      partesDiff.push(
        `Pagamentos: "${pagamentosAntes.length} item(ns) — R$ ${fmtMoedaBR(totalPagAntes)}" → "${pagamentos.length} item(ns) — R$ ${fmtMoedaBR(totalPagDepois)}"`
      );
    }

    const descDiff = partesDiff.join(", ");

    await auditSvc.registrarAuditoria(client, {
      pedidoId: id,
      empresaId,
      usuarioId: userId || null,
      etapa: "dados_pedido",
      acao: "edicao",
      descricao: descDiff || "Pedido editado",
      dadosAntes: { ...pedidoAntes },
      dadosDepois: dadosDepoisAudit,
    });

    if (etapa1FoiConcluida) {
      await auditSvc.registrarAuditoria(client, {
        pedidoId: id,
        empresaId,
        usuarioId: userId || null,
        etapa: "dados_pedido",
        acao: "verificacao_ok",
        descricao: "Verificação concluída — etapa 1 completa (PDF + categorias + vínculos)",
      });
    }

    await client.query("COMMIT");
    regiaoGeoSvc.registrarRegiaoSeNecessaria({ empresaId, bairro, cidade, estado }).catch(() => {});
    return montarPedido(id, empresaId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function excluir(id, empresaId) {
  const res = await db.query(
    `UPDATE pedidos SET deleted_at=NOW() WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL RETURNING id`,
    [id, empresaId]
  );
  if (res.rows.length === 0) {
    const e = new Error("Pedido não encontrado."); e.status = 404; throw e;
  }
}

async function importar(empresaId, userId, dados) {
  let clienteId = dados.cliente_id || null;

  if (!clienteId && dados.nome_cliente?.trim()) {
    const { id } = await cliSvc.resolverCliente(empresaId, dados.nome_cliente, {
      telefone: dados.telefone_cliente,
      email:    dados.email_cliente,
      cpf:      dados.cpf,
      cnpj:     dados.cnpj,
      criadoPorId: userId,
    });
    clienteId = id;
  }

  // Salva endereço no cliente sempre que há dados — evita duplicata pelo CEP
  if (clienteId && (dados.cep || dados.rua)) {
    try {
      let jaTemEndereco = false;
      if (dados.cep) {
        const endExiste = await db.query(
          `SELECT id FROM cliente_enderecos WHERE cliente_id=$1 AND cep=$2 AND deleted_at IS NULL LIMIT 1`,
          [clienteId, dados.cep]
        );
        jaTemEndereco = endExiste.rows.length > 0;
      }
      if (!jaTemEndereco) {
        await cliSvc.adicionarEndereco(clienteId, empresaId, {
          label:       "Entrega",
          categoria:   "residencial",
          cep:         dados.cep         || null,
          rua:         dados.rua         || null,
          numero:      dados.numero      || null,
          complemento: dados.complemento || null,
          bairro:      dados.bairro      || null,
          cidade:      dados.cidade      || null,
          estado:      dados.estado      || null,
          is_padrao:   true,
        });
      } else {
        // Endereço com mesmo CEP já existe — atualiza detalhes (sem apagar dados existentes)
        await db.query(
          `UPDATE cliente_enderecos
           SET rua         = COALESCE($1, rua),
               numero      = COALESCE($2, numero),
               complemento = COALESCE($3, complemento),
               bairro      = COALESCE($4, bairro),
               cidade      = COALESCE($5, cidade),
               estado      = COALESCE($6, estado),
               updated_at  = NOW()
           WHERE cliente_id=$7 AND cep=$8 AND deleted_at IS NULL`,
          [
            dados.rua    || null, dados.numero || null, dados.complemento || null,
            dados.bairro || null, dados.cidade || null, dados.estado      || null,
            clienteId, dados.cep,
          ]
        );
      }
    } catch (_) {}
  }

  // Resolve arquiteto: usa o id já conhecido, busca por nome/escritorio ou cria se não existir
  let arquitetoId = dados.arquiteto_id ? Number(dados.arquiteto_id) : null;
  if (!arquitetoId && dados.arquiteto_nome?.trim()) {
    const porNome = await db.query(
      `SELECT id FROM arquitetos WHERE empresa_id=$1 AND nome ILIKE $2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, `%${dados.arquiteto_nome.trim()}%`]
    );
    if (porNome.rows.length > 0) {
      arquitetoId = porNome.rows[0].id;
    } else {
      const porEscritorio = await db.query(
        `SELECT a.id FROM arquitetos a
         JOIN escritorios e ON e.id = a.escritorio_id
         WHERE a.empresa_id=$1 AND a.deleted_at IS NULL AND e.nome ILIKE $2
         LIMIT 1`,
        [empresaId, `%${dados.arquiteto_nome.trim()}%`]
      );
      if (porEscritorio.rows.length > 0) {
        arquitetoId = porEscritorio.rows[0].id;
      } else {
        const novoArq = await arqSvc.criar(empresaId, { nome: dados.arquiteto_nome.trim(), consultor_id: userId });
        arquitetoId = novoArq.id;
      }
    }
  }

  const dadosCompletos = { ...dados, cliente_id: clienteId, arquiteto_id: arquitetoId };

  // Se já existe um pedido com este numero_origem, substitui
  if (dados.numero_origem?.trim()) {
    const existe = await db.query(
      `SELECT id FROM pedidos WHERE empresa_id=$1 AND numero_origem=$2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, dados.numero_origem.trim()]
    );
    if (existe.rows.length > 0) {
      const pedidoAtualizado = await atualizar(existe.rows[0].id, empresaId, dadosCompletos, userId);
      await db.query(
        `INSERT INTO pedido_auditoria
           (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
         VALUES ($1,$2,$3,'dados_pedido','importacao','Pedido reimportado (substituição)')`,
        [existe.rows[0].id, empresaId, userId || null]
      );
      await _processarVinculoAutomatico(existe.rows[0].id, empresaId, userId);
      return pedidoAtualizado;
    }
  }

  const pedidoCriado = await criar(empresaId, userId, dadosCompletos);
  await db.query(
    `INSERT INTO pedido_auditoria
       (pedido_id, empresa_id, usuario_id, etapa, acao, descricao)
     VALUES ($1,$2,$3,'dados_pedido','importacao','Pedido importado')`,
    [pedidoCriado.id, empresaId, userId || null]
  );
  await _processarVinculoAutomatico(pedidoCriado.id, empresaId, userId);
  return pedidoCriado;
}

// Vínculo automático é um refinamento pós-importação: erros aqui são
// logados, mas não devem fazer a importação (já salva com sucesso) falhar.
async function _processarVinculoAutomatico(pedidoId, empresaId, userId) {
  try {
    await vinculoAutoSvc.processarPedido(pedidoId, empresaId, userId);
  } catch (err) {
    console.error("[vinculoAutomatico]", err);
  }
}

async function atualizarEtapa(pedidoId, empresaId, userId, permissoes, campo, valor) {
  const CAMPOS_VALIDOS = ["verificacao_ok", "categorizacao_ok"];
  if (!CAMPOS_VALIDOS.includes(campo)) {
    const err = new Error("Campo inválido");
    err.status = 400;
    throw err;
  }

  const { rows } = await db.query(
    `SELECT consultor_id FROM pedidos WHERE id = $1 AND empresa_id = $2`,
    [pedidoId, empresaId]
  );
  if (!rows.length) {
    const err = new Error("Pedido não encontrado");
    err.status = 404;
    throw err;
  }

  const temPermGeral = (permissoes || []).includes("DASHBOARD_PEDIDOS_GERAL");
  if (!temPermGeral && String(rows[0].consultor_id) !== String(userId)) {
    const err = new Error("Acesso negado");
    err.status = 403;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE pedidos SET ${campo} = $1 WHERE id = $2 AND empresa_id = $3`,
      [valor, pedidoId, empresaId]
    );
    await auditSvc.registrarAuditoria(client, {
      pedidoId, empresaId, usuarioId: userId,
      etapa: "dados_pedido",
      acao: campo,
      descricao: `${campo} marcado como ${valor}`,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { [campo]: valor };
}

module.exports = { listar, buscar, criar, atualizar, excluir, importar, atualizarEtapa, fmtNumeroOrigem, _verificarEtapa1 };
