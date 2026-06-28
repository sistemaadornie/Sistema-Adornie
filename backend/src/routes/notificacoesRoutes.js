const express = require("express");
const db = require("../database/db");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const { isInstaladorPuro, isComercialPuro } = require("../services/permissionService");
const { criarNotificacao } = require("../services/notificacaoService");

const router = express.Router();

/* ── LISTAR ── */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId, permissoes } = req.user;

    let result;

    if (isInstaladorPuro(permissoes) || isComercialPuro(permissoes)) {
      /* Instaladores e vendedores: apenas notificações endereçadas diretamente a eles.
         Notificações globais (usuario_id = NULL) são exclusivas de admins/operadores.
         As individuais já são enviadas corretamente pelo serviço de agendamentos. */
      result = await db.query(
        `SELECT * FROM notificacoes
         WHERE empresa_id = $1
           AND usuario_id = $2
         ORDER BY criado_em DESC
         LIMIT 60`,
        [empresa_id, userId]
      );
    } else {
      /* Admins / Operadores: globais (NULL) + direcionadas a eles */
      result = await db.query(
        `SELECT * FROM notificacoes
         WHERE empresa_id = $1
           AND (usuario_id IS NULL OR usuario_id = $2)
         ORDER BY criado_em DESC
         LIMIT 60`,
        [empresa_id, userId]
      );
    }

    return res.json({ notificacoes: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar notificações." });
  }
});

/* ── CRIAR ── apenas operadores e admins podem criar notificações manualmente */
router.post(
  "/",
  authMiddleware,
  permissionMiddleware(["OPERADOR_AGENDA", "ADMIN_MASTER"]),
  async (req, res) => {
    try {
      const { empresa_id } = req.user;
      const {
        tipo = "sistema",
        titulo,
        mensagem,
        link,
        icone = "info",
        usuario_id = null,
      } = req.body;

      if (!titulo) return res.status(400).json({ message: "Título obrigatório." });
      if (titulo.length > 200) return res.status(400).json({ message: "Título muito longo (máx. 200 caracteres)." });

      // link deve ser interno (começa com /) ou nulo — previne phishing via notificação
      if (link !== undefined && link !== null && !String(link).startsWith("/")) {
        return res.status(400).json({ message: "O link deve ser uma rota interna (ex: /agendamentos)." });
      }

      // usuario_id deve pertencer à mesma empresa — previne IDOR
      if (usuario_id !== null) {
        const check = await db.query(
          `SELECT 1 FROM usuarios WHERE id=$1 AND empresa_id=$2 LIMIT 1`,
          [usuario_id, empresa_id]
        );
        if (!check.rows.length) {
          return res.status(400).json({ message: "Usuário de destino não encontrado." });
        }
      }

      const notificacao = await criarNotificacao({
        empresaId: empresa_id,
        usuarioId: usuario_id,
        tipo,
        titulo,
        mensagem: mensagem || null,
        link: link || null,
        icone,
      });
      return res.status(201).json({ notificacao });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Erro ao criar notificação." });
    }
  }
);

/* ── MARCAR TODAS COMO LIDAS ── */
router.put("/lidas", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    await db.query(
      `UPDATE notificacoes SET lida = TRUE
       WHERE empresa_id = $1
         AND (usuario_id IS NULL OR usuario_id = $2)
         AND lida = FALSE`,
      [empresa_id, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro." });
  }
});

/* ── MARCAR UMA COMO LIDA ── */
router.put("/:id/lida", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    await db.query(
      `UPDATE notificacoes SET lida = TRUE
       WHERE id = $1 AND empresa_id = $2
         AND (usuario_id IS NULL OR usuario_id = $3)`,
      [req.params.id, empresa_id, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro." });
  }
});

/* ── LIMPAR TODAS ── */
router.delete("/", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    await db.query(
      `DELETE FROM notificacoes
       WHERE empresa_id = $1
         AND (usuario_id IS NULL OR usuario_id = $2)`,
      [empresa_id, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro." });
  }
});

/* ── EXCLUIR ── */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { empresa_id, id: userId } = req.user;
    await db.query(
      `DELETE FROM notificacoes
       WHERE id = $1 AND empresa_id = $2
         AND (usuario_id IS NULL OR usuario_id = $3)`,
      [req.params.id, empresa_id, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro." });
  }
});

module.exports = router;
