const db = require("../database/db");

async function gerarCodigo(empresaId, tipo) {
  const prefix = tipo === "servico" ? "SERV" : "PROD";
  const res = await db.query(
    `SELECT COUNT(*) AS total FROM produtos WHERE empresa_id = $1 AND tipo = $2`,
    [empresaId, tipo]
  );
  const seq = parseInt(res.rows[0].total, 10) + 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

async function listar(empresaId, { q, tipo, status, marca, categoria, categoria_id, estoque: estoqueFilter, dataInicio, dataFim } = {}) {
  const conds = ["p.empresa_id = $1", "p.deleted_at IS NULL"];
  const params = [empresaId];
  let i = 2;

  if (q) {
    conds.push(`(p.nome ILIKE $${i} OR p.codigo ILIKE $${i} OR p.referencia ILIKE $${i} OR p.marca ILIKE $${i})`);
    params.push(`%${q}%`); i++;
  }
  if (tipo)        { conds.push(`p.tipo = $${i}`);            params.push(tipo);             i++; }
  if (status)      { conds.push(`p.status = $${i}`);          params.push(status);           i++; }
  if (marca)       { conds.push(`p.marca ILIKE $${i}`);       params.push(`%${marca}%`);     i++; }
  if (categoria_id){ conds.push(`p.categoria_id = $${i}`);    params.push(categoria_id);     i++; }
  else if (categoria) { conds.push(`(p.categoria ILIKE $${i} OR c.nome ILIKE $${i})`); params.push(`%${categoria}%`); i++; }
  if (estoqueFilter === "com") { conds.push("p.estoque > 0"); }
  if (estoqueFilter === "sem") { conds.push("p.estoque <= 0"); }
  if (dataInicio)  { conds.push(`p.updated_at >= $${i}`);     params.push(dataInicio);       i++; }
  if (dataFim)     { conds.push(`p.updated_at <= $${i}`);     params.push(dataFim);          i++; }

  const res = await db.query(
    `SELECT p.id, p.codigo, p.referencia, p.tipo, p.nome, p.descricao, p.marca,
            p.categoria, p.categoria_id, c.nome AS categoria_nome, c.cor AS categoria_cor,
            p.unidade, p.preco_custo, p.preco_venda, p.estoque, p.status, p.foto_url,
            p.created_at, p.updated_at
     FROM produtos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE ${conds.join(" AND ")}
     ORDER BY p.updated_at DESC`,
    params
  );
  return res.rows;
}

async function listarMarcas(empresaId) {
  const res = await db.query(
    `SELECT DISTINCT marca FROM produtos
     WHERE empresa_id = $1 AND deleted_at IS NULL AND marca IS NOT NULL AND marca <> ''
     ORDER BY marca`,
    [empresaId]
  );
  return res.rows.map((r) => r.marca);
}

async function listarCategorias(empresaId) {
  const res = await db.query(
    `SELECT DISTINCT categoria FROM produtos
     WHERE empresa_id = $1 AND deleted_at IS NULL AND categoria IS NOT NULL AND categoria <> ''
     ORDER BY categoria`,
    [empresaId]
  );
  return res.rows.map((r) => r.categoria);
}

async function buscar(id, empresaId) {
  const res = await db.query(
    `SELECT p.*, c.nome AS categoria_nome, c.cor AS categoria_cor
     FROM produtos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE p.id = $1 AND p.empresa_id = $2 AND p.deleted_at IS NULL`,
    [id, empresaId]
  );
  return res.rows[0] || null;
}

async function criar(empresaId, userId, dados) {
  const { referencia, tipo = "produto", nome, descricao, marca, categoria, categoria_id,
          unidade = "un", preco_custo = 0, preco_venda = 0, estoque = 0,
          status = "ativo", foto_url } = dados;

  if (!nome?.trim()) throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  const codigo = await gerarCodigo(empresaId, tipo);

  // Resolve categoria text from categoria_id when provided
  let categoriaTexto = categoria || null;
  if (categoria_id) {
    const catRes = await db.query(`SELECT nome FROM categorias WHERE id = $1 AND empresa_id = $2`, [categoria_id, empresaId]);
    if (catRes.rows[0]) categoriaTexto = catRes.rows[0].nome;
  }

  const res = await db.query(
    `INSERT INTO produtos
       (empresa_id, codigo, referencia, tipo, nome, descricao, marca, categoria, categoria_id,
        unidade, preco_custo, preco_venda, estoque, status, foto_url, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [empresaId, codigo, referencia || null, tipo, nome.trim(), descricao || null,
     marca || null, categoriaTexto, categoria_id || null, unidade, preco_custo, preco_venda,
     estoque, status, foto_url || null, userId]
  );
  return res.rows[0];
}

async function atualizar(id, empresaId, dados) {
  const produto = await buscar(id, empresaId);
  if (!produto) throw Object.assign(new Error("Produto não encontrado."), { status: 404 });

  const { referencia, tipo, nome, descricao, marca, categoria, categoria_id,
          unidade, preco_custo, preco_venda, estoque, status, foto_url } = dados;

  if (nome !== undefined && !nome?.trim())
    throw Object.assign(new Error("Nome é obrigatório."), { status: 400 });

  // Resolve categoria text when categoria_id is being set
  let categoriaTexto = categoria ?? null;
  if (categoria_id !== undefined) {
    if (categoria_id) {
      const catRes = await db.query(`SELECT nome FROM categorias WHERE id = $1 AND empresa_id = $2`, [categoria_id, empresaId]);
      if (catRes.rows[0]) categoriaTexto = catRes.rows[0].nome;
    } else {
      categoriaTexto = null;
    }
  }

  const res = await db.query(
    `UPDATE produtos SET
       referencia   = COALESCE($1,  referencia),
       tipo         = COALESCE($2,  tipo),
       nome         = COALESCE($3,  nome),
       descricao    = COALESCE($4,  descricao),
       marca        = COALESCE($5,  marca),
       categoria    = COALESCE($6,  categoria),
       categoria_id = COALESCE($7,  categoria_id),
       unidade      = COALESCE($8,  unidade),
       preco_custo  = COALESCE($9,  preco_custo),
       preco_venda  = COALESCE($10, preco_venda),
       estoque      = COALESCE($11, estoque),
       status       = COALESCE($12, status),
       foto_url     = COALESCE($13, foto_url),
       updated_at   = NOW()
     WHERE id = $14 AND empresa_id = $15 AND deleted_at IS NULL
     RETURNING *`,
    [referencia ?? null, tipo ?? null, nome?.trim() ?? null, descricao ?? null,
     marca ?? null, categoriaTexto, categoria_id ?? null, unidade ?? null,
     preco_custo ?? null, preco_venda ?? null, estoque ?? null,
     status ?? null, foto_url ?? null, id, empresaId]
  );
  return res.rows[0];
}

async function excluir(id, empresaId) {
  const res = await db.query(
    `UPDATE produtos SET deleted_at = NOW()
     WHERE id = $1 AND empresa_id = $2 AND deleted_at IS NULL`,
    [id, empresaId]
  );
  if (res.rowCount === 0) throw Object.assign(new Error("Produto não encontrado."), { status: 404 });
}

const CATEGORIA_KEYWORDS = [
  { keywords: ["persiana", "rolo", "roller", "double vision", "blackout", "screen"], nome: "Persianas" },
  { keywords: ["cortina", "voil", "voile", "blackout cortina"], nome: "Cortinas" },
  { keywords: ["trilho", "varão", "suporte", "bandô", "bando"], nome: "Trilhos e Varões" },
  { keywords: ["tecido", "retalho", "metro"], nome: "Tecidos" },
  { keywords: ["papel de parede", "papel parede", "wallpaper"], nome: "Papel de Parede" },
  { keywords: ["tapete"], nome: "Tapetes" },
  { keywords: ["instala", "servi", "mão de obra", "montagem", "visita"], nome: "Serviços" },
  { keywords: ["acessório", "acessorio", "abraçadeira", "gancho", "presilha", "terminal"], nome: "Acessórios" },
];

function sugerirCategoria(texto = "") {
  const lower = texto.toLowerCase();
  for (const { keywords, nome } of CATEGORIA_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return nome;
  }
  return "Outros";
}

async function candidatosDePedidos(empresaId) {
  // Aggregate unique items from pedido_itens not already in catalog (by referencia)
  const res = await db.query(
    `SELECT
       COALESCE(pi.referencia, '') AS referencia,
       pi.descricao,
       MAX(pi.unidade)                         AS unidade,
       ROUND(AVG(pi.preco_unitario)::numeric, 2) AS preco_sugerido,
       COUNT(*)                                AS total_aparicoes,
       MAX(pi.created_at)                      AS ultima_aparicao
     FROM pedido_itens pi
     JOIN pedidos p ON p.id = pi.pedido_id
     WHERE p.empresa_id = $1
       AND p.deleted_at IS NULL
       AND pi.descricao IS NOT NULL AND pi.descricao <> ''
       AND (
         pi.referencia IS NULL OR pi.referencia = '' OR
         pi.referencia NOT IN (
           SELECT COALESCE(referencia,'') FROM produtos
           WHERE empresa_id = $1 AND deleted_at IS NULL AND referencia IS NOT NULL AND referencia <> ''
         )
       )
     GROUP BY COALESCE(pi.referencia, ''), pi.descricao
     ORDER BY total_aparicoes DESC, descricao ASC`,
    [empresaId]
  );

  return res.rows.map((r) => ({
    ...r,
    sugestao_categoria: sugerirCategoria(r.referencia + " " + r.descricao),
  }));
}

async function importarDePedidos(empresaId, userId, itens) {
  let importados = 0;
  const erros = [];

  for (const item of itens) {
    if (!item.descricao?.trim()) continue;
    try {
      await criar(empresaId, userId, {
        referencia:  item.referencia  || null,
        tipo:        item.tipo        || "produto",
        nome:        item.descricao,
        unidade:     item.unidade     || "un",
        preco_venda: item.preco_venda || 0,
        categoria_id: item.categoria_id || null,
        status:      "ativo",
      });
      importados++;
    } catch (e) {
      erros.push({ descricao: item.descricao, erro: e.message });
    }
  }

  return { importados, erros };
}

module.exports = { listar, listarMarcas, listarCategorias, buscar, criar, atualizar, excluir, candidatosDePedidos, importarDePedidos };
