const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const svc = require("../services/categoriaService");

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const categorias = await svc.listar(req.user.empresa_id);
    return res.json({ categorias });
  } catch (err) {
    return res.status(500).json({ message: "Erro ao listar categorias." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const cat = await svc.criar(req.user.empresa_id, req.body);
    return res.status(201).json({ categoria: cat });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const cat = await svc.atualizar(req.params.id, req.user.empresa_id, req.body);
    return res.json({ categoria: cat });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await svc.excluir(req.params.id, req.user.empresa_id);
    return res.json({ message: "Categoria removida." });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
