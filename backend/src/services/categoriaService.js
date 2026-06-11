const db = require("../database/db");

async function listar(empresaId) {
  const res = await db.query(
    `SELECT id, nome, cor, ordem, vinculavel, recebe_vinculos FROM categorias
     WHERE empresa_id = $1
     ORDER BY ordem ASC, nome ASC`,
    [empresaId]
  );
  return res.rows;
}

async function buscar(id, empresaId) {
  const res = await db.query(
    `SELECT * FROM categorias WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  return res.rows[0] || null;
}

async function criar(empresaId, dados) {
  const { nome, cor, ordem, vinculavel, recebe_vinculos } = dados;
  if (!nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  try {
    const res = await db.query(
      `INSERT INTO categorias (empresa_id, nome, cor, ordem, vinculavel, recebe_vinculos)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [empresaId, nome.trim(), cor || "#C9A96E", ordem ?? 0, !!vinculavel, !!recebe_vinculos]
    );
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw Object.assign(new Error("Já existe uma categoria com esse nome."), { status: 409 });
    throw e;
  }
}

async function atualizar(id, empresaId, dados) {
  const { nome, cor, ordem, vinculavel, recebe_vinculos } = dados;
  if (!nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  try {
    const res = await db.query(
      `UPDATE categorias
       SET nome=$1, cor=$2, ordem=$3, vinculavel=$4, recebe_vinculos=$5, updated_at=NOW()
       WHERE id=$6 AND empresa_id=$7 RETURNING *`,
      [nome.trim(), cor || "#C9A96E", ordem ?? 0, !!vinculavel, !!recebe_vinculos, id, empresaId]
    );
    if (!res.rows.length) throw Object.assign(new Error("Categoria não encontrada."), { status: 404 });
    return res.rows[0];
  } catch (e) {
    if (e.code === "23505") throw Object.assign(new Error("Já existe uma categoria com esse nome."), { status: 409 });
    throw e;
  }
}

async function excluir(id, empresaId) {
  const uso = await db.query(
    `SELECT COUNT(*) FROM produtos WHERE categoria_id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [id, empresaId]
  );
  if (parseInt(uso.rows[0].count) > 0)
    throw Object.assign(new Error("Categoria em uso por produtos. Reclassifique antes de excluir."), { status: 409 });

  const res = await db.query(
    `DELETE FROM categorias WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresaId]
  );
  if (!res.rows.length) throw Object.assign(new Error("Categoria não encontrada."), { status: 404 });
}

module.exports = { listar, buscar, criar, atualizar, excluir };
