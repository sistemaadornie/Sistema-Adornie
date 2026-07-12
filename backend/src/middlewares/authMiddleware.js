const jwt = require("jsonwebtoken");
const db  = require("../database/db");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token não fornecido." });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Rejeita refresh tokens usados como access tokens
    if (decoded.type === "refresh") {
      return res.status(401).json({ message: "Token inválido." });
    }

    // Tokens novos carregam permissoes + perfil no payload — sem query no banco
    if (decoded.permissoes) {
      req.user = {
        id:            decoded.id,
        email:         decoded.email,
        nome_completo: decoded.nome_completo,
        foto_url:      decoded.foto_url ?? null,
        status:        decoded.status,
        empresa_id:    decoded.empresa_id,
        setor_id:      decoded.setor_id,
        permissoes:    decoded.permissoes,
        app:           decoded.app ?? null,
      };
      return next();
    }

    // Tokens legados (sem permissoes no payload) — busca no banco uma última vez
    // Removível após todos os tokens legados expirarem (máx JWT_EXPIRY após deploy)
    const [usuarioRes, permRes] = await Promise.all([
      db.query(
        `SELECT id, email, nome_completo, foto_url, status, empresa_id, setor_id
           FROM usuarios WHERE id=$1 LIMIT 1`,
        [decoded.id]
      ),
      db.query(
        `SELECT COALESCE(p.codigo, p.nome) AS codigo
           FROM usuario_permissoes up
           JOIN permissoes p ON p.id=up.permissao_id
          WHERE up.usuario_id=$1`,
        [decoded.id]
      ),
    ]);

    if (!usuarioRes.rows.length) {
      return res.status(401).json({ message: "Usuário não encontrado." });
    }

    const u = usuarioRes.rows[0];
    if (u.status !== "aprovado") {
      return res.status(403).json({ message: "Usuário sem acesso liberado. Aguarde a aprovação." });
    }

    req.user = {
      id:            u.id,
      email:         u.email,
      nome_completo: u.nome_completo,
      foto_url:      u.foto_url,
      status:        u.status,
      empresa_id:    u.empresa_id,
      setor_id:      u.setor_id,
      permissoes:    permRes.rows.map((p) => p.codigo),
      app:           decoded.app ?? null,
    };
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expirado. Renove a sessão.", code: "TOKEN_EXPIRED" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Token inválido." });
    }
    console.error("[authMiddleware] Erro inesperado:", error);
    return res.status(500).json({ message: "Erro interno de autenticação." });
  }
}

module.exports = authMiddleware;
