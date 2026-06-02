const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const permissionMiddleware = require("../middlewares/permissionMiddleware");
const svc = require("../services/prazosService");

const router = express.Router();

// GET /pedidos/config/prazos
router.get("/", authMiddleware, async (req, res) => {
  try {
    const prazos = await svc.listarPrazos(req.user.empresa_id);
    return res.json({ prazos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar prazos por categoria." });
  }
});

// PUT /pedidos/config/prazos (restrito a ADMIN_MASTER ou OPERADOR_AGENDA)
router.put("/", authMiddleware, permissionMiddleware(["ADMIN_MASTER", "OPERADOR_AGENDA"]), async (req, res) => {
  try {
    const { prazos } = req.body;
    if (!prazos || !Array.isArray(prazos)) {
      return res.status(400).json({ message: "O corpo da requisição deve conter o array 'prazos'." });
    }

    const salvos = [];
    for (const p of prazos) {
      const salvo = await svc.salvarPrazo(req.user.empresa_id, p);
      salvos.push(salvo);
    }

    return res.json({ message: "Prazos de categoria salvos com sucesso!", prazos: salvos });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao salvar prazos." });
  }
});

// POST /pedidos/config/prazos/validar (autenticado)
router.post("/validar", authMiddleware, async (req, res) => {
  try {
    const { data, itens } = req.body;
    if (!data) {
      return res.status(400).json({ message: "O campo 'data' é obrigatório." });
    }
    
    const itemIds = (itens || []).map(Number).filter(Boolean);
    const validacao = await svc.validarPrazoInstalacao(req.user.empresa_id, data, itemIds);
    return res.json(validacao);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao validar prazo de instalação." });
  }
});

module.exports = router;

