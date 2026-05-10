/**
 * Middleware de permissão.
 * Deve ser usado APÓS o authMiddleware.
 *
 * Uso: router.get("/rota", authMiddleware, permissionMiddleware("PERMISSAO_X"), handler)
 *      router.get("/rota", authMiddleware, permissionMiddleware(["PERM_A", "PERM_B"]), handler)
 *      (array = OR lógico: basta ter uma das permissões)
 */
function permissionMiddleware(permissaoNecessaria) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    if (!Array.isArray(req.user.permissoes)) {
      return res.status(403).json({ message: "Permissões não encontradas." });
    }

    const lista = Array.isArray(permissaoNecessaria)
      ? permissaoNecessaria
      : [permissaoNecessaria];

    const temPermissao = lista.some((p) => req.user.permissoes.includes(p));

    if (!temPermissao) {
      return res.status(403).json({
        message: `Acesso negado. Permissão necessária: ${lista.join(" ou ")}`,
      });
    }

    next();
  };
}

module.exports = permissionMiddleware;