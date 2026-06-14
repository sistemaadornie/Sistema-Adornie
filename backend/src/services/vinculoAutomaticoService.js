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
    if (it.recebe_vinculos) grupo.principais.push(it);
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

module.exports = { encontrarPares };
