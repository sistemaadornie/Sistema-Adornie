const db = require("../database/db");

async function montarCliente(id, empresaId) {
  const cli = await db.query(
    `SELECT * FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
    [id, empresaId]
  );
  if (cli.rows.length === 0) return null;

  const enderecos = await db.query(
    `SELECT * FROM cliente_enderecos WHERE cliente_id=$1 AND deleted_at IS NULL ORDER BY is_padrao DESC, created_at ASC`,
    [id]
  );
  return { ...cli.rows[0], enderecos: enderecos.rows };
}

async function listar(empresaId, q) {
  const params = [empresaId];
  let whereExtra = "";
  if (q) {
    params.push(`%${q}%`);
    whereExtra = ` AND (c.nome ILIKE $${params.length} OR c.telefone ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
  }

  const result = await db.query(
    `SELECT c.*,
      (SELECT COUNT(*) FROM cliente_enderecos e WHERE e.cliente_id=c.id AND e.deleted_at IS NULL) AS total_enderecos
     FROM clientes c
     WHERE c.empresa_id=$1 AND c.deleted_at IS NULL${whereExtra}
     ORDER BY c.nome ASC`,
    params
  );

  const ids = result.rows.map((r) => r.id);
  let endPorId = {};
  if (ids.length > 0) {
    const eRes = await db.query(
      `SELECT * FROM cliente_enderecos WHERE cliente_id=ANY($1) AND deleted_at IS NULL ORDER BY is_padrao DESC, created_at ASC`,
      [ids]
    );
    eRes.rows.forEach((e) => {
      if (!endPorId[e.cliente_id]) endPorId[e.cliente_id] = [];
      endPorId[e.cliente_id].push(e);
    });
  }

  return result.rows.map((c) => ({ ...c, enderecos: endPorId[c.id] || [] }));
}

async function buscar(id, empresaId) {
  return montarCliente(id, empresaId);
}

async function criar(empresaId, dados) {
  const { nome, telefone, email } = dados;
  if (!nome) { const e = new Error("Nome é obrigatório."); e.status = 400; throw e; }

  const result = await db.query(
    `INSERT INTO clientes (empresa_id, nome, telefone, email) VALUES ($1,$2,$3,$4) RETURNING id`,
    [empresaId, nome.trim(), telefone?.trim()||null, email?.trim()||null]
  );
  return montarCliente(result.rows[0].id, empresaId);
}

async function atualizar(id, empresaId, dados) {
  const { nome, telefone, email } = dados;
  if (!nome) { const e = new Error("Nome é obrigatório."); e.status = 400; throw e; }

  const result = await db.query(
    `UPDATE clientes SET nome=$1, telefone=$2, email=$3, updated_at=NOW()
     WHERE id=$4 AND empresa_id=$5 AND deleted_at IS NULL RETURNING id`,
    [nome.trim(), telefone?.trim()||null, email?.trim()||null, id, empresaId]
  );
  if (result.rows.length === 0) { const e = new Error("Cliente não encontrado."); e.status = 404; throw e; }
  return montarCliente(id, empresaId);
}

async function excluir(id, empresaId) {
  const result = await db.query(
    `UPDATE clientes SET deleted_at=NOW() WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL RETURNING id`,
    [id, empresaId]
  );
  if (result.rows.length === 0) { const e = new Error("Cliente não encontrado."); e.status = 404; throw e; }
}

async function adicionarEndereco(clienteId, empresaId, dados) {
  const existe = await db.query(
    `SELECT id FROM clientes WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL LIMIT 1`,
    [clienteId, empresaId]
  );
  if (existe.rows.length === 0) { const e = new Error("Cliente não encontrado."); e.status = 404; throw e; }

  const { label, categoria, rua, numero, complemento, bairro, cidade, estado, cep, referencia, is_padrao } = dados;
  if (!label) { const e = new Error("Label é obrigatório."); e.status = 400; throw e; }

  await db.query("BEGIN");
  if (is_padrao) {
    await db.query(
      `UPDATE cliente_enderecos SET is_padrao=FALSE WHERE cliente_id=$1 AND deleted_at IS NULL`,
      [clienteId]
    );
  }
  await db.query(
    `INSERT INTO cliente_enderecos
       (cliente_id, label, categoria, rua, numero, complemento, bairro, cidade, estado, cep, referencia, is_padrao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [clienteId, label.trim(), categoria||"residencial", rua||null, numero||null, complemento||null,
     bairro||null, cidade||null, estado||null, cep||null, referencia||null, !!is_padrao]
  );
  await db.query("COMMIT");

  return montarCliente(clienteId, empresaId);
}

async function atualizarEndereco(clienteId, endId, empresaId, dados) {
  const existe = await db.query(
    `SELECT c.id FROM clientes c
     JOIN cliente_enderecos e ON e.cliente_id=c.id
     WHERE c.id=$1 AND c.empresa_id=$2 AND e.id=$3 AND c.deleted_at IS NULL AND e.deleted_at IS NULL LIMIT 1`,
    [clienteId, empresaId, endId]
  );
  if (existe.rows.length === 0) { const e = new Error("Endereço não encontrado."); e.status = 404; throw e; }

  const { label, categoria, rua, numero, complemento, bairro, cidade, estado, cep, referencia, is_padrao } = dados;
  if (!label) { const e = new Error("Label é obrigatório."); e.status = 400; throw e; }

  await db.query("BEGIN");
  if (is_padrao) {
    await db.query(
      `UPDATE cliente_enderecos SET is_padrao=FALSE WHERE cliente_id=$1 AND deleted_at IS NULL`,
      [clienteId]
    );
  }
  await db.query(
    `UPDATE cliente_enderecos
     SET label=$1, categoria=$2, rua=$3, numero=$4, complemento=$5, bairro=$6,
         cidade=$7, estado=$8, cep=$9, referencia=$10, is_padrao=$11, updated_at=NOW()
     WHERE id=$12`,
    [label.trim(), categoria||"residencial", rua||null, numero||null, complemento||null,
     bairro||null, cidade||null, estado||null, cep||null, referencia||null, !!is_padrao, endId]
  );
  await db.query("COMMIT");

  return montarCliente(clienteId, empresaId);
}

async function definirPadrao(clienteId, endId, empresaId) {
  const existe = await db.query(
    `SELECT c.id FROM clientes c JOIN cliente_enderecos e ON e.cliente_id=c.id
     WHERE c.id=$1 AND c.empresa_id=$2 AND e.id=$3 AND c.deleted_at IS NULL AND e.deleted_at IS NULL LIMIT 1`,
    [clienteId, empresaId, endId]
  );
  if (existe.rows.length === 0) { const e = new Error("Endereço não encontrado."); e.status = 404; throw e; }

  await db.query(`UPDATE cliente_enderecos SET is_padrao=FALSE WHERE cliente_id=$1`, [clienteId]);
  await db.query(`UPDATE cliente_enderecos SET is_padrao=TRUE  WHERE id=$1`, [endId]);

  return montarCliente(clienteId, empresaId);
}

async function removerEndereco(clienteId, endId, empresaId) {
  const existe = await db.query(
    `SELECT c.id FROM clientes c JOIN cliente_enderecos e ON e.cliente_id=c.id
     WHERE c.id=$1 AND c.empresa_id=$2 AND e.id=$3 AND c.deleted_at IS NULL AND e.deleted_at IS NULL LIMIT 1`,
    [clienteId, empresaId, endId]
  );
  if (existe.rows.length === 0) { const e = new Error("Endereço não encontrado."); e.status = 404; throw e; }

  await db.query(
    `UPDATE cliente_enderecos SET deleted_at=NOW(), is_padrao=FALSE WHERE id=$1`,
    [endId]
  );
  return montarCliente(clienteId, empresaId);
}

/* Busca cliente por nome (case-insensitive, trim). Se não existir, cria automaticamente.
   Retorna o cliente_id. Usado internamente pelo agendamentoService. */
async function resolverCliente(empresaId, nomeRaw) {
  const nome = nomeRaw?.trim();
  if (!nome) { const e = new Error("Nome do cliente é obrigatório."); e.status = 400; throw e; }

  const existe = await db.query(
    `SELECT id FROM clientes
     WHERE empresa_id=$1 AND deleted_at IS NULL AND LOWER(TRIM(nome))=LOWER($2)
     LIMIT 1`,
    [empresaId, nome]
  );
  if (existe.rows.length > 0) return existe.rows[0].id;

  const novo = await db.query(
    `INSERT INTO clientes (empresa_id, nome) VALUES ($1,$2) RETURNING id`,
    [empresaId, nome]
  );
  return novo.rows[0].id;
}

module.exports = {
  listar, buscar, criar, atualizar, excluir,
  adicionarEndereco, atualizarEndereco, definirPadrao, removerEndereco,
  resolverCliente,
};
