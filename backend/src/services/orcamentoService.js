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
    params.push(Number(consultora_id));
    conds.push(`o.consultora_id = $${params.length}`);
  }

  const res = await db.query(
    `SELECT o.id, o.numero, o.status, o.valor_total, o.created_at,
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
  const { cliente_id, arquiteto_id, observacoes, endereco_entrega, itens = [] } = dados;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const seqRes = await client.query("SELECT nextval('orcamentos_numero_seq') AS seq");
    const numero = fmtNumero(seqRes.rows[0].seq);
    const valor_total = calcularTotal(itens);

    const oRes = await client.query(
      `INSERT INTO orcamentos
         (empresa_id, cliente_id, consultora_id, arquiteto_id, numero, status,
          observacoes, valor_total, endereco_entrega, criado_por)
       VALUES ($1,$2,$3,$4,$5,'novo',$6,$7,$8,$3)
       RETURNING *`,
      [
        empresaId,
        cliente_id || null,
        userId,
        arquiteto_id || null,
        numero,
        observacoes || null,
        valor_total,
        endereco_entrega ? JSON.stringify(endereco_entrega) : null,
      ]
    );
    const orcamento = oRes.rows[0];

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      let produtoId = it.produto_id || null;

      if (!produtoId && it.produto_nome) {
        const pRes = await client.query(
          `INSERT INTO produtos (empresa_id, nome, status, tipo, criado_por)
           VALUES ($1, $2, 'inativo', 'produto', $3)
           RETURNING id`,
          [empresaId, it.produto_nome.trim(), userId]
        );
        produtoId = pRes.rows[0].id;
      }

      const largura = parseFloat(String(it.largura || "").replace(",", ".")) || null;
      const altura  = parseFloat(String(it.altura  || "").replace(",", ".")) || null;
      const qtd     = parseFloat(it.quantidade) || 1;
      const preco   = parseFloat(String(it.preco_unitario || "").replace(",", ".")) || null;

      await client.query(
        `INSERT INTO orcamento_itens
           (orcamento_id, produto_id, produto_nome, ambiente, largura, altura,
            quantidade, unidade, cor, referencia, especificacoes,
            preco_unitario, valor_total_item, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
          i,
        ]
      );
    }

    await client.query("COMMIT");
    return { ...orcamento, itens };
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
            a.nome    AS arquiteto_nome
     FROM orcamentos o
     LEFT JOIN clientes   c ON c.id = o.cliente_id   AND c.deleted_at IS NULL
     LEFT JOIN usuarios   u ON u.id = o.consultora_id
     LEFT JOIN arquitetos a ON a.id = o.arquiteto_id AND a.deleted_at IS NULL
     WHERE o.id = $1 AND o.empresa_id = $2 AND o.deleted_at IS NULL`,
    [id, empresaId]
  );
  if (!oRes.rows[0]) return null;
  const orcamento = oRes.rows[0];

  const itRes = await db.query(
    `SELECT * FROM orcamento_itens WHERE orcamento_id = $1 ORDER BY ordem, id`,
    [id]
  );

  const ambientesMap = {};
  for (const it of itRes.rows) {
    const amb = it.ambiente || "Geral";
    if (!ambientesMap[amb]) ambientesMap[amb] = [];
    ambientesMap[amb].push(it);
  }
  const ambientes = Object.entries(ambientesMap).map(([nome, itens]) => ({ nome, itens }));

  return { ...orcamento, ambientes };
}

module.exports = { listar, criar, buscar };
