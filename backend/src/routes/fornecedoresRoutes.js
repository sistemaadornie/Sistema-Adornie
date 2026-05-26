const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const fornecedorService = require("../services/fornecedorService");

const router = express.Router();

router.get("/categorias", authMiddleware, async (req, res) => {
  try {
    const categorias = await fornecedorService.listarCategorias(req.user.empresa_id);
    return res.json({ categorias });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar categorias." });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const fornecedores = await fornecedorService.listar(req.user.empresa_id, req.query);
    return res.json({ fornecedores });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao listar fornecedores." });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const fornecedor = await fornecedorService.buscar(req.params.id, req.user.empresa_id);
    if (!fornecedor) return res.status(404).json({ message: "Fornecedor não encontrado." });
    return res.json({ fornecedor });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao buscar fornecedor." });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const fornecedor = await fornecedorService.criar(req.user.empresa_id, req.user.id, req.body);
    return res.status(201).json({ message: "Fornecedor cadastrado!", fornecedor });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao cadastrar fornecedor." });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const fornecedor = await fornecedorService.atualizar(req.params.id, req.user.empresa_id, req.body);
    return res.json({ message: "Fornecedor atualizado!", fornecedor });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao atualizar fornecedor." });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await fornecedorService.excluir(req.params.id, req.user.empresa_id);
    return res.json({ message: "Fornecedor removido." });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ message: err.message || "Erro ao excluir fornecedor." });
  }
});

module.exports = router;
