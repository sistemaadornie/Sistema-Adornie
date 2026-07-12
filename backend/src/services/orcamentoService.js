const db = require("../database/db");

function fmtNumero(seq) {
  return `ORC-${String(seq).padStart(5, "0")}`;
}

function calcularTotal(itens = []) {
  return itens.reduce((sum, it) => {
    const qtd = parseFloat(it.quantidade) || 0;
    const preco = parseFloat(String(it.preco_unitario || "0").replace(",", ".")) || 0;
    return sum + qtd * preco;
  }, 0);
}

async function listar(empresaId, { status, q, consultora_id } = {}) {
  const params = [empresaId];
  const conds = ["o.empresa_id = $1", "o.deleted_at IS NULL"];

  if (status) {
    params.push(status);
    conds.push(`o.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conds.push(`(c.nome ILIKE $${params.length} OR o.numero ILIKE $${params.length})`);
  }
  if (consultora_id) {
    params.push(consultora_id);
    conds.push(`o.consultora_id = $${params.length}`);
  }

  const res = await db.query(
    `SELECT o.id, o.numero, o.status, o.valor_total, o.created_at,
            o.taxar_nf, o.de_onde_veio,
            c.nome    AS cliente_nome,
            u.nome_completo AS consultora_nome,
            a.nome    AS arquiteto_nome
     FROM orcamentos o
     LEFT JOIN clientes   c ON c.id = o.cliente_id    AND c.deleted_at IS NULL
     LEFT JOIN usuarios   u ON u.id = o.consultora_id
     LEFT JOIN arquitetos a ON a.id = o.arquiteto_id  AND a.deleted_at IS NULL
     WHERE ${conds.join(" AND ")}
     ORDER BY o.created_at DESC`,
    params
  );
  return res.rows;
}

async function criar(empresaId, userId, dados) {
  const {
    cliente_id, arquiteto_id, vendedor_id, gerente_id, clube,
    observacoes, endereco_entrega, itens = [],
    taxar_nf, de_onde_veio, faturamento_diferente,
    pagamentos = []
  } = dados;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const seqRes = await client.query("SELECT nextval('orcamentos_numero_seq') AS seq");
    const numero = fmtNumero(seqRes.rows[0].seq);
    const valor_total = calcularTotal(itens);

    // Endereço de entrega (decomposto)
    const end = endereco_entrega || {};

    const oRes = await client.query(
      `INSERT INTO orcamentos
         (empresa_id, cliente_id, consultora_id, arquiteto_id, vendedor_id, gerente_id,
          clube, numero, status, observacoes, valor_total, endereco_entrega, criado_por,
          taxar_nf, de_onde_veio, faturamento_diferente,
          entrega_cep, entrega_rua, entrega_numero, entrega_complemento,
          entrega_bairro, entrega_cidade, entrega_estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'novo',$9,$10,$11,$3,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        empresaId,
        cliente_id || null,
        userId,
        arquiteto_id || null,
        vendedor_id || null,
        gerente_id || null,
        clube || null,
        numero,
        observacoes || null,
        valor_total,
        endereco_entrega ? JSON.stringify(endereco_entrega) : null,
        taxar_nf || false,
        de_onde_veio || null,
        faturamento_diferente || false,
        end.cep || null,
        end.rua || null,
        end.numero || null,
        end.complemento || null,
        end.bairro || null,
        end.cidade || null,
        end.estado || null,
      ]
    );
    const orcamento = oRes.rows[0];

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      let produtoId = it.produto_id || null;

      if (!produtoId && it.produto_nome) {
        const pRes = await client.query(
          `INSERT INTO produtos (empresa_id, nome, status, tipo, criado_por)
           VALUES ($1, $2, 'ativo', 'produto', $3)
           RETURNING id`,
          [empresaId, it.produto_nome.trim(), userId]
        );
        produtoId = pRes.rows[0].id;
      }

      const largura = parseFloat(String(it.largura || "").replace(",", ".")) || null;
      const altura  = parseFloat(String(it.altura  || "").replace(",", ".")) || null;
      const qtd     = parseFloat(it.quantidade) || 1;
      const preco   = parseFloat(String(it.preco_unitario || "").replace(",", ".")) || null;
      const custo   = parseFloat(String(it.custo_unitario || "").replace(",", ".")) || null;

      await client.query(
        `INSERT INTO orcamento_itens
           (orcamento_id, produto_id, produto_nome, ambiente, largura, altura,
            quantidade, unidade, cor, referencia, especificacoes,
            preco_unitario, valor_total_item, custo_unitario, custo_total_item, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          orcamento.id,
          produtoId,
          it.produto_nome || null,
          it.ambiente || null,
          largura,
          altura,
          qtd,
          it.unidade || "un",
          it.cor || null,
          it.referencia || null,
          it.especificacoes ? JSON.stringify(it.especificacoes) : "{}",
          preco,
          preco ? qtd * preco : null,
          custo,
          custo ? qtd * custo : null,
          i,
        ]
      );
    }

    // Inserir pagamentos
    for (let i = 0; i < pagamentos.length; i++) {
      const p = pagamentos[i];
      await client.query(
        `INSERT INTO orcamento_pagamentos
           (orcamento_id, forma, condicao, conta_bancaria, categoria,
            centro_custo, num_doc, data_inicial, valor, taxa, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          orcamento.id,
          p.forma || null,
          p.condicao || null,
          p.conta_bancaria || null,
          p.categoria || null,
          p.centro_custo || null,
          p.num_doc || null,
          p.data_inicial || null,
          parseFloat(String(p.valor || "0").replace(",", ".")) || null,
          parseFloat(String(p.taxa || "0").replace(",", ".")) || null,
          i,
        ]
      );
    }

    await client.query("COMMIT");
    return { ...orcamento, itens, pagamentos };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function buscar(id, empresaId) {
  const oRes = await db.query(
    `SELECT o.*,
            c.nome    AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
            u.nome_completo AS consultora_nome,
            a.nome    AS arquiteto_nome,
            v.nome_completo AS vendedor_nome,
            g.nome_completo AS gerente_nome
     FROM orcamentos o
     LEFT JOIN clientes   c ON c.id = o.cliente_id   AND c.deleted_at IS NULL
     LEFT JOIN usuarios   u ON u.id = o.consultora_id
     LEFT JOIN arquitetos a ON a.id = o.arquiteto_id AND a.deleted_at IS NULL
     LEFT JOIN usuarios   v ON v.id = o.vendedor_id
     LEFT JOIN usuarios   g ON g.id = o.gerente_id
     WHERE o.id = $1 AND o.empresa_id = $2 AND o.deleted_at IS NULL`,
    [id, empresaId]
  );
  if (!oRes.rows[0]) return null;
  const orcamento = oRes.rows[0];

  const itRes = await db.query(
    `SELECT * FROM orcamento_itens WHERE orcamento_id = $1 ORDER BY ordem, id`,
    [id]
  );

  const pagRes = await db.query(
    `SELECT * FROM orcamento_pagamentos WHERE orcamento_id = $1 ORDER BY ordem, id`,
    [id]
  );

  const ambientesMap = {};
  for (const it of itRes.rows) {
    const amb = it.ambiente || "Geral";
    if (!ambientesMap[amb]) ambientesMap[amb] = [];
    ambientesMap[amb].push(it);
  }
  const ambientes = Object.entries(ambientesMap).map(([nome, itens]) => ({ nome, itens }));

  return { ...orcamento, ambientes, pagamentos: pagRes.rows };
}

async function atualizar(id, empresaId, userId, dados) {
  const {
    cliente_id, arquiteto_id, vendedor_id, gerente_id, clube,
    observacoes, endereco_entrega, itens = [],
    taxar_nf, de_onde_veio, faturamento_diferente,
    pagamentos = []
  } = dados;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const check = await client.query(
      `SELECT status FROM orcamentos WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [id, empresaId]
    );
    if (!check.rows[0]) throw Object.assign(new Error("Orçamento não encontrado."), { status: 404 });
    if (check.rows[0].status !== "novo")
      throw Object.assign(new Error("Somente orçamentos com status 'novo' podem ser editados."), { status: 400 });

    const valor_total = calcularTotal(itens);
    const end = endereco_entrega || {};

    await client.query(
      `UPDATE orcamentos
       SET cliente_id=$1, arquiteto_id=$2, vendedor_id=$3, gerente_id=$4, clube=$5,
           observacoes=$6, endereco_entrega=$7, valor_total=$8, updated_at=NOW(),
           taxar_nf=$9, de_onde_veio=$10, faturamento_diferente=$11,
           entrega_cep=$12, entrega_rua=$13, entrega_numero=$14,
           entrega_complemento=$15, entrega_bairro=$16, entrega_cidade=$17, entrega_estado=$18
       WHERE id=$19`,
      [
        cliente_id || null,
        arquiteto_id || null,
        vendedor_id || null,
        gerente_id || null,
        clube || null,
        observacoes || null,
        endereco_entrega ? JSON.stringify(endereco_entrega) : null,
        valor_total,
        taxar_nf || false,
        de_onde_veio || null,
        faturamento_diferente || false,
        end.cep || null,
        end.rua || null,
        end.numero || null,
        end.complemento || null,
        end.bairro || null,
        end.cidade || null,
        end.estado || null,
        id,
      ]
    );

    await client.query(`DELETE FROM orcamento_itens WHERE orcamento_id=$1`, [id]);

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      let produtoId = it.produto_id || null;

      if (!produtoId && it.produto_nome) {
        const pRes = await client.query(
          `INSERT INTO produtos (empresa_id, nome, status, tipo, criado_por)
           VALUES ($1, $2, 'ativo', 'produto', $3)
           RETURNING id`,
          [empresaId, it.produto_nome.trim(), userId]
        );
        produtoId = pRes.rows[0].id;
      }

      const largura = parseFloat(String(it.largura || "").replace(",", ".")) || null;
      const altura  = parseFloat(String(it.altura  || "").replace(",", ".")) || null;
      const qtd     = parseFloat(it.quantidade) || 1;
      const preco   = parseFloat(String(it.preco_unitario || "").replace(",", ".")) || null;
      const custo   = parseFloat(String(it.custo_unitario || "").replace(",", ".")) || null;

      await client.query(
        `INSERT INTO orcamento_itens
           (orcamento_id, produto_id, produto_nome, ambiente, largura, altura,
            quantidade, unidade, cor, referencia, especificacoes,
            preco_unitario, valor_total_item, custo_unitario, custo_total_item, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          id,
          produtoId,
          it.produto_nome || null,
          it.ambiente || null,
          largura,
          altura,
          qtd,
          it.unidade || "un",
          it.cor || null,
          it.referencia || null,
          it.especificacoes ? JSON.stringify(it.especificacoes) : "{}",
          preco,
          preco ? qtd * preco : null,
          custo,
          custo ? qtd * custo : null,
          i,
        ]
      );
    }

    // Atualizar pagamentos: delete + reinsert
    await client.query(`DELETE FROM orcamento_pagamentos WHERE orcamento_id=$1`, [id]);
    for (let i = 0; i < pagamentos.length; i++) {
      const p = pagamentos[i];
      await client.query(
        `INSERT INTO orcamento_pagamentos
           (orcamento_id, forma, condicao, conta_bancaria, categoria,
            centro_custo, num_doc, data_inicial, valor, taxa, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          p.forma || null,
          p.condicao || null,
          p.conta_bancaria || null,
          p.categoria || null,
          p.centro_custo || null,
          p.num_doc || null,
          p.data_inicial || null,
          parseFloat(String(p.valor || "0").replace(",", ".")) || null,
          parseFloat(String(p.taxa || "0").replace(",", ".")) || null,
          i,
        ]
      );
    }

    await client.query("COMMIT");
    return buscar(id, empresaId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function aprovar(id, empresaId, userId, enderecoEntrega) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const oRes = await client.query(
      `SELECT o.*, c.nome AS cliente_nome
       FROM orcamentos o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       WHERE o.id=$1 AND o.empresa_id=$2 AND o.deleted_at IS NULL FOR UPDATE OF o`,
      [id, empresaId]
    );
    if (!oRes.rows[0]) throw Object.assign(new Error("Orçamento não encontrado."), { status: 404 });
    const orc = oRes.rows[0];
    if (orc.status !== "novo")
      throw Object.assign(new Error("Somente orçamentos 'novo' podem ser aprovados."), { status: 400 });

    await client.query(
      `UPDATE orcamentos SET status='aprovado', updated_at=NOW() WHERE id=$1`,
      [id]
    );

    const seqRes = await client.query("SELECT nextval('pedidos_numero_seq') AS seq");
    const numeroSeq = seqRes.rows[0].seq;

    const end = enderecoEntrega || {
      rua: orc.entrega_rua,
      numero: orc.entrega_numero,
      complemento: orc.entrega_complemento,
      bairro: orc.entrega_bairro,
      cidade: orc.entrega_cidade,
      estado: orc.entrega_estado,
      cep: orc.entrega_cep,
    };
    const pRes = await client.query(
      `INSERT INTO pedidos
         (empresa_id, cliente_id, consultor_id, arquiteto_id, numero_sequencial, status,
          total, orcamento_id, rua, numero, complemento, bairro, cidade, estado, cep,
          criado_por, data_pedido)
       VALUES ($1,$2,$3,$4,$5,'pendente',$6,$7,$8,$9,$10,$11,$12,$13,$14,$3,CURRENT_DATE)
       RETURNING id`,
      [
        empresaId,
        orc.cliente_id,
        userId,
        orc.arquiteto_id || null,
        numeroSeq,
        orc.valor_total || 0,
        id,
        end.rua || null,
        end.numero || null,
        end.complemento || null,
        end.bairro || null,
        end.cidade || null,
        end.estado || null,
        end.cep || null,
      ]
    );
    const pedidoId = pRes.rows[0].id;

    const itRes = await client.query(
      `SELECT * FROM orcamento_itens WHERE orcamento_id=$1 ORDER BY ordem, id`,
      [id]
    );

    for (let i = 0; i < itRes.rows.length; i++) {
      const it = itRes.rows[i];
      const medidas = it.largura && it.altura
        ? `${it.largura} × ${it.altura}`
        : it.largura ? `${it.largura}` : null;

      await client.query(
        `INSERT INTO pedido_itens
           (pedido_id, orcamento_item_id, ambiente, descricao, referencia, cor,
            medidas, quantidade, unidade, preco_unitario, valor, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          pedidoId,
          it.id,
          it.ambiente || null,
          it.produto_nome || it.referencia || "Item",
          it.referencia || null,
          it.cor || null,
          medidas,
          it.quantidade,
          it.unidade || "un",
          it.preco_unitario || null,
          it.valor_total_item || null,
          i,
        ]
      );
    }

    await client.query("COMMIT");
    return { orcamento_id: id, pedido_id: pedidoId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function cancelar(id, empresaId) {
  const res = await db.query(
    `UPDATE orcamentos SET status='cancelado', updated_at=NOW()
     WHERE id=$1 AND empresa_id=$2 AND status='novo' AND deleted_at IS NULL
     RETURNING id`,
    [id, empresaId]
  );
  if (!res.rows[0])
    throw Object.assign(new Error("Orçamento não encontrado ou já aprovado/cancelado."), { status: 400 });
  return res.rows[0];
}

module.exports = { listar, criar, buscar, atualizar, aprovar, cancelar };
