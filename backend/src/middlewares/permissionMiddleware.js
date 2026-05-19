/**
 * Middleware de permissão.
 * Deve ser usado APÓS o authMiddleware.
 *
 * Uso: router.get("/rota", authMiddleware, permissionMiddleware("PERMISSAO_X"), handler)
 *      router.get("/rota", authMiddleware, permissionMiddleware(["PERM_A", "PERM_B"]), handler)
 *      (array = OR lógico: basta ter uma das permissões)
 *
 * ADMIN_MASTER sempre passa em qualquer rota.
 * Aliases mantêm compatibilidade com tokens emitidos antes da renomeação.
 */

/* Mapeamento de nomes antigos → novo (garante tokens legados ainda funcionem) */
const ALIASES = {
  "AGENDAMENTO_INSTALADOR": "INSTALADOR",
  "VENDEDOR":               "COMERCIAL",
  "USUARIO_APROVAR":        "GESTOR_USUARIOS",
  "USUARIO_ATRIBUIR_PERMISSOES": "GESTOR_USUARIOS",
};

function normalizarPermissoes(permissoes) {
  const set = new Set(permissoes || []);
  for (const [antigo, novo] of Object.entries(ALIASES)) {
    if (set.has(antigo)) set.add(novo);
  }
  return set;
}

function permissionMiddleware(permissaoNecessaria) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const perms = normalizarPermissoes(req.user.permissoes);

    /* ADMIN_MASTER tem acesso total — bypassa qualquer checagem */
    if (perms.has("ADMIN_MASTER")) return next();

    const lista = Array.isArray(permissaoNecessaria)
      ? permissaoNecessaria
      : [permissaoNecessaria];

    if (!lista.some((p) => perms.has(p))) {
      return res.status(403).json({
        message: `Acesso negado. Permissão necessária: ${lista.join(" ou ")}`,
      });
    }

    next();
  };
}

module.exports = permissionMiddleware;