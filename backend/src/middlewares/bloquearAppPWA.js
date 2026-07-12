const jwt = require("jsonwebtoken");

/**
 * Nega acesso a tokens emitidos pelo PWA do instalador (claim app==="pwa")
 * em rotas que o app não usa, exceto para ADMIN_MASTER (bypass total, como
 * em todo o resto do sistema). Roda de forma independente do authMiddleware
 * — decodifica o próprio token — porque precisa valer mesmo quando montado
 * antes dele na cadeia de middlewares da rota.
 *
 * Token ausente ou inválido: deixa passar: authMiddleware, que roda depois
 * em cada rota, é quem trata autenticação de fato.
 */
function bloquearAppPWA(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    const permissoes = decoded.permissoes || [];
    if (decoded.app === "pwa" && !permissoes.includes("ADMIN_MASTER")) {
      return res.status(403).json({
        message: "Este recurso não está disponível no aplicativo do instalador.",
      });
    }
    return next();
  } catch {
    return next();
  }
}

module.exports = bloquearAppPWA;
