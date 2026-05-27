const db = require("../database/db");
const cliSvc = require("./clienteService");
const arqSvc = require("./arquitetoService");

const STATUS_VALIDOS = ["pendente", "em_andamento", "concluido", "cancelado"];

function fmtNumero(seq) {
  return `SIS-${String(seq).padStart(8, "0")}`;
}

function toDecimal(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  // String em formato brasileiro: "1.309,18" → 1309.18
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || null;
}

async function montarPedido(id, empresaId) {
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
     WHERE p.id=$1 AND p.empresa_id=$2 AND p.deleted_at IS NULL
     LIMIT 1`,
    [id, empresaId]
  );
  if (res.rows.length === 0) return null;
  const p = res.rows[0];

  const itensRes = await db.query(
    `SELECT pi.*, os.id AS os_id, os.status AS os_status
     FROM pedido_itens pi
     LEFT JOIN ordem_servico os ON os.pedido_item_id = pi.id
     WHERE pi.pedido_id=$1
     ORDER BY pi.ordem, pi.id`,
    [id]
  );

  const pagRes = await db.query(
    `SELECT * FROM pedido_pagamentos WHERE pedido_id=$1 ORDER BY forma, ordem, id`,
    [id]
  );

  return {
    ...p,
    numero_rua: p.numero,
    numero: p.numero_origem || fmtNumero(p.numero_sequencial || p.id),
    itens: itensRes.rows,
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
    numero: p.numero_origem || fmtNumero(p.numero_sequencial || p.id),
  }));
}

async function buscar(id, empresaId) {
  return montarPedido(id, empresaId);
}

async function _salvarItens(client, pedidoId, itens = []) {
  // 1. Obtém todos os itens existentes no banco de dados para este pedido
  const existingRes = await client.query(`SELECT id FROM pedido_itens WHERE pedido_id = $1`, [pedidoId]);
  const existingIds = existingRes.rows.map(r => r.id);

  const incomingIds = itens.map(it => Number(it.id)).filter(id => Number.isFinite(id) && id > 0);

  // 2. Determina quais itens devem ser excluídos
  const idsParaDeletar = existingIds.filter(id => !incomingIds.includes(id));
  if (idsParaDeletar.length > 0) {
    // Remove as ordens de serviço associadas antes de excluir os itens
    await client.query(`DELETE FROM ordem_servico WHERE pedido_item_id = ANY($1)`, [idsParaDeletar]);
    await client.query(`DELETE FROM pedido_itens WHERE id = ANY($1)`, [idsParaDeletar]);
  }

  // 3. Atualiza os itens existentes ou insere os novos
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    const itemId = Number(it.id);

    if (Number.isFinite(itemId) && itemId > 0 && existingIds.includes(itemId)) {
      // UPDATE item existente
      await client.query(
        `UPDATE pedido_itens
         SET ambiente = $1, referencia = $2, cor = $3, descricao = $4, medidas = $5,
             quantidade = $6, unidade = $7, preco_unitario = $8, valor = $9, ordem = $10
         WHERE id = $11 AND pedido_id = $12`,
        [
          it.ambiente?.trim() || null,
          it.referencia?.trim() || null,
          it.cor?.trim() || null,
          it.descricao?.trim() || "",
          it.medidas?.trim() || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim() || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
          itemId,
          pedidoId
        ]
      );
    } else {
      // INSERT novo item
      await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, ambiente, referencia, cor, descricao, medidas,
            quantidade, unidade, preco_unitario, valor, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          pedidoId,
          it.ambiente?.trim() || null,
          it.referencia?.trim() || null,
          it.cor?.trim() || null,
          it.descricao?.trim() || "",
          it.medidas?.trim() || null,
          parseFloat(it.quantidade) || 1,
          it.unidade?.trim() || null,
          toDecimal(it.preco_unitario),
          toDecimal(it.valor),
          i,
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
        consultor_id || null, arquiteto_id || null, descricao?.trim() || null, observacoes?.trim() || null,
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
    return montarPedido(pedidoId, empresaId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function atualizar(id, empresaId, dados) {
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
        status, data_pedido || null,
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

    await client.query("COMMIT");
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

  // Resolve arquiteto: usa o id já conhecido, busca por nome ou cria se não existir
  let arquitetoId = dados.arquiteto_id ? Number(dados.arquiteto_id) : null;
  if (!arquitetoId && dados.arquiteto_nome?.trim()) {
    const r = await db.query(
      `SELECT id FROM arquitetos WHERE empresa_id=$1 AND nome ILIKE $2 AND deleted_at IS NULL LIMIT 1`,
      [empresaId, `%${dados.arquiteto_nome.trim()}%`]
    );
    if (r.rows.length > 0) {
      arquitetoId = r.rows[0].id;
    } else {
      const novoArq = await arqSvc.criar(empresaId, { nome: dados.arquiteto_nome.trim() });
      arquitetoId = novoArq.id;
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
      return atualizar(existe.rows[0].id, empresaId, dadosCompletos);
    }
  }

  return criar(empresaId, userId, dadosCompletos);
}

module.exports = { listar, buscar, criar, atualizar, excluir, importar };
