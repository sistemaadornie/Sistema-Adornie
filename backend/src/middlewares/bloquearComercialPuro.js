const jwt = require("jsonwebtoken");
const { isComercialPuro } = require("../services/permissionService");

/**
 * Nega acesso a usuários "COMERCIAL puro" (consultoras, sem nenhuma permissão
 * mais ampla) em módulos totalmente fora do alcance delas. Decodifica o
 * próprio token — não depende de rodar depois do authMiddleware — pra poder
 * ser montado com router.use() antes de qualquer rota do arquivo.
 */
function bloquearComercialPuro(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    if (isComercialPuro(decoded.permissoes || [])) {
      return res.status(403).json({ message: "Consultoras não têm acesso a este módulo." });
    }
    return next();
  } catch {
    return next();
  }
}

module.exports = bloquearComercialPuro;
