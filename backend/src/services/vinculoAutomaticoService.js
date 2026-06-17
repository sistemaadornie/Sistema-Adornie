const db = require("../database/db");
const auditSvc = require("./auditoriaService");

// Decide quais pares (acessorio -> principal) devem ser vinculados
// automaticamente: mesmo ambiente, mesma largura (exata), e
// correspondencia 1:1 (exatamente um acessorio e um principal com
// aquela largura no ambiente).
function encontrarPares(itens) {
  const grupos = new Map();

  for (const it of itens) {
    if (it.ambiente == null || it.ambiente === "" || it.largura == null) continue;

    if (!grupos.has(it.ambiente)) {
      grupos.set(it.ambiente, { acessorios: [], principais: [] });
    }
    const grupo = grupos.get(it.ambiente);
    if (it.vinculavel && !it.ja_vinculado) grupo.acessorios.push(it);
    if (it.recebe_vinculo_automatico) grupo.principais.push(it);
  }

  const pares = [];
  for (const { acessorios, principais } of grupos.values()) {
    for (const acessorio of acessorios) {
      const mesmaLarguraAcessorios = acessorios.filter(
        (a) => Number(a.largura) === Number(acessorio.largura)
      );
      const mesmaLarguraPrincipais = principais.filter(
        (p) => Number(p.largura) === Number(acessorio.largura)
      );
      if (mesmaLarguraAcessorios.length === 1 && mesmaLarguraPrincipais.length === 1) {
        pares.push({ acessorioId: acessorio.id, principalId: mesmaLarguraPrincipais[0].id });
      }
    }
  }
  return pares;
}

const RE_CANAIS = /(\d+)\s*(?:canais|canal)/i;

function encontrarVinculosControle(itens) {
  const grupos = new Map();

  for (const it of itens) {
    if (!it.ambiente) continue;
    if (!grupos.has(it.ambiente)) grupos.set(it.ambiente, { controles: [], motorizados: [] });
    const g = grupos.get(it.ambiente);
    if (it.distribui_canais) g.controles.push(it);
    if (it.recebe_vinculo_automatico && it.acionamento === 'motorizado') g.motorizados.push(it);
  }

  const pares = [];
  const insuficientes = [];

  for (const [ambiente, { controles, motorizados }] of grupos) {
    if (motorizados.length === 0) continue;
    for (const controle of controles) {
      const match = RE_CANAIS.exec(controle.descricao || '');
      if (!match) continue;
      const canais = parseInt(match[1], 10);
      if (motorizados.length <= canais) {
        for (const mot of motorizados) {
          pares.push({ acessorioId: controle.id, principalId: mot.id });
        }
      } else {
        insuficientes.push({ ambiente, motorizados: motorizados.length, canais });
      }
    }
  }

  return { pares, insuficientes };
}

async function processarPedido(pedidoId, empresaId, userId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const itensRes = await client.query(
      `SELECT pi.id, pi.ambiente, pi.largura, pi.descricao,
              COALESCE(c.vinculavel, false)               AS vinculavel,
              COALESCE(c.recebe_vinculos, false)          AS recebe_vinculos,
              COALESCE(c.recebe_vinculo_automatico, false) AS recebe_vinculo_automatico,
              EXISTS (
                SELECT 1 FROM pedido_item_vinculos piv WHERE piv.item_id = pi.id
              ) AS ja_vinculado
       FROM pedido_itens pi
       LEFT JOIN categorias c ON c.id = pi.categoria_id
       WHERE pi.pedido_id = $1`,
      [pedidoId]
    );

    const pares = encontrarPares(itensRes.rows);
    const itensPorId = new Map(itensRes.rows.map((it) => [it.id, it]));

    for (const { acessorioId, principalId } of pares) {
      const acessorio = itensPorId.get(acessorioId);
      const principal = itensPorId.get(principalId);

      await client.query(
        `INSERT INTO pedido_item_vinculos (item_id, item_vinculado_id, tipo_vinculo)
         VALUES ($1, $2, 'acessorio')
         ON CONFLICT DO NOTHING`,
        [acessorioId, principalId]
      );
      await client.query(
        `UPDATE pedido_itens SET sem_vinculo = false WHERE id = $1`,
        [acessorioId]
      );
      await auditSvc.registrarAuditoria(client, {
        pedidoId,
        empresaId,
        usuarioId: userId,
        etapa: "dados_pedido",
        acao: "vinculo_automatico",
        descricao: `Vínculo automático: "${acessorio.descricao}" → "${principal.descricao}" (ambiente: ${acessorio.ambiente}, largura: ${acessorio.largura}m)`,
      });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { encontrarPares, encontrarVinculosControle, processarPedido };
