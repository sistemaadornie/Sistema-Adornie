const db = require("../database/db");

async function listar(empresaId, { q, status, categoria, tipo } = {}) {
  const params = [empresaId];
  const conds = ["deleted_at IS NULL"];

  if (status) {
    params.push(status);
    conds.push(`status = $${params.length}`);
  }
  if (categoria) {
    params.push(categoria);
    conds.push(`categoria = $${params.length}`);
  }
  if (tipo) {
    params.push(tipo);
    conds.push(`tipo = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    conds.push(`(nome ILIKE $${params.length} OR cnpj ILIKE $${params.length} OR cpf ILIKE $${params.length} OR email ILIKE $${params.length} OR contato ILIKE $${params.length})`);
  }

  const res = await db.query(`
    SELECT * FROM fornecedores
    WHERE empresa_id = $1 AND ${conds.join(" AND ")}
    ORDER BY nome ASC
  `, params);
  return res.rows;
}

async function listarCategorias(empresaId) {
  const res = await db.query(`
    SELECT DISTINCT categoria FROM fornecedores
    WHERE empresa_id = $1 AND categoria IS NOT NULL AND deleted_at IS NULL
    ORDER BY categoria ASC
  `, [empresaId]);
  return res.rows.map((r) => r.categoria);
}

async function buscar(id, empresaId) {
  const res = await db.query(`
    SELECT * FROM fornecedores
    WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
  `, [id, empresaId]);
  return res.rows[0] || null;
}

async function criar(empresaId, userId, dados) {
  const {
    nome, tipo = "PJ", cnpj, cpf, email, telefone, whatsapp,
    contato, website, categoria, endereco, numero, complemento,
    bairro, cidade, estado, cep, observacoes, status = "ativo",
  } = dados;

  if (!nome?.trim()) {
    const err = new Error("Nome é obrigatório.");
    err.status = 400;
    throw err;
  }

  const res = await db.query(`
    INSERT INTO fornecedores (
      empresa_id, nome, tipo, cnpj, cpf, email, telefone, whatsapp,
      contato, website, categoria, endereco, numero, complemento,
      bairro, cidade, estado, cep, observacoes, status, criado_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    RETURNING id
  `, [
    empresaId, nome.trim(), tipo,
    cnpj || null, cpf || null, email || null, telefone || null, whatsapp || null,
    contato || null, website || null, categoria || null,
    endereco || null, numero || null, complemento || null,
    bairro || null, cidade || null, estado || null, cep || null,
    observacoes || null, status, userId,
  ]);

  return buscar(res.rows[0].id, empresaId);
}

async function atualizar(id, empresaId, dados) {
  const {
    nome, tipo, cnpj, cpf, email, telefone, whatsapp,
    contato, website, categoria, endereco, numero, complemento,
    bairro, cidade, estado, cep, observacoes, status,
  } = dados;

  const res = await db.query(`
    UPDATE fornecedores SET
      nome        = COALESCE($1,  nome),
      tipo        = COALESCE($2,  tipo),
      cnpj        = COALESCE($3,  cnpj),
      cpf         = COALESCE($4,  cpf),
      email       = COALESCE($5,  email),
      telefone    = COALESCE($6,  telefone),
      whatsapp    = COALESCE($7,  whatsapp),
      contato     = COALESCE($8,  contato),
      website     = COALESCE($9,  website),
      categoria   = COALESCE($10, categoria),
      endereco    = COALESCE($11, endereco),
      numero      = COALESCE($12, numero),
      complemento = COALESCE($13, complemento),
      bairro      = COALESCE($14, bairro),
      cidade      = COALESCE($15, cidade),
      estado      = COALESCE($16, estado),
      cep         = COALESCE($17, cep),
      observacoes = COALESCE($18, observacoes),
      status      = COALESCE($19, status),
      updated_at  = NOW()
    WHERE id = $20 AND empresa_id = $21 AND deleted_at IS NULL
    RETURNING id
  `, [
    nome || null, tipo || null,
    cnpj || null, cpf || null, email || null, telefone || null, whatsapp || null,
    contato || null, website || null, categoria || null,
    endereco || null, numero || null, complemento || null,
    bairro || null, cidade || null, estado || null, cep || null,
    observacoes || null, status || null,
    id, empresaId,
  ]);

  if (res.rows.length === 0) throw new Error("Fornecedor não encontrado.");
  return buscar(id, empresaId);
}

async function excluir(id, empresaId) {
  const res = await db.query(`
    UPDATE fornecedores SET deleted_at = NOW()
    WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL
    RETURNING id
  `, [id, empresaId]);
  if (res.rows.length === 0) throw new Error("Fornecedor não encontrado.");
}

module.exports = { listar, listarCategorias, buscar, criar, atualizar, excluir };
